import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client';
import { getAgencyAccess, lockAgencyAccess, AgencyAccessError } from './agency-access';
import { connectAccountStatus, connectConfiguration } from './agency-payments';
import { getConnectedCatalog } from './connected-catalog';
import { applicationFeeConfiguration, calculateApplicationFee } from './application-fees';

export class FunnelPriceError extends Error {}
export interface FunnelPriceProvider { account(id: string): Promise<unknown>; price(accountId: string, priceId: string): Promise<unknown> }
const currencies = { usd: 2, eur: 2, gbp: 2, inr: 2, cad: 2, aud: 2, jpy: 0 } as const;
const priceSchema = z.object({
  id: z.string(), active: z.literal(true), livemode: z.literal(false), type: z.literal('one_time'), billing_scheme: z.literal('per_unit'),
  currency: z.enum(['usd', 'eur', 'gbp', 'inr', 'cad', 'aud', 'jpy']), unit_amount: z.number().int().min(1).max(99999999), unit_amount_decimal: z.string(),
  custom_unit_amount: z.null(), transform_quantity: z.null(), recurring: z.null(),
  tax_behavior: z.enum(['inclusive', 'exclusive', 'unspecified']),
  product: z.object({ id: z.string(), active: z.literal(true), livemode: z.literal(false), name: z.string().max(512) }),
});
export async function checkFunnelPrice(db: PrismaClient, actor: string, input: unknown, env: Readonly<Record<string, string | undefined>>, factory: (key: string) => FunnelPriceProvider) {
  const data = z.object({ agencyId: z.string().min(1).max(191), priceId: z.string().max(191).regex(/^price_[A-Za-z0-9]+$/) }).strict().parse(input);
  const access = await getAgencyAccess(db, actor, data.agencyId, 'payments');
  if (!access) throw new AgencyAccessError('Agency unavailable.');
  const accountId = access.agency.stripeConnectAccountId;
  if (!accountId) throw new FunnelPriceError('Connect a Stripe test account first.');
  const config = connectConfiguration(env); const fee = applicationFeeConfiguration(env);
  const catalog = await getConnectedCatalog(db, actor, data.agencyId);
  const product = catalog?.products.find(item => item.active && item.prices.some(price => price.id === data.priceId && price.supported));
  if (!product) throw new FunnelPriceError('Synchronize the catalog and choose a supported active price.');
  const ledger = await db.connectAccountSync.findUnique({ where: { accountId } });
  if (!ledger?.linkedStartedAt) throw new FunnelPriceError('Authorize this account through Payments before checking prices.');
  const provider = factory(config.key);
  const account = connectAccountStatus(await provider.account(accountId), accountId);
  if (!account.chargesEnabled || !account.payoutsEnabled || account.restricted) throw new FunnelPriceError('Resolve the connected account’s payment restrictions in Stripe first.');
  let price;
  try { price = priceSchema.parse(await provider.price(accountId, data.priceId)); }
  catch { throw new FunnelPriceError('This price could not be verified as an active fixed test price.'); }
  if (price.id !== data.priceId || price.product.id !== product.id || price.unit_amount_decimal !== String(price.unit_amount)) throw new FunnelPriceError('The product or price changed. Synchronize the catalog and try again.');
  await db.$transaction(async tx => {
    // Match the account-first lock order used by authorization and revocation.
    await tx.$queryRaw`SELECT accountId FROM ConnectAccountSync WHERE accountId = ${accountId} FOR UPDATE`;
    const latest = await lockAgencyAccess(tx, actor, data.agencyId, 'payments');
    const current = await tx.connectAccountSync.findUnique({ where: { accountId } });
    if (latest.agency.stripeConnectAccountId !== accountId || current?.linkedStartedAt?.getTime() !== ledger.linkedStartedAt!.getTime() || current?.revokedAt?.getTime() !== ledger.revokedAt?.getTime()) throw new FunnelPriceError('The Stripe connection changed. Check the price again.');
  }, { isolationLevel: 'ReadCommitted' });
  const calculation = calculateApplicationFee(price.unit_amount, fee.basisPoints);
  const format = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency, currencyDisplay: 'code', minimumFractionDigits: currencies[price.currency], maximumFractionDigits: currencies[price.currency] }).format(amount / 10 ** currencies[price.currency]);
  return { productName: price.product.name, priceId: price.id, currency: price.currency, amount: price.unit_amount, feeAmount: calculation.applicationFeeAmount,
    formattedAmount: format(price.unit_amount), formattedFee: format(calculation.applicationFeeAmount), feeRate: fee.percentage, taxBehavior: price.tax_behavior };
}
