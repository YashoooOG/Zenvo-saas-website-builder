'use client';
import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
type MediaItem = { id: string; name: string; url: string; sizeBytes: number; createdAt: string };
export function MediaLibrary({ subAccountId, canEdit, configured, images }: { subAccountId: string; canEdit: boolean; configured: boolean; images: MediaItem[] }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const removeTrigger = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [removing, setRemoving] = useState<MediaItem | null>(null);
  const router = useRouter();
  const filtered = images.filter(image => image.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  async function update(image?: MediaItem) {
    const file = input.current?.files?.[0];
    if (!image && (!file || !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) { setError(true); setMessage('Choose a PNG, JPEG, or WebP image no larger than 8 MB.'); return; }
    setBusy(true); setError(false); setMessage('');
    try {
      const form = new FormData(); if (file) form.set('file', file);
      const response = await fetch(`/api/subaccount/${subAccountId}/media${image ? `?id=${encodeURIComponent(image.id)}` : ''}`, { method: image ? 'DELETE' : 'POST', body: image ? undefined : form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Image update failed.');
      if (!image && input.current) input.current.value = '';
      setRemoving(null); setMessage(result.message); router.refresh();
    } catch (failure) { setError(true); setMessage(failure instanceof Error ? failure.message : 'Image update failed. Please try again.'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="team-role-guide"><p>For public website images. Anyone with an image link can view it; do not upload confidential files. Removing an image can break links where you have used it.</p><p>PNG, JPEG, and WebP · Up to 8 MB and 4096 × 4096 pixels · Stored as WebP, resized to fit 2560 × 2560 pixels.</p></div>
    {canEdit ? <form className="media-upload" onSubmit={event => { event.preventDefault(); void update(); }}><div className="agency-field"><label htmlFor={`${id}-file`}>Choose an image</label><input id={`${id}-file`} ref={input} type="file" accept="image/png,image/jpeg,image/webp" required disabled={busy || !configured} /></div><button className="action" disabled={busy || !configured}>{busy ? 'Updating…' : 'Upload image'}</button>{!configured && <p role="status">Image uploads are temporarily unavailable.</p>}</form> : <p className="media-readonly">You have read-only access. You can view images and copy their links.</p>}
    {message && <p className={error ? 'agency-field-error' : 'agency-feedback'} role={error ? 'alert' : 'status'}>{message}</p>}
    <div className="media-toolbar"><label className="workspace-search" htmlFor={`${id}-search`}><span className="sr-only">Search images</span><input id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search images" /></label><p role="status">{filtered.length} of {images.length} {images.length === 1 ? 'image' : 'images'}</p></div>
    {filtered.length ? <ul className="media-grid">{filtered.map(image => <li className="media-card" key={image.id}><a href={image.url} target="_blank" rel="noreferrer" aria-label={`View ${image.name}`}><Image src={image.url} alt={image.name} width={400} height={260} unoptimized /></a><div className="media-card-copy"><h2>{image.name}</h2><p>WebP · {Math.max(1, Math.round(image.sizeBytes / 1024))} KB</p><div className="media-card-actions"><button type="button" className="text-action" onClick={async () => { try { await navigator.clipboard.writeText(image.url); setError(false); setMessage(`Link copied for ${image.name}.`); } catch { setError(true); setMessage('Open the image and copy its address to share it.'); } }}>Copy link<span className="sr-only"> for {image.name}</span></button>{canEdit && <button type="button" className="text-action" disabled={busy} onClick={event => { removeTrigger.current = event.currentTarget; setRemoving(image); }}>Remove<span className="sr-only"> {image.name}</span></button>}</div></div></li>)}</ul> : <section className="agency-empty"><h2>{images.length ? 'No matching images' : 'Your image library starts here'}</h2><p>{images.length ? 'Try a different file name.' : canEdit ? 'Upload an image to keep it ready for this client’s websites.' : 'Images uploaded by your team will appear here.'}</p></section>}
    <Dialog open={Boolean(removing)} onOpenChange={open => { if (!open && !busy) setRemoving(null); }}><DialogContent title="Remove this image?" description={`${removing?.name ?? 'This image'} will be removed from the library and queued for storage deletion. Pages using its link may stop displaying it.`} finalFocus={removeTrigger}>
      {error && message && <p role="alert" className="agency-field-error">{message}</p>}<div className="team-confirm-actions"><DialogClose className="text-action" disabled={busy}>Cancel</DialogClose><button type="button" className="action" disabled={busy} onClick={() => removing && void update(removing)}>{busy ? 'Removing…' : 'Remove image'}</button></div>
    </DialogContent></Dialog>
  </>;
}
