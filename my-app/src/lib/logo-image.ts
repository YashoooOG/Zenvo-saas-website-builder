import sharp from 'sharp';

export const maxLogoBytes = 2 * 1024 * 1024;
export const logoMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
export class LogoError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function normalizeLogo(file: File) {
  if (!logoMimeTypes.includes(file.type)) throw new LogoError('Choose a PNG, JPEG, or WebP image.');
  if (!file.size || file.size > maxLogoBytes) throw new LogoError('Choose an image no larger than 2 MB.');
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 4096 * 4096, failOn: 'warning', animated: true });
    const metadata = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1 || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096) {
      throw new LogoError('Choose a still image up to 4096 × 4096 pixels.');
    }
    // Decode and re-encode, stripping metadata and never serving original bytes.
    return await image.rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } catch (error) {
    if (error instanceof LogoError) throw error;
    throw new LogoError('This image could not be read. Choose another PNG, JPEG, or WebP.');
  }
}
