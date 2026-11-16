import { z } from 'zod';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { getSubAccountAccess, lockSubAccountWrite } from './subaccounts';
import { AgencyAccessError } from './agency-access';
export class PipelineConflict extends Error {}
const id = z.string().min(1).max(191);
const name = z.string().trim().min(2).max(191);
const createSchema = z.object({ subAccountId: id, name, creationKey: z.uuid() }).strict();
const scope = z.object({ subAccountId: id, pipelineId: id, revision: z.number().int().nonnegative() });
const mutationSchema = z.discriminatedUnion('operation', [
  scope.extend({ operation: z.literal('add-lane'), name }).strict(),
  scope.extend({ operation: z.literal('rename-lane'), laneId: id, name }).strict(),
  scope.extend({ operation: z.literal('create-ticket'), laneId: id, title: name, description: z.string().trim().max(5000) }).strict(),
  scope.extend({ operation: z.literal('move-ticket'), ticketId: id, laneId: id, direction: z.enum(['UP', 'DOWN', 'END']) }).strict(),
]);
const options = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };
export async function listPipelines(db: PrismaClient, actorId: string, subAccountId: string) {
  const access = await getSubAccountAccess(db, actorId, subAccountId);
  if (!access) return null;
  const pipelines = await db.pipeline.findMany({ where: { subAccountId }, select: { id: true, name: true, _count: { select: { lanes: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return { access, pipelines };
}
export async function getPipelineBoard(db: PrismaClient, actorId: string, subAccountId: string, pipelineId: string) {
  const access = await getSubAccountAccess(db, actorId, subAccountId);
  if (!access) return null;
  const pipeline = await db.pipeline.findFirst({ where: { id: pipelineId, subAccountId }, select: { id: true, name: true, revision: true, lanes: { orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true, name: true, tickets: { orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true, title: true, description: true } } } } } });
  return pipeline ? { access, pipeline } : null;
}
export async function createPipeline(db: PrismaClient, actorId: string, input: unknown) {
  const data = createSchema.parse(input);
  return db.$transaction(async tx => {
    await lockSubAccountWrite(tx, actorId, data.subAccountId);
    const existing = await tx.pipeline.findUnique({ where: { subAccountId_creationKey: { subAccountId: data.subAccountId, creationKey: data.creationKey } } });
    if (existing) return existing;
    if (await tx.pipeline.count({ where: { subAccountId: data.subAccountId } }) >= 20) throw new PipelineConflict('This workspace has reached its 20-board limit.');
    const pipeline = await tx.pipeline.create({ data });
    await tx.lane.createMany({ data: ['To do', 'In progress', 'Done'].map((name, position) => ({ name, position, subAccountId: data.subAccountId, pipelineId: pipeline.id })) });
    return pipeline;
  }, options);
}
export async function mutatePipeline(db: PrismaClient, actorId: string, input: unknown) {
  const data = mutationSchema.parse(input);
  return db.$transaction(async tx => {
    await lockSubAccountWrite(tx, actorId, data.subAccountId);
    const pipeline = await tx.pipeline.findFirst({ where: { id: data.pipelineId, subAccountId: data.subAccountId } });
    if (!pipeline) throw new AgencyAccessError('Board unavailable.');
    if (pipeline.revision !== data.revision) throw new PipelineConflict('This board changed in another tab. Reload before trying again.');
    const where = { subAccountId: data.subAccountId, pipelineId: data.pipelineId };
    const lanes = await tx.lane.findMany({ where, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
    if (data.operation === 'add-lane') {
      if (lanes.length >= 20) throw new PipelineConflict('This board has reached its 20-lane limit.');
      await tx.lane.create({ data: { ...where, name: data.name, position: (lanes.at(-1)?.position ?? -1) + 1 } });
    } else {
      const lane = lanes.find(lane => lane.id === data.laneId);
      if (!lane) throw new AgencyAccessError('Lane unavailable.');
      if (data.operation === 'rename-lane') {
        await tx.lane.update({ where: { id: lane.id }, data: { name: data.name } });
      } else if (data.operation === 'create-ticket') {
        if (await tx.ticket.count({ where }) >= 200) throw new PipelineConflict('This board has reached its 200-ticket limit.');
        const last = await tx.ticket.findFirst({ where: { ...where, laneId: lane.id }, orderBy: { position: 'desc' }, select: { position: true } });
        await tx.ticket.create({ data: { ...where, laneId: lane.id, title: data.title, description: data.description || null, position: (last?.position ?? -1) + 1 } });
      } else {
        const ticket = await tx.ticket.findFirst({ where: { ...where, id: data.ticketId } });
        if (!ticket) throw new AgencyAccessError('Ticket unavailable.');
        if (data.direction !== 'END' && ticket.laneId !== lane.id) throw new PipelineConflict('Choose a lane or move within the current lane.');
        const source = await tx.ticket.findMany({ where: { ...where, laneId: ticket.laneId }, orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true } });
        if (lane.id === ticket.laneId) {
          const index = source.findIndex(item => item.id === ticket.id);
          const target = data.direction === 'END' ? source.length - 1 : index + (data.direction === 'UP' ? -1 : 1);
          if (target < 0 || target >= source.length || target === index) return pipeline.revision;
          source.splice(index, 1); source.splice(target, 0, { id: ticket.id });
          for (const [position, item] of source.entries()) await tx.ticket.update({ where: { id: item.id }, data: { position } });
        } else {
          const destination = await tx.ticket.findMany({ where: { ...where, laneId: lane.id }, orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true } });
          for (const [position, item] of source.filter(item => item.id !== ticket.id).entries()) await tx.ticket.update({ where: { id: item.id }, data: { position } });
          for (const [position, item] of [...destination, { id: ticket.id }].entries()) await tx.ticket.update({ where: { id: item.id }, data: { laneId: lane.id, position } });
        }
      }
    }
    return (await tx.pipeline.update({ where: { id: pipeline.id }, data: { revision: { increment: 1 } } })).revision;
  }, options);
}
