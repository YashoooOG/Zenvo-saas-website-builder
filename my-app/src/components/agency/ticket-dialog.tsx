'use client';
import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { mutatePipelineAction } from '@/app/subaccount/pipeline-actions';
export function TicketDialog({ scope, ticket, disabled }: { scope: { subAccountId: string; pipelineId: string; revision: number }; ticket: { id: string; title: string; description: string | null }; disabled: boolean }) {
  const [draft, setDraft] = useState<{ kind: 'edit' | 'delete'; title: string; description: string; revision: number } | null>(null);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const id = useId();
  function open(kind: 'edit' | 'delete') { setMessage(''); setDraft({ kind, title: ticket.title, description: ticket.description ?? '', revision: scope.revision }); }
  function submit(event: React.FormEvent) {
    event.preventDefault(); if (!draft) return;
    const form = new FormData();
    for (const [key, value] of Object.entries({ ...scope, revision: draft.revision, operation: draft.kind === 'edit' ? 'edit-ticket' : 'delete-ticket', ticketId: ticket.id, title: draft.title, description: draft.description, confirmed: 'yes' })) form.set(key, String(value));
    startTransition(async () => {
      try { const result = await mutatePipelineAction({ message: '', success: false }, form); if (result.success) { setDraft(null); setMessage(''); } else setMessage(result.message); }
      catch { setMessage('The request could not be completed. Close and reload the board before retrying.'); }
    });
  }
  return <><div className="ticket-edit-actions"><button type="button" className="text-action" disabled={disabled} onClick={() => open('edit')}>Edit<span className="sr-only"> {ticket.title}</span></button><button type="button" className="text-action" disabled={disabled} onClick={() => open('delete')}>Remove<span className="sr-only"> {ticket.title}</span></button></div>
    <Dialog open={Boolean(draft)} onOpenChange={value => { if (!value && !pending) setDraft(null); }}><DialogContent title={draft?.kind === 'delete' ? 'Remove this ticket?' : 'Edit ticket'} description={draft?.kind === 'delete' ? `${ticket.title} will be permanently removed from this board. This cannot be undone.` : 'Update the title and description. Moving a ticket does not change its details.'}>
      <form onSubmit={submit} className="ticket-dialog-form">{draft?.kind === 'edit' && <><div className="agency-field"><label htmlFor={`${id}-title`}>Ticket title</label><input id={`${id}-title`} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} minLength={2} maxLength={191} required disabled={pending} /></div><div className="agency-field"><label htmlFor={`${id}-description`}>Ticket description</label><textarea id={`${id}-description`} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} rows={5} maxLength={5000} disabled={pending} /></div></>}
        {message && <><p role="alert" className="agency-field-error">{message}</p><button type="button" className="text-action" onClick={() => { setDraft(null); router.refresh(); }}>Close and reload board</button></>}
        <div className="team-confirm-actions"><DialogClose className="text-action" disabled={pending}>Cancel</DialogClose><button className="action" disabled={pending}>{pending ? 'Saving…' : draft?.kind === 'delete' ? 'Remove ticket' : 'Save ticket'}</button></div>
      </form>
    </DialogContent></Dialog>
  </>;
}
