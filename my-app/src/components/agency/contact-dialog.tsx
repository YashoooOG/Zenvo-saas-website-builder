'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { mutatePipelineAction } from '@/app/subaccount/pipeline-actions';

type Contact = { id: string; name: string; email: string | null };
type Scope = { subAccountId: string; pipelineId: string; revision: number };
type Draft = { kind: 'edit' | 'delete'; name: string; email: string; revision: number };

export function ContactDialog({ contact, scope, disabled }: { contact: Contact; scope: Scope; disabled: boolean }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const id = useId();
  const router = useRouter();
  function open(kind: Draft['kind']) {
    setMessage('');
    setDraft({ kind, name: contact.name, email: contact.email ?? '', revision: scope.revision });
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || pending) return;
    const form = new FormData();
    for (const [key, value] of Object.entries({ ...scope, revision: draft.revision, operation: draft.kind === 'edit' ? 'edit-contact' : 'delete-contact', contactId: contact.id, name: draft.name, email: draft.email, confirmed: 'yes' })) form.set(key, String(value));
    startTransition(async () => {
      try {
        const result = await mutatePipelineAction({ success: false, message: '' }, form);
        if (result.success) setDraft(null);
        else setMessage(result.message);
      } catch { setMessage('The change could not be confirmed. Close and reload before trying again.'); }
    });
  }
  return <>
    <div className="contact-actions">
      <button type="button" className="text-action" disabled={disabled} onClick={() => open('edit')}>Edit<span className="sr-only"> contact {contact.name}</span></button>
      <button type="button" className="text-action" disabled={disabled} onClick={() => open('delete')}>Remove<span className="sr-only"> contact {contact.name}</span></button>
    </div>
    <Dialog open={Boolean(draft)} onOpenChange={open => { if (!open && !pending) setDraft(null); }}>
      <DialogContent title={draft?.kind === 'delete' ? 'Remove this contact?' : 'Edit contact'} description={draft?.kind === 'delete' ? `${contact.name} will be permanently removed from this client workspace. Unlink it from all tickets first. This cannot be undone.` : 'Changes apply to this contact across all boards in this client workspace.'}>
        <form onSubmit={submit} className="ticket-dialog-form">
          {draft?.kind === 'edit' && <>
            <div className="agency-field"><label htmlFor={`${id}-name`}>Contact name</label><input id={`${id}-name`} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required minLength={2} maxLength={191} disabled={pending} /></div>
            <div className="agency-field"><label htmlFor={`${id}-email`}>Contact email (optional)</label><input id={`${id}-email`} type="email" value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} maxLength={320} disabled={pending} /></div>
          </>}
          {message && <><p role="alert" className="agency-field-error">{message}</p><button type="button" className="text-action" disabled={pending} onClick={() => { setDraft(null); router.refresh(); }}>Close and reload board</button></>}
          <div className="team-confirm-actions"><DialogClose className="text-action" disabled={pending}>Cancel</DialogClose><button className="action" disabled={pending}>{pending ? 'Saving…' : draft?.kind === 'delete' ? 'Remove contact' : 'Save contact'}</button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
