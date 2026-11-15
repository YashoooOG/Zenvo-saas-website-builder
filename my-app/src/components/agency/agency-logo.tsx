'use client';
import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export function AgencyLogo({ agencyId, logoUrl, logoVersion, configured }: {
  agencyId: string; logoUrl: string | null; logoVersion: number; configured: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState({ logoUrl, logoVersion });
  const router = useRouter();
  async function update(remove: boolean) {
    const file = input.current?.files?.[0];
    if (!remove && (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024)) {
      setError(true); setMessage('Choose a PNG, JPEG, or WebP image no larger than 2 MB.'); return;
    }
    setBusy(true); setMessage(''); setError(false);
    try {
      const data = new FormData();
      if (file) data.set('file', file);
      data.set('logoVersion', String(current.logoVersion));
      const response = await fetch(`/api/agency/${agencyId}/logo${remove ? `?version=${current.logoVersion}` : ''}`, { method: remove ? 'DELETE' : 'POST', body: remove ? undefined : data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Logo update failed. Please try again.');
      setCurrent(result);
      if (input.current) input.current.value = '';
      setMessage(remove ? 'Logo removed.' : 'Logo saved.');
      router.refresh();
    } catch (error) { setError(true); setMessage(error instanceof Error ? error.message : 'Logo update failed. Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="agency-logo" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Agency logo</h2>
    <p>Choose a still PNG, JPEG, or WebP image, up to 2 MB. Your logo is visible wherever you share its image link.</p>
    <div className="agency-logo-preview">{current.logoUrl ? <Image src={current.logoUrl} alt="Agency logo" width={96} height={96} unoptimized /> : <span>No logo yet</span>}</div>
    <label htmlFor={`${id}-file`}>Choose an image</label>
    <input ref={input} id={`${id}-file`} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !configured} aria-describedby={`${id}-hint`} />
    <p id={`${id}-hint`}>{configured ? 'Images are resized to fit 512 × 512 pixels.' : 'Logo uploads are temporarily unavailable.'}</p>
    <div className="agency-logo-actions"><button className="action" type="button" disabled={busy || !configured} onClick={() => update(false)}>{busy ? 'Updating…' : current.logoUrl ? 'Replace logo' : 'Upload logo'}</button>
      {current.logoUrl && <button className="text-action" type="button" disabled={busy} onClick={() => update(true)}>Remove logo</button>}</div>
    {message && <p role={error ? 'alert' : 'status'} className={error ? 'agency-field-error' : 'agency-feedback'}>{message}</p>}
  </section>;
}
