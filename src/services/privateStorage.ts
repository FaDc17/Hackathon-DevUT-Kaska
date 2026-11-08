import { Capacitor, registerPlugin } from "@capacitor/core";
const storage = () => registerPlugin<{
  seal(options: { value: string; context: string }): Promise<{ value: string }>;
  unseal(options: { value: string; context: string }): Promise<{ value: string }>;
}>("SecureStorage");
const prefix = "kuska-sealed-v1:";
export const isProtected = (value: string) => value.startsWith(prefix);
export async function protectPrivate(value: string, context: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) throw new Error("El cifrado persistente requiere Android.");
  return prefix + (await storage().seal({ value, context })).value;
}
export async function openPrivate(value: string, context: string): Promise<string> {
  if (!isProtected(value)) return value; // Legacy plaintext is migrated only after successful encryption.
  return (await storage().unseal({ value: value.slice(prefix.length), context })).value;
}
export async function encodeQueuePayload(entity: string, owner: string, payload: unknown): Promise<string> {
  const json = JSON.stringify(payload);
  return entity === "Usuarios" ? JSON.stringify({ sealed: await protectPrivate(json, `profile-queue:${owner}`) }) : json;
}
export async function decodeQueuePayload(entity: string, owner: string, payload: string): Promise<string> {
  if (entity !== "Usuarios") return payload;
  const value = JSON.parse(payload);
  return typeof value?.sealed === "string" ? openPrivate(value.sealed, `profile-queue:${owner}`) : payload;
}
