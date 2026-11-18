'use client';

import { useActionState } from 'react';
import { refreshBillingAction } from '@/app/agency/[agencyId]/billing/actions';

export function RefreshBillingForm({ agencyId }: { agencyId: string }) {
  const [state, action, pending] = useActionState(refreshBillingAction, { message: '' });
  return <form action={action}>
    <input type="hidden" name="agencyId" value={agencyId} />
    <button type="submit" className="text-action" disabled={pending}>{pending ? 'Refreshing status...' : 'Refresh status from Stripe'}</button>
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
