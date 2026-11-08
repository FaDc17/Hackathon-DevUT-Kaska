import { Capacitor, registerPlugin } from "@capacitor/core";

type SecureStoragePlugin = {
  set(options: { value: string }): Promise<void>;
  get(): Promise<{ value: string | null }>;
  remove(): Promise<void>;
};

export type SecureSession = { accessToken: string; userId: string; sessionId?: string };

const secureStorage = registerPlugin<SecureStoragePlugin>("SecureStorage");
let webSession: SecureSession | null = null;

export async function saveSecureSession(session: SecureSession): Promise<void> {
  const identified = { ...session, sessionId: session.sessionId || crypto.randomUUID() };
  const value = JSON.stringify(identified);
  if (Capacitor.isNativePlatform()) {
    await secureStorage.set({ value });
    return;
  }
  webSession = identified;
}

export async function getSecureSession(): Promise<SecureSession | null> {
  let value: string | null;
  if (Capacitor.isNativePlatform()) {
    value = (await secureStorage.get()).value;
  } else {
    return webSession;
  }
  if (!value) return null;
  try {
    const session = JSON.parse(value) as Partial<SecureSession>;
    if (typeof session.accessToken !== "string" || typeof session.userId !== "string") return null;
    const sessionId = typeof session.sessionId === "string" && session.sessionId ? session.sessionId
      : "legacy-" + Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(session.accessToken))), byte => byte.toString(16).padStart(2, "0")).join("");
    return { accessToken: session.accessToken, userId: session.userId, sessionId };
  } catch {
    await clearSecureSession();
    return null;
  }
}

export async function clearSecureSession(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await secureStorage.remove();
    return;
  }
  webSession = null;
}
