'use client';
import { useActionState } from 'react';
import { checkPriceAction } from '@/app/agency/[agencyId]/payments/actions';

export function PriceCheckForm({ agencyId, priceId }: { agencyId: string; priceId: string }) {
  const [state, action, pending] = useActionState(checkPriceAction, { message: '' });
  return <form action={action}><input type="hidden" name="agencyId" value={agencyId} /><input type="hidden" name="priceId" value={priceId} /><button type="submit" className="text-action" disabled={pending}>{pending ? 'Checking Stripe…' : 'Check current price and fee'}</button>{state.message && <p role="status">{state.message}</p>}</form>;
}
