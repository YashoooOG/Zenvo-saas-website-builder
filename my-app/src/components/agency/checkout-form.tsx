'use client';

import { useActionState } from 'react';
import { startCheckoutAction } from '@/app/agency/[agencyId]/billing/actions';

export function CheckoutForm({ agencyId }: { agencyId: string }) {
  const [state, action, pending] = useActionState(startCheckoutAction, { message: '' });
  return <form action={action}>
    <input type="hidden" name="agencyId" value={agencyId} />
    <button type="submit" className="action" disabled={pending}>{pending ? 'Opening checkout...' : 'Continue to test checkout'}</button>
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
