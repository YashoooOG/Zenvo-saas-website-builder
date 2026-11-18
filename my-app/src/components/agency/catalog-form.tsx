'use client';
import { useActionState } from 'react';
import { syncCatalogAction } from '@/app/agency/[agencyId]/payments/actions';

export function CatalogForm({ agencyId }: { agencyId: string }) {
  const [state, action, pending] = useActionState(syncCatalogAction, { message: '' });
  return <form action={action}>
    <input type="hidden" name="agencyId" value={agencyId} />
    <button className="action" disabled={pending} type="submit">{pending ? 'Synchronizing products…' : 'Sync products from Stripe'}</button>
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
