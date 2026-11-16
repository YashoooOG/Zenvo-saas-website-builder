import { UTApi, UTFile } from 'uploadthing/server';
import type { MediaStorage } from './client-media';
import { MediaError } from './media-image';
export function createMediaStorage(): MediaStorage {
  if (!process.env.UPLOADTHING_TOKEN) throw new MediaError('Image uploads are temporarily unavailable.', 503);
  const api = new UTApi({ logLevel: 'Error' });
  return {
    async upload(bytes, assetId) {
      const result = await api.uploadFiles(new UTFile([new Uint8Array(bytes)], 'client-image.webp', { type: 'image/webp', customId: assetId }), { contentDisposition: 'inline' });
      if (result.error || !result.data) throw new MediaError('Upload failed. Please try again.', 502);
      const url = new URL(result.data.ufsUrl);
      if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.ufs\.sh$/.test(url.hostname) || url.pathname !== `/f/${result.data.key}`) throw new MediaError('Storage returned an invalid image address.', 502);
      return { key: result.data.key, url: url.href };
    },
    async remove(assetId) { const result = await api.deleteFiles(assetId, { keyType: 'customId' }); if (!result.success) throw new Error('Storage cleanup failed'); },
  };
}
