import Stripe from 'stripe';
import { createDatabaseClient } from '../src/lib/database-client';
import { BillingRecoveryError, parseRecoveryArguments, recoverAgencyCheckout, type RecoveryProvider } from '../src/lib/billing-recovery';
import { AgencyAccessError } from '../src/lib/agency-access';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: bun run billing:recover --owner USER_ID --agency AGENCY_ID [--customer cus_ID | --session cs_test_ID] [--apply --expect PREVIEW_FINGERPRINT]\nDefault is read-only. Local inspection needs no Stripe key; candidate verification requires a test key. No provider writes or recovery-key resets are performed.');
} else {
  let db: ReturnType<typeof createDatabaseClient> | undefined;
  try {
    const input = parseRecoveryArguments(args);
    let provider: RecoveryProvider | undefined;
    if (input.customerId || input.sessionId) {
      const key = process.env.STRIPE_SECRET_KEY?.trim();
      if (!key || !/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key)) throw new BillingRecoveryError('Configure a Stripe test key to verify a candidate.');
      const stripe = new Stripe(key, { timeout: 10000, maxNetworkRetries: 0 });
      provider = {
        customer: id => stripe.customers.retrieve(id),
        session: id => stripe.checkout.sessions.retrieve(id, { expand: ['line_items'] }),
      };
    }
    db = createDatabaseClient(process.env.DATABASE_URL);
    console.log(JSON.stringify(await recoverAgencyCheckout(db, input, provider), null, 2));
  } catch (error) {
    console.error(error instanceof BillingRecoveryError || error instanceof AgencyAccessError ? error.message : 'Recovery failed verification or could not complete. No repair was committed.');
    process.exitCode = 1;
  } finally { await db?.$disconnect(); }
}
