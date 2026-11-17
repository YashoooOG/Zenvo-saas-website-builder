'use client';

import { useActionState } from 'react';
import { openPortalAction } from '@/app/agency/[agencyId]/billing/actions';

export function PortalForm({ agencyId }: { agencyId: string }) {
  const [state, action, pending] = useActionState(openPortalAction, { message: '' });
  return <form action={action}>
    <input type="hidden" name="agencyId" value={agencyId} />
    <button type="submit" className="action" disabled={pending}>{pending ? 'Opening billing...' : 'Manage billing on Stripe'}</button>
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
