'use client';
import { useActionState, useId } from 'react';
import { funnelAction } from '@/app/subaccount/funnel-actions';

export function PageOfferForm({ scope, priceId, prices }: { scope: Record<string, string>; priceId: string; prices: { id: string; label: string }[] }) {
  const id = useId(); const [state, action, pending] = useActionState(funnelAction, { message: '' });
  return <form action={action} className="pipeline-form">
    {Object.entries(scope).map(([name, value]) => <input type="hidden" key={name} name={name} value={value} />)}
    <input type="hidden" name="operation" value="set-offer" />
    <label htmlFor={id}>Draft offer</label><select id={id} name="priceId" defaultValue={priceId} disabled={pending}>
      <option value="">No offer</option>{priceId && !prices.some(price => price.id === priceId) && <option value={priceId}>Unavailable selection — choose another price</option>}
      {prices.map(price => <option key={price.id} value={price.id}>{price.label}</option>)}
    </select>
    <p>Choose a supported price from Payments. Saving this selection does not change the published page. Checkout is not enabled yet.</p>
    <button type="submit" className="action" disabled={pending}>{pending ? 'Saving…' : 'Save draft offer'}</button>
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
