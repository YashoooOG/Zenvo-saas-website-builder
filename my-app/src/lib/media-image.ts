import sharp from 'sharp';
export class MediaError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const maxMediaBytes = 8 * 1024 * 1024;
export const mediaMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
export async function normalizeMediaImage(file: File) {
  if (!mediaMimeTypes.includes(file.type)) throw new MediaError('Choose a still PNG, JPEG, or WebP image.');
  if (!file.size || file.size > maxMediaBytes) throw new MediaError('Choose an image no larger than 8 MB.', 413);
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 4096 * 4096, failOn: 'warning', animated: true });
    const metadata = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1 || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096) throw new MediaError('Choose a still image up to 4096 × 4096 pixels.');
    const bytes = await image.rotate().resize(2560, 2560, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    if (bytes.length > maxMediaBytes) throw new MediaError('The processed image is too large. Choose a smaller image.');
    const base = file.name.replace(/\.[^.]*$/, '').normalize('NFC').replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 180) || 'image';
    return { bytes, name: `${base}.webp` };
  } catch (error) { if (error instanceof MediaError) throw error; throw new MediaError('This image could not be read. Choose another PNG, JPEG, or WebP.'); }
}
export function requireMediaOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new MediaError('Request not allowed.', 403);
}
export async function readMediaForm(request: Request) {
  const contentType = request.headers.get('content-type');
  if (!contentType?.startsWith('multipart/form-data;')) throw new MediaError('Choose one image to upload.');
  const limit = maxMediaBytes + 64 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new MediaError('Choose an image no larger than 8 MB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new MediaError('Choose one image to upload.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new MediaError('Choose an image no larger than 8 MB.', 413); }
    chunks.push(value);
  }
  try {
    const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': contentType } }).formData();
    const file = form.get('file');
    if (!(file instanceof File) || form.getAll('file').length !== 1 || [...form.keys()].some(key => key !== 'file')) throw new Error('Invalid fields');
    return file;
  } catch { throw new MediaError('Choose one image and try again.'); }
}
