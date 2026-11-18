'use server';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { CatalogError, syncConnectedCatalog } from '@/lib/connected-catalog';
import { stripeCatalogProvider } from '@/lib/stripe-connect';
import { stripeFunnelPriceProvider } from '@/lib/stripe-connect';
import { checkFunnelPrice, FunnelPriceError } from '@/lib/funnel-price-check';
import { ApplicationFeeConfigurationError } from '@/lib/application-fees';
import { getDb } from '@/lib/db';
import { requireWorkspaceUser } from '@/lib/workspace-user';
import { AgencyAccessError } from '@/lib/agency-access';
import { ConnectConfigurationError } from '@/lib/agency-payments';
import { beginConnectOAuth, ConnectOAuthError } from '@/lib/connect-oauth';

export async function startConnectAction(_previous: { message: string }, data: FormData) {
  await auth.protect();
  const user = await requireWorkspaceUser();
  let destination: string;
  try {
    const agencyId = data.get('agencyId');
    if (typeof agencyId !== 'string' || !agencyId || agencyId.length > 191) throw new AgencyAccessError('Agency unavailable.');
    destination = await beginConnectOAuth(getDb(), user.id, agencyId, process.env);
  } catch (error) {
    return { message: error instanceof AgencyAccessError || error instanceof ConnectConfigurationError || error instanceof ConnectOAuthError ? error.message : 'Authorization could not be started. Please try again.' };
  }
  redirect(destination);
}

export async function syncCatalogAction(_previous: { message: string }, data: FormData) {
  await auth.protect();
  const user = await requireWorkspaceUser();
  try {
    const agencyId = data.get('agencyId');
    if (typeof agencyId !== 'string' || !agencyId || agencyId.length > 191) throw new AgencyAccessError('Agency unavailable.');
    const result = await syncConnectedCatalog(getDb(), user.id, agencyId, process.env, stripeCatalogProvider);
    revalidatePath(`/agency/${agencyId}/payments`);
    return { message: `Synchronized ${result.products} products and ${result.prices} prices.` };
  } catch (error) {
    return { message: error instanceof AgencyAccessError || error instanceof ConnectConfigurationError || error instanceof CatalogError ? error.message : 'Products could not be synchronized. Your previous catalog is unchanged.' };
  }
}

export async function checkPriceAction(_previous: { message: string }, form: FormData) {
  await auth.protect(); const user = await requireWorkspaceUser();
  try {
    const result = await checkFunnelPrice(getDb(), user.id, { agencyId: form.get('agencyId'), priceId: form.get('priceId') }, process.env, stripeFunnelPriceProvider);
    return { message: `${result.productName}: ${result.formattedAmount} for one unit. Platform fee on that amount: ${result.formattedFee} (${result.feeRate}). Tax treatment: ${result.taxBehavior}. This is a current price check, not a payment or reserved quote. Taxes, shipping and discounts are not calculated here.` };
  } catch (error) {
    return { message: error instanceof AgencyAccessError || error instanceof FunnelPriceError || error instanceof ConnectConfigurationError || error instanceof ApplicationFeeConfigurationError ? error.message : 'The price could not be checked. Please try again.' };
  }
}
