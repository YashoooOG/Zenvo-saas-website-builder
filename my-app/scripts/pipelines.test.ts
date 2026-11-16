import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../src/lib/database-client';
import { createAgency } from '../src/lib/agencies';
import { createSubAccount } from '../src/lib/subaccounts';
import { emptyAgencyValues } from '../src/lib/agency-validation';
import { AgencyAccessError } from '../src/lib/agency-access';
import { createPipeline, listPipelines, getPipelineBoard, mutatePipeline, PipelineConflict } from '../src/lib/pipelines';
const db = createDatabaseClient(process.env.DATABASE_URL);
const prefix = `pipeline_${randomUUID()}`;
const [owner, admin, member, guest, outsider] = ['owner','admin','member','guest','outsider'].map(role => `${prefix}_${role}`);
const ids = [owner, admin, member, guest, outsider];
let agencyId: string, subAccountId: string, siblingId: string, pipelineId: string, otherPipelineId: string;
let laneId: string, destinationId: string;
before(async () => {
  await db.user.createMany({ data: ids.map(id => ({ id })) });
  agencyId = (await createAgency(db, owner, { ...emptyAgencyValues, name: 'Pipeline fixture', creationKey: randomUUID() })).id;
  await db.agencyMembership.createMany({ data: [{ agencyId, userId: admin, role: 'ADMIN' }, { agencyId, userId: member, role: 'MEMBER' }, { agencyId, userId: guest, role: 'CLIENT' }] });
  subAccountId = (await createSubAccount(db, owner, { agencyId, name: 'Project client', creationKey: randomUUID() })).id;
  siblingId = (await createSubAccount(db, owner, { agencyId, name: 'Other client', creationKey: randomUUID() })).id;
  await db.subAccountMembership.createMany({ data: [{ agencyId, subAccountId, userId: member, role: 'MEMBER' }, { agencyId, subAccountId, userId: guest, role: 'GUEST' }] });
});
after(async () => { try { await db.agency.deleteMany({ where: { ownerId: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: ids } } }); } finally { await db.$disconnect(); } });
async function context() { return { subAccountId, pipelineId, revision: (await db.pipeline.findUniqueOrThrow({ where: { id: pipelineId } })).revision }; }
const board = () => getPipelineBoard(db, owner, subAccountId, pipelineId);
test('board creation is idempotent under concurrency with three ordered initial lanes', async () => {
  const input = { subAccountId, name: 'Website launch', creationKey: randomUUID() };
  const results = await Promise.all([createPipeline(db, owner, input), createPipeline(db, admin, input)]);
  assert.equal(results[0].id, results[1].id); pipelineId = results[0].id;
  const result = (await board())!;
  assert.deepEqual(result.pipeline.lanes.map(lane => lane.name), ['To do','In progress','Done']);
  laneId = result.pipeline.lanes[0].id; destinationId = result.pipeline.lanes[1].id;
  otherPipelineId = (await createPipeline(db, owner, { ...input, subAccountId: siblingId })).id;
  await assert.rejects(createPipeline(db, guest, input), AgencyAccessError);
  await assert.rejects(createPipeline(db, outsider, input), AgencyAccessError);
  await assert.rejects(createPipeline(db, owner, { ...input, name: ' ' }));
});
test('boards are tenant scoped and guests can read without mutation rights', async () => {
  assert.equal((await listPipelines(db, member, subAccountId))?.pipelines.length, 1);
  assert.ok(await getPipelineBoard(db, guest, subAccountId, pipelineId));
  assert.equal(await getPipelineBoard(db, member, siblingId, otherPipelineId), null);
  assert.equal(await getPipelineBoard(db, owner, subAccountId, otherPipelineId), null);
  assert.equal(await listPipelines(db, outsider, subAccountId), null);
  await assert.rejects(mutatePipeline(db, guest, { ...await context(), operation: 'add-lane', name: 'Forbidden' }), AgencyAccessError);
});
test('tickets persist in order and reject sibling-lane targets and invalid descriptions', async () => {
  for (const title of ['First task','Second task','Third task']) await mutatePipeline(db, member, { ...await context(), operation: 'create-ticket', laneId, title, description: 'A project brief' });
  const tickets = (await board())!.pipeline.lanes[0].tickets;
  assert.deepEqual(tickets.map(ticket => ticket.title), ['First task','Second task','Third task']);
  const siblingLane = await db.lane.findFirstOrThrow({ where: { pipelineId: otherPipelineId } });
  await assert.rejects(mutatePipeline(db, owner, { ...await context(), operation: 'create-ticket', laneId: siblingLane.id, title: 'Wrong tenant', description: '' }), AgencyAccessError);
  await assert.rejects(mutatePipeline(db, owner, { ...await context(), operation: 'create-ticket', laneId, title: 'Too long', description: 'x'.repeat(5001) }));
});
test('moves compact both lanes and preserve deterministic order within a lane', async () => {
  const [first, second, third] = (await board())!.pipeline.lanes[0].tickets;
  await mutatePipeline(db, member, { ...await context(), operation: 'move-ticket', ticketId: second.id, laneId: destinationId, direction: 'END' });
  let result = (await board())!;
  assert.deepEqual(result.pipeline.lanes[0].tickets.map(ticket => ticket.id), [first.id, third.id]);
  assert.equal(result.pipeline.lanes[1].tickets[0].id, second.id);
  await mutatePipeline(db, owner, { ...await context(), operation: 'move-ticket', ticketId: third.id, laneId, direction: 'UP' });
  result = (await board())!;
  assert.deepEqual(result.pipeline.lanes[0].tickets.map(ticket => ticket.id), [third.id, first.id]);
  await mutatePipeline(db, owner, { ...await context(), operation: 'move-ticket', ticketId: third.id, laneId, direction: 'END' });
  assert.deepEqual((await board())!.pipeline.lanes[0].tickets.map(ticket => ticket.id), [first.id, third.id]);
  const positions = await db.ticket.findMany({ where: { pipelineId, laneId }, orderBy: { position: 'asc' }, select: { position: true } });
  assert.deepEqual(positions.map(ticket => ticket.position), [0,1]);
  const before = await context();
  assert.equal(await mutatePipeline(db, owner, { ...before, operation: 'move-ticket', ticketId: first.id, laneId, direction: 'UP' }), before.revision);
});
test('simultaneous stale writes allow exactly one mutation and reject invalid moves', async () => {
  const input = { ...await context(), operation: 'create-ticket', laneId, title: 'One submission', description: '' };
  const outcomes = await Promise.allSettled([mutatePipeline(db, owner, input), mutatePipeline(db, admin, input)]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await db.ticket.count({ where: { pipelineId, title: 'One submission' } }), 1);
  await assert.rejects(mutatePipeline(db, owner, input), PipelineConflict);
  const ticket = (await board())!.pipeline.lanes[0].tickets[0];
  await assert.rejects(mutatePipeline(db, owner, { ...await context(), operation: 'move-ticket', ticketId: ticket.id, laneId: destinationId, direction: 'UP' }), PipelineConflict);
  await assert.rejects(mutatePipeline(db, owner, { ...await context(), operation: 'move-ticket', ticketId: 'missing', laneId, direction: 'END' }), AgencyAccessError);
});
test('lane additions and renames persist with bounded counts', async () => {
  await mutatePipeline(db, member, { ...await context(), operation: 'rename-lane', laneId, name: 'Backlog' });
  await mutatePipeline(db, admin, { ...await context(), operation: 'add-lane', name: 'Client review' });
  assert.deepEqual((await board())!.pipeline.lanes.map(lane => lane.name), ['Backlog','In progress','Done','Client review']);
  await db.lane.createMany({ data: Array.from({ length: 16 }, (_, i) => ({ subAccountId, pipelineId, name: `Limit lane ${i}`, position: i + 4 })) });
  await assert.rejects(mutatePipeline(db, owner, { ...await context(), operation: 'add-lane', name: 'Over limit' }), PipelineConflict);
});
test('drag placement supports before-ticket insertion and lane-end moves without duplicate positions', async () => {
  const fresh = await createPipeline(db, owner, { subAccountId, name: 'Placement tests', creationKey: randomUUID() });
  const lanes = (await getPipelineBoard(db, owner, subAccountId, fresh.id))!.pipeline.lanes;
  const ctx = async () => ({ subAccountId, pipelineId: fresh.id, revision: (await db.pipeline.findUniqueOrThrow({ where: { id: fresh.id } })).revision });
  for (const title of ['Alpha ticket','Beta ticket','Gamma ticket']) await mutatePipeline(db, owner, { ...await ctx(), operation: 'create-ticket', laneId: lanes[0].id, title, description: '' });
  const tickets = (await getPipelineBoard(db, owner, subAccountId, fresh.id))!.pipeline.lanes[0].tickets;
  await mutatePipeline(db, member, { ...await ctx(), operation: 'place-ticket', ticketId: tickets[2].id, laneId: lanes[0].id, beforeTicketId: tickets[0].id });
  assert.deepEqual((await getPipelineBoard(db, owner, subAccountId, fresh.id))!.pipeline.lanes[0].tickets.map(ticket => ticket.id), [tickets[2].id,tickets[0].id,tickets[1].id]);
  await mutatePipeline(db, member, { ...await ctx(), operation: 'place-ticket', ticketId: tickets[2].id, laneId: lanes[1].id, beforeTicketId: null });
  await mutatePipeline(db, member, { ...await ctx(), operation: 'place-ticket', ticketId: tickets[0].id, laneId: lanes[1].id, beforeTicketId: tickets[2].id });
  assert.deepEqual((await getPipelineBoard(db, owner, subAccountId, fresh.id))!.pipeline.lanes[1].tickets.map(ticket => ticket.id), [tickets[0].id,tickets[2].id]);
  const unchanged = await ctx();
  assert.equal(await mutatePipeline(db, owner, { ...unchanged, operation: 'place-ticket', ticketId: tickets[0].id, laneId: lanes[1].id, beforeTicketId: tickets[0].id }), unchanged.revision);
  await assert.rejects(mutatePipeline(db, owner, { ...await ctx(), operation: 'place-ticket', ticketId: tickets[1].id, laneId: lanes[2].id, beforeTicketId: tickets[0].id }), AgencyAccessError);
  await assert.rejects(mutatePipeline(db, guest, { ...await ctx(), operation: 'place-ticket', ticketId: tickets[0].id, laneId: lanes[0].id, beforeTicketId: null }), AgencyAccessError);
  const positions = await db.ticket.findMany({ where: { pipelineId: fresh.id, laneId: lanes[1].id }, orderBy: { position: 'asc' }, select: { position: true } });
  assert.deepEqual(positions.map(ticket => ticket.position), [0,1]);
});
test('editing preserves ticket identity and placement while rejecting stale or invalid details', async () => {
  const ticket = await db.ticket.findFirstOrThrow({ where: { pipelineId, laneId }, orderBy: { position: 'asc' } });
  const input = { ...await context(), operation: 'edit-ticket', ticketId: ticket.id, title: '  Revised project brief  ', description: 'Updated requirements' };
  await mutatePipeline(db, member, input);
  const updated = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
  assert.equal(updated.title, 'Revised project brief'); assert.equal(updated.description, 'Updated requirements');
  assert.equal(updated.laneId, ticket.laneId); assert.equal(updated.position, ticket.position); assert.equal(updated.value.toString(), ticket.value.toString());
  await assert.rejects(mutatePipeline(db, owner, input), PipelineConflict);
  await assert.rejects(mutatePipeline(db, owner, { ...input, ...await context(), title: ' ' }));
  await assert.rejects(mutatePipeline(db, guest, { ...input, ...await context() }), AgencyAccessError);
  await assert.rejects(mutatePipeline(db, owner, { ...input, ...await context(), pipelineId: otherPipelineId }), AgencyAccessError);
});
test('ticket removal requires confirmation, compacts order, and is tenant scoped', async () => {
  const ticket = await db.ticket.findFirstOrThrow({ where: { pipelineId, laneId }, orderBy: { position: 'asc' } });
  const input = { ...await context(), operation: 'delete-ticket', ticketId: ticket.id, confirmed: true };
  await assert.rejects(mutatePipeline(db, owner, { ...input, confirmed: false }));
  await assert.rejects(mutatePipeline(db, guest, input), AgencyAccessError);
  await assert.rejects(mutatePipeline(db, owner, { ...input, pipelineId: otherPipelineId }), AgencyAccessError);
  await mutatePipeline(db, member, input);
  assert.equal(await db.ticket.findUnique({ where: { id: ticket.id } }), null);
  await assert.rejects(mutatePipeline(db, owner, input), PipelineConflict);
  const remaining = await db.ticket.findMany({ where: { pipelineId, laneId }, orderBy: { position: 'asc' } });
  assert.deepEqual(remaining.map(item => item.position), remaining.map((_item, index) => index));
});
test('a concurrent drag and edit cannot overwrite each other', async () => {
  const ticket = await db.ticket.findFirstOrThrow({ where: { pipelineId, laneId } });
  const current = await context();
  const outcomes = await Promise.allSettled([
    mutatePipeline(db, owner, { ...current, operation: 'place-ticket', ticketId: ticket.id, laneId: destinationId, beforeTicketId: null }),
    mutatePipeline(db, member, { ...current, operation: 'edit-ticket', ticketId: ticket.id, title: 'Concurrent edit', description: '' }),
  ]);
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  const rejected = outcomes.find(outcome => outcome.status === 'rejected');
  assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof PipelineConflict);
});
test('archived clients, revoked assignments, and deleted owners cannot mutate boards', async () => {
  await db.subAccount.update({ where: { id: subAccountId }, data: { enabled: false } });
  assert.equal(await board(), null);
  await assert.rejects(mutatePipeline(db, owner, { ...await context(), operation: 'rename-lane', laneId, name: 'Blocked' }), AgencyAccessError);
  await db.subAccount.update({ where: { id: subAccountId }, data: { enabled: true } });
  await db.subAccountMembership.delete({ where: { subAccountId_userId: { subAccountId, userId: member } } });
  await assert.rejects(mutatePipeline(db, member, { ...await context(), operation: 'rename-lane', laneId, name: 'Blocked' }), AgencyAccessError);
  await db.user.update({ where: { id: owner }, data: { deletedAt: new Date() } });
  assert.equal(await getPipelineBoard(db, admin, subAccountId, pipelineId), null);
  await assert.rejects(mutatePipeline(db, admin, { ...await context(), operation: 'rename-lane', laneId, name: 'Blocked' }), AgencyAccessError);
});
