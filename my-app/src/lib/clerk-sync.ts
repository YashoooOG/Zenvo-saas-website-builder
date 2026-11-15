import { z } from 'zod';
import { Prisma, type PrismaClient } from '../generated/prisma/client';

const timestamp = z.number().int().nonnegative().max(8640000000000000);
const identifier = z.string().min(1).max(191).regex(/^[a-zA-Z0-9_-]+$/);
const profile = z.object({
  id: identifier,
  updated_at: timestamp,
  first_name: z.string().max(128).nullable(),
  last_name: z.string().max(128).nullable(),
  image_url: z.string().url().max(4096).optional(),
  primary_email_address_id: z.string().nullable(),
  email_addresses: z.array(z.object({
    id: z.string(), email_address: z.string().email().max(320),
  })).max(100),
});
const deletion = z.object({ id: identifier, deleted: z.literal(true) });
const envelope = z.object({ type: z.string().max(64), timestamp });

export function parseUserEvent(value: unknown) {
  const event = envelope.parse(value);
  if (!['user.created', 'user.updated', 'user.deleted'].includes(event.type)) return null;
  const data = z.object({ data: z.unknown() }).parse(value).data;
  if (event.type === 'user.deleted') {
    const user = deletion.parse(data);
    return { id: user.id, type: event.type, version: BigInt(event.timestamp), deleted: true, email: null, name: null, imageUrl: null };
  }
  const user = profile.parse(data);
  const email = user.email_addresses.find(address => address.id === user.primary_email_address_id)?.email_address ?? null;
  return {
    id: user.id, type: event.type, version: BigInt(user.updated_at), deleted: false,
    email, name: Array.from([user.first_name, user.last_name].filter(Boolean).join(' ')).slice(0, 256).join('') || null,
    imageUrl: user.image_url ?? null,
  };
}

export type UserSyncEvent = NonNullable<ReturnType<typeof parseUserEvent>>;

export async function syncClerkUser(db: PrismaClient, eventId: string, event: UserSyncEvent) {
  identifier.parse(eventId);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async tx => {
        // Receipt and mutation commit together; a failed write remains retryable.
        await tx.clerkWebhookReceipt.create({ data: { id: eventId, type: event.type } });
        // Native MySQL upsert obtains a row lock even when the ID already exists.
        await tx.$executeRaw`INSERT INTO User (id, clerkUpdatedAt, createdAt, updatedAt)
          VALUES (${event.id}, 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
          ON DUPLICATE KEY UPDATE id = id`;
        // A locking read sees current committed state, not an older repeatable-
        // read snapshot established while another delivery created the row.
        const [user] = await tx.$queryRaw<Array<{ clerkUpdatedAt: bigint; deletedAt: Date | null }>>`
          SELECT clerkUpdatedAt, deletedAt FROM User WHERE id = ${event.id} FOR UPDATE`;
        if (!user) throw new Error('Locked user row is missing');
        // A Clerk ID is never reused. Deletion is terminal, even if delivered
        // before an update or an earlier create. Scrub profile PII on deletion.
        if (user.deletedAt || (!event.deleted && event.version <= user.clerkUpdatedAt)) return 'stale';
        await tx.user.update({ where: { id: event.id }, data: {
          email: event.email, name: event.name, imageUrl: event.imageUrl,
          clerkUpdatedAt: event.version,
          deletedAt: event.deleted ? new Date(Number(event.version)) : null,
        } });
        if (event.deleted) await tx.agencyMembership.deleteMany({ where: { userId: event.id } });
        return 'applied';
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002' && await db.clerkWebhookReceipt.findUnique({ where: { id: eventId } })) return 'duplicate';
        if (error.code === 'P2034' && attempt < 3) continue;
      }
      throw error;
    }
  }
  throw new Error('User synchronization retry limit reached');
}
