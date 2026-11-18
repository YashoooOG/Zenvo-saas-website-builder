'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@clerk/nextjs/server';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { getDb } from '@/lib/db';
import { AgencyAccessError } from '@/lib/agency-access';
import { billingConfiguration, BillingConfigurationError } from '@/lib/billing-plan';
import { BillingReconciliationError, reconcileAgencyBilling } from '@/lib/billing-reconciliation';
import { stripeReconciliationProvider } from '@/lib/stripe-reconciliation';
import { checkoutConfiguration, CheckoutError, startAgencyCheckout } from '@/lib/checkout';
import { stripeCheckoutProvider } from '@/lib/stripe-checkout';
import { BillingPortalError, openAgencyPortal, portalConfiguration } from '@/lib/billing-portal';
import { stripePortalProvider } from '@/lib/stripe-portal';

export async function startCheckoutAction(_previous: { message: string }, formData: FormData) {
  await auth.protect();
  const user = await requireWorkspaceUser();
  let url: string;
  try {
    const agencyId = formData.get('agencyId');
    if (typeof agencyId !== 'string' || agencyId.length > 191) throw new AgencyAccessError('Agency unavailable.');
    const config = checkoutConfiguration(process.env);
    url = await startAgencyCheckout(getDb(), user.id, agencyId, process.env, stripeCheckoutProvider(config.key));
  } catch (error) {
    if (error instanceof AgencyAccessError || error instanceof CheckoutError || error instanceof BillingConfigurationError) return { message: error.message };
    return { message: 'Checkout could not be opened. Please retry. Your subscription status will be confirmed by Stripe.' };
  }
  redirect(url);
}

export async function openPortalAction(_previous: { message: string }, formData: FormData) {
  await auth.protect();
  const user = await requireWorkspaceUser();
  let url: string;
  try {
    const agencyId = formData.get('agencyId');
    if (typeof agencyId !== 'string' || !agencyId || agencyId.length > 191) throw new AgencyAccessError('Agency unavailable.');
    const config = portalConfiguration(process.env);
    url = await openAgencyPortal(getDb(), user.id, agencyId, process.env, stripePortalProvider(config.key));
  } catch (error) {
    if (error instanceof AgencyAccessError || error instanceof BillingPortalError) return { message: error.message };
    return { message: 'Billing management could not be opened. Please try again.' };
  }
  redirect(url);
}

export async function refreshBillingAction(_previous: { message: string }, formData: FormData) {
  await auth.protect();
  const user = await requireWorkspaceUser();
  try {
    const agencyId = formData.get('agencyId');
    if (typeof agencyId !== 'string' || !agencyId || agencyId.length > 191) throw new AgencyAccessError('Agency unavailable.');
    const config = billingConfiguration(process.env);
    const result = await reconcileAgencyBilling(getDb(), user.id, agencyId, process.env, stripeReconciliationProvider(config.key));
    revalidatePath(`/agency/${agencyId}/billing`);
    return { message: result.count ? 'Subscription status refreshed from Stripe.' : 'Stripe confirmed no subscriptions for this agency.' };
  } catch (error) {
    if (error instanceof AgencyAccessError || error instanceof BillingConfigurationError || error instanceof BillingReconciliationError) return { message: error.message };
    return { message: 'Billing status could not be refreshed. Existing status was preserved. Please try again.' };
  }
}
