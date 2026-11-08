export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const COMPRESSION_THRESHOLD = 750 * 1024;

/** Only large uploads are transformed. Original references and queue IDs stay untouched. */
export async function compressImage(file: Blob): Promise<Blob> {
  if (!file.size || file.size > MAX_IMAGE_BYTES)
    throw new Error("Elige una foto JPG, PNG o WebP de hasta 10 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Elige una foto JPG, PNG o WebP de hasta 10 MB.");
  if (file.size <= COMPRESSION_THRESHOLD) return file;

  let bitmap: ImageBitmap | undefined;
  let fallback: HTMLImageElement | undefined;
  let objectUrl: string | undefined;
  try {
    if (typeof createImageBitmap === "function") {
      try { bitmap = await createImageBitmap(file); } catch { /* Try the WebView image decoder. */ }
    }
    if (!bitmap) {
      objectUrl = URL.createObjectURL(file);
      fallback = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("No se pudo leer la fotografía. Elige otra imagen."));
        img.src = objectUrl!;
      });
    }
    const source = bitmap ?? fallback!;
    const width = bitmap?.width ?? fallback!.naturalWidth;
    const height = bitmap?.height ?? fallback!.naturalHeight;
    if (!width || !height) throw new Error("No se pudo leer la fotografía.");
    const scale = Math.min(1, 1280 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la fotografía.");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    // WebP retains transparency for PNG/WebP. JPEG photos keep their original format.
    const mime = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    const compressed = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("No se pudo comprimir la fotografía.")), mime, 0.7);
    });
    // Never enlarge a small/highly optimized original, nor send more than the server accepts.
    return compressed.size > 0 && compressed.size < file.size ? compressed : file;
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
