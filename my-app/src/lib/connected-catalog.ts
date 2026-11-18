import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client';
import { AgencyAccessError, getAgencyAccess, lockAgencyAccess } from './agency-access';
import { connectAccountStatus, connectConfiguration } from './agency-payments';
import { lockConnectAccount } from './connect-events';

export class CatalogError extends Error {}
export interface CatalogProvider {
  account(id: string): Promise<unknown>;
  products(id: string, cursor?: string): Promise<unknown>;
  prices(id: string, active: boolean, cursor?: string): Promise<unknown>;
}
const id = (prefix: string) => z.string().max(191).regex(new RegExp(`^${prefix}_[A-Za-z0-9]+$`));
const productSchema = z.object({ id: id('prod'), name: z.string().min(1).max(512), active: z.boolean(), livemode: z.literal(false) });
const priceSchema = z.object({
  id: id('price'), product: id('prod'), active: z.boolean(), livemode: z.literal(false),
  currency: z.string().regex(/^[a-z]{3}$/), type: z.enum(['one_time', 'recurring']),
  billing_scheme: z.enum(['per_unit', 'tiered']), unit_amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  unit_amount_decimal: z.string().nullable(), custom_unit_amount: z.unknown().nullable(), transform_quantity: z.unknown().nullable(),
});
const storedPrice = z.object({ id: id('price'), active: z.boolean(), currency: z.string(), amount: z.number().nullable(), type: z.enum(['one_time', 'recurring']), supported: z.boolean() });
const storedProducts = z.array(z.object({ id: id('prod'), name: z.string(), active: z.boolean(), prices: z.array(storedPrice) }));

async function collect<T extends { id: string }>(fetchPage: (cursor?: string) => Promise<unknown>, schema: z.ZodType<T>, deadline: number) {
  const rows: T[] = []; const seen = new Set<string>(); let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    if (Date.now() > deadline) throw new CatalogError('Catalog synchronization timed out. Please try again.');
    const result = z.object({ data: z.array(schema).max(100), has_more: z.boolean() }).parse(await fetchPage(cursor));
    for (const row of result.data) { if (seen.has(row.id)) throw new Error('Duplicate catalog object'); seen.add(row.id); rows.push(row); }
    if (!result.has_more) return rows;
    if (!result.data.length) throw new Error('Invalid catalog pagination');
    cursor = result.data.at(-1)!.id;
  }
  throw new CatalogError('This catalog exceeds the current synchronization limit. Your previous catalog is unchanged.');
}

export async function syncConnectedCatalog(db: PrismaClient, actorId: string, agencyId: string, env: Readonly<Record<string, string | undefined>>, providerFactory: (key: string) => CatalogProvider) {
  const access = await getAgencyAccess(db, actorId, agencyId, 'payments');
  if (!access) throw new AgencyAccessError('Agency unavailable.');
  const accountId = access.agency.stripeConnectAccountId;
  if (!accountId) throw new CatalogError('Connect a Stripe test account before synchronizing products.');
  const config = connectConfiguration(env); const token = randomUUID();
  const started = await db.$transaction(async tx => {
    const ledger = await lockConnectAccount(tx, accountId);
    const current = await lockAgencyAccess(tx, actorId, agencyId, 'payments');
    if (current.agency.stripeConnectAccountId !== accountId) throw new CatalogError('The Stripe connection changed. Start synchronization again.');
    await tx.agencyCatalog.upsert({ where: { agencyId }, create: { agencyId, syncToken: token }, update: { syncToken: token } });
    return { linked: ledger.linkedStartedAt?.getTime(), revoked: ledger.revokedAt?.getTime() };
  }, { isolationLevel: 'ReadCommitted' });
  const provider = providerFactory(config.key);
  // Remote reads stay outside transactions. The final claim prevents an older
  // request or a changed/revoked connection from replacing a newer snapshot.
  connectAccountStatus(await provider.account(accountId), accountId);
  const deadline = Date.now() + 30000;
  const products = await collect(cursor => provider.products(accountId, cursor), productSchema, deadline);
  const prices: z.infer<typeof priceSchema>[] = [];
  for (const active of [true, false]) {
    const batch = await collect(cursor => provider.prices(accountId, active, cursor), priceSchema, deadline);
    if (batch.some(price => price.active !== active)) throw new Error('Price activity mismatch');
    prices.push(...batch);
  }
  const productIds = new Set(products.map(product => product.id)); const priceIds = new Set<string>();
  for (const price of prices) {
    if (!productIds.has(price.product) || priceIds.has(price.id)) throw new CatalogError('The Stripe catalog changed during synchronization. Please try again.');
    priceIds.add(price.id);
  }
  const snapshot = products.map(product => ({ id: product.id, name: product.name, active: product.active,
    prices: prices.filter(price => price.product === product.id).map(price => ({ id: price.id, active: price.active, currency: price.currency,
      amount: price.unit_amount, type: price.type,
      supported: product.active && price.active && price.type === 'one_time' && price.billing_scheme === 'per_unit' && price.unit_amount !== null && price.unit_amount_decimal === String(price.unit_amount) && price.custom_unit_amount === null && price.transform_quantity === null,
    })),
  }));
  return db.$transaction(async tx => {
    const ledger = await lockConnectAccount(tx, accountId);
    const current = await lockAgencyAccess(tx, actorId, agencyId, 'payments');
    const claim = await tx.agencyCatalog.findUniqueOrThrow({ where: { agencyId } });
    if (current.agency.stripeConnectAccountId !== accountId || claim.syncToken !== token || ledger.linkedStartedAt?.getTime() !== started.linked || ledger.revokedAt?.getTime() !== started.revoked) throw new CatalogError('The connection or synchronization changed. Please synchronize again.');
    await tx.agencyCatalog.update({ where: { agencyId }, data: { accountId, products: snapshot, syncedAt: new Date() } });
    return { products: snapshot.length, prices: prices.length };
  }, { isolationLevel: 'ReadCommitted' });
}

export async function getConnectedCatalog(db: PrismaClient, actorId: string, agencyId: string) {
  const access = await getAgencyAccess(db, actorId, agencyId, 'payments');
  if (!access) throw new AgencyAccessError('Agency unavailable.');
  if (!access.agency.stripeConnectAccountId) return null;
  const row = await db.agencyCatalog.findUnique({ where: { agencyId } });
  if (!row?.syncedAt || row.accountId !== access.agency.stripeConnectAccountId) return null;
  const latest = await getAgencyAccess(db, actorId, agencyId, 'payments');
  if (!latest || latest.agency.stripeConnectAccountId !== row.accountId) throw new AgencyAccessError('Agency unavailable.');
  return { products: storedProducts.parse(row.products), syncedAt: row.syncedAt };
}
