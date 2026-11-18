'use client';

import { useActionState } from 'react';
import { startConnectAction } from '@/app/agency/[agencyId]/payments/actions';

export function ConnectForm({ agencyId }: { agencyId: string }) {
  const [state, action, pending] = useActionState(startConnectAction, { message: '' });
  return <form action={action}><input type="hidden" name="agencyId" value={agencyId} />
    <button className="action" type="submit" disabled={pending}>{pending ? 'Opening Stripe...' : 'Connect Stripe test account'}</button>
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
