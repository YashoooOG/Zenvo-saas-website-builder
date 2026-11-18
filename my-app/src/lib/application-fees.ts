export class ApplicationFeeConfigurationError extends Error {}

// Deployment configuration belongs to the platform, never to a browser form or
// an agency-controlled setting. Blank is unconfigured; explicit 0 means no fee.
export function applicationFeeConfiguration(env: Readonly<Record<string, string | undefined>>) {
  const raw = env.ZENVO_APPLICATION_FEE_BPS?.trim();
  if (!raw || !/^(0|[1-9][0-9]{0,4})$/.test(raw) || Number(raw) > 10000) {
    throw new ApplicationFeeConfigurationError('Application fees are not configured. Set an integer rate from 0 to 10000 basis points on the server.');
  }
  const basisPoints = Number(raw);
  return { basisPoints, percentage: `${(basisPoints / 100).toFixed(2).replace(/\.?0+$/, '')}%` };
}

// Input must eventually come from server-verified Stripe pricing, in that
// currency's minor units. This helper does not validate a catalog or take payment.
export function calculateApplicationFee(amount: number, basisPoints: number) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Amount must be a nonnegative safe integer in minor units.');
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new RangeError('Fee rate must be an integer from 0 to 10000 basis points.');
  // BigInt avoids precision loss when amount * basisPoints exceeds MAX_SAFE_INTEGER.
  // Round down once on the charge total, never separately for each unit/item.
  const applicationFeeAmount = Number(BigInt(amount) * BigInt(basisPoints) / BigInt(10000));
  return { amount, applicationFeeAmount, remainderBeforeProcessingFees: amount - applicationFeeAmount };
}

export function applicationFeeSummary(env: Readonly<Record<string, string | undefined>>) {
  try { return { status: 'configured' as const, ...applicationFeeConfiguration(env) }; }
  catch { return { status: 'unconfigured' as const }; }
}
