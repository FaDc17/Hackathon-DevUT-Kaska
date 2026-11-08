import { Capacitor, registerPlugin } from "@capacitor/core";

type SecureStoragePlugin = {
  set(options: { value: string }): Promise<void>;
  get(): Promise<{ value: string | null }>;
  remove(): Promise<void>;
};

export type SecureSession = { accessToken: string; userId: string };

const secureStorage = registerPlugin<SecureStoragePlugin>("SecureStorage");
let webSession: SecureSession | null = null;

export async function saveSecureSession(session: SecureSession): Promise<void> {
  const value = JSON.stringify(session);
  if (Capacitor.isNativePlatform()) {
    await secureStorage.set({ value });
    return;
  }
  webSession = session;
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
    return typeof session.accessToken === "string" && typeof session.userId === "string"
      ? { accessToken: session.accessToken, userId: session.userId }
      : null;
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
