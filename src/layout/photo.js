import { MAX_PHOTO_DATA_URL_LENGTH } from '../domain/equipmentPhoto.js';

const PHOTO_MAX_BYTES = 400 * 1024;

export async function createPhotoDataUrl(file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw Error('Escolha uma foto JPEG, PNG, WebP ou AVIF.');
  if (file.size > 12 * 1024 * 1024) throw Error('A foto original deve ter até 12 MB.');
  if (!globalThis.createImageBitmap) throw Error('Este navegador não consegue processar a foto.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw Error('Não foi possível abrir esta imagem.'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 80_000_000) throw Error('As dimensões da imagem são muito grandes.');
    for (const [maxDimension, quality] of [[1400, .82], [1200, .76], [1000, .7], [800, .62]]) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw Error('Não foi possível processar esta imagem.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw Error('Não foi possível compactar esta imagem.');
      if (blob.size <= PHOTO_MAX_BYTES) {
        const photo = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(Error('Não foi possível ler a foto.'));
          reader.readAsDataURL(blob);
        });
        if (typeof photo === 'string' && photo.length <= MAX_PHOTO_DATA_URL_LENGTH) return photo;
      }
    }
  } finally { bitmap.close?.(); }
  throw Error('Não foi possível reduzir a foto para 400 KB. Escolha uma imagem menor.');
}
