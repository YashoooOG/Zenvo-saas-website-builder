import { z } from 'zod';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { lockAgencyActors } from './agency-access';
import { connectAccountStatus } from './agency-payments';

const eventSchema = z.object({
  id: z.string().max(191).regex(/^evt_[A-Za-z0-9]+$/),
  account: z.string().max(191).regex(/^acct_[A-Za-z0-9]+$/),
  type: z.enum(['account.updated', 'account.application.deauthorized']),
  livemode: z.literal(false), created: z.number().int().min(0).max(253402300799),
  data: z.object({ object: z.object({ id: z.string(), object: z.string() }) }),
});
export type ConnectEvent = z.infer<typeof eventSchema>;
export function parseConnectEvent(raw: unknown, clientId: string): ConnectEvent | null {
  const envelope = z.object({ type: z.string(), livemode: z.boolean() }).parse(raw);
  if (envelope.livemode || !['account.updated', 'account.application.deauthorized'].includes(envelope.type)) return null;
  const event = eventSchema.parse(raw);
  if (event.type === 'account.updated') {
    if (event.data.object.object !== 'account' || event.data.object.id !== event.account) throw new Error('Account mismatch');
  } else if (event.data.object.object !== 'application' || event.data.object.id !== clientId) {
    return null;
  }
  return event;
}

// Always acquire this lock BEFORE user/agency locks, including OAuth completion.
// Keep revocation tombstones even when no agency is mapped yet.
export async function lockConnectAccount(tx: Prisma.TransactionClient, accountId: string) {
  // Prisma's MySQL upsert can be a read-then-insert. Use one atomic statement
  // so simultaneous first deliveries also acquire an exclusive row lock.
  await tx.$executeRaw`INSERT INTO ConnectAccountSync (accountId) VALUES (${accountId}) ON DUPLICATE KEY UPDATE accountId = ${accountId}`;
  return tx.connectAccountSync.findUniqueOrThrow({ where: { accountId } });
}

export async function syncConnectEvent(db: PrismaClient, event: ConnectEvent, retrieve: (id: string) => Promise<unknown>) {
  return db.$transaction(async tx => {
    const ledger = await lockConnectAccount(tx, event.account);
    if (await tx.connectWebhookReceipt.findUnique({ where: { id: event.id } })) return 'duplicate';
    const agency = await tx.agency.findUnique({ where: { stripeConnectAccountId: event.account } });
    if (agency) await lockAgencyActors(tx, agency.ownerId, agency.id);
    const current = agency && await tx.agency.findUnique({ where: { id: agency.id } });
    const mapped = current?.stripeConnectAccountId === event.account;
    if (event.type === 'account.application.deauthorized') {
      const revokedAt = new Date(event.created * 1000);
      if (!ledger.revokedAt || ledger.revokedAt < revokedAt) await tx.connectAccountSync.update({ where: { accountId: event.account }, data: { revokedAt } });
      // Stripe timestamps have second precision. Ambiguous same-second events
      // conservatively revoke; an owner can explicitly authorize again.
      if (mapped && (!ledger.linkedStartedAt || Math.floor(ledger.linkedStartedAt.getTime() / 1000) <= event.created)) {
        await tx.agency.update({ where: { id: current!.id }, data: { stripeConnectAccountId: null } });
        await tx.agencyCatalog.deleteMany({ where: { agencyId: current!.id } });
        await tx.connectAccountSync.update({ where: { accountId: event.account }, data: { status: Prisma.DbNull, syncedAt: new Date() } });
      }
    } else if (mapped) {
      // Never apply the event's stale account snapshot or recreate a mapping.
      const status = connectAccountStatus(await retrieve(event.account), event.account);
      await tx.connectAccountSync.update({ where: { accountId: event.account }, data: { status, syncedAt: new Date() } });
    }
    await tx.connectWebhookReceipt.create({ data: { id: event.id, accountId: event.account, type: event.type } });
    return mapped ? 'updated' : 'ignored';
  }, { isolationLevel: 'ReadCommitted', timeout: 20000, maxWait: 5000 });
}
