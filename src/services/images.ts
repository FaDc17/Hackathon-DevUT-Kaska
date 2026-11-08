import { Capacitor, registerPlugin } from "@capacitor/core";
import type { EntityId } from "../types";

const persistentImages = registerPlugin<{
  save(options: { id: string; dataUrl: string }): Promise<{ uri: string }>;
  remove(options: { uri: string }): Promise<void>;
}>("PersistentImages");

export function isRemoteImage(image: string | undefined): boolean {
  if (!image) return false;
  try {
    const url = new URL(image);
    return (
      url.protocol === "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.pathname.startsWith("/_capacitor_file_") &&
      !url.pathname.startsWith("/_capacitor_content_")
    );
  } catch {
    return false;
  }
}

/** Temporary read permissions belong to presentation, never to SQL or the sync queue. */
export function permanentImageReference(image: string): string {
  try {
    const url = new URL(image);
    if (
      url.hostname.endsWith(".blob.core.windows.net") &&
      decodeURIComponent(url.pathname).split("/").filter(Boolean)[1] === "kuska"
    ) {
      url.search = "";
      url.hash = "";
      return url.toString();
    }
  } catch {
    /* A local file is already a persistent reference. */
  }
  return image;
}

export function recordImageReference(record: {
  image?: string;
  imageReference?: string;
  imageDisplaySource?: string;
}): string {
  if (record.imageReference && record.image === record.imageDisplaySource)
    return record.imageReference;
  return permanentImageReference(record.image || "");
}

export function saveBrowserImage(kind: "service" | "post", id: EntityId, image?: string): void {
  if (!image || isRemoteImage(image)) return;
  try {
    if (localStorage.getItem(`kuska:local-image:${kind}:${id}`) !== image)
      localStorage.removeItem(`kuska:image-uploaded:${kind}:${id}`);
    localStorage.setItem(`kuska:local-image:${kind}:${id}`, image);
  } catch {
    throw new Error(
      "No hay espacio para guardar la foto en este navegador. Elige una imagen más pequeña.",
    );
  }
}

export function browserImage(kind: "service" | "post", id: EntityId): string | null {
  return localStorage.getItem(`kuska:local-image:${kind}:${id}`);
}

export function removeBrowserImage(kind: "service" | "post", id: EntityId): void {
  localStorage.removeItem(`kuska:local-image:${kind}:${id}`);
  localStorage.removeItem(`kuska:image-uploaded:${kind}:${id}`);
}

export function browserImageIsPending(kind: "service" | "post", id: EntityId): boolean {
  return !!browserImage(kind, id) && !localStorage.getItem(`kuska:image-uploaded:${kind}:${id}`);
}

/** Local files are never sent to SQL or marked uploaded without a remote image store. */
export async function persistSelectedImage(
  file: File | string,
  id: EntityId = crypto.randomUUID(),
): Promise<string> {
  if (
    typeof file !== "string" &&
    (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)
  ) {
    throw new Error("Elige una foto JPG, PNG o WebP de hasta 5 MB.");
  }
  const dataUrl =
    typeof file === "string"
      ? file
      : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(new Error("No se pudo guardar la imagen. Inténtalo nuevamente."));
          reader.readAsDataURL(file);
        });
  if (!Capacitor.isNativePlatform() || !dataUrl.startsWith("data:image/")) return dataUrl;
  const saved = await persistentImages.save({ id: String(id), dataUrl });
  return Capacitor.convertFileSrc(saved.uri);
}

export async function removePersistentImage(uri: string): Promise<void> {
  if (Capacitor.isNativePlatform() && !isRemoteImage(uri)) await persistentImages.remove({ uri });
}
