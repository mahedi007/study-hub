/** Resize and re-encode images in the browser before upload so they use less of the 10 GB free storage. */
export async function compressImage(file: File, maxDim = 1800, quality = 0.85): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size < 200 * 1024) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality));
  return blob && blob.size < file.size ? blob : file;
}
