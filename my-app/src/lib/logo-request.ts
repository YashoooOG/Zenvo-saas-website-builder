import { maxLogoBytes, LogoError } from './logo-image';

export function requireSameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new LogoError('Request not allowed.', 403);
}

export async function readLogoForm(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new LogoError('Choose an image to upload.');
  const limit = maxLogoBytes + 64 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new LogoError('Choose an image no larger than 2 MB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LogoError('Choose an image to upload.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new LogoError('Choose an image no larger than 2 MB.', 413); }
    chunks.push(value);
  }
  try {
    const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': request.headers.get('content-type')! } }).formData();
    if (form.getAll('file').length !== 1 || form.getAll('logoVersion').length !== 1 || [...form.keys()].some(key => !['file', 'logoVersion'].includes(key))) throw new Error('Invalid fields');
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('Missing file');
    return { file, version: parseLogoVersion(form.get('logoVersion')) };
  } catch { throw new LogoError('Choose one image and try again.'); }
}

export function parseLogoVersion(value: unknown) {
  if (typeof value !== 'string' || !/^\d{1,10}$/.test(value) || Number(value) > 2147483646) throw new LogoError('Invalid logo version. Reload the page.');
  return Number(value);
}
