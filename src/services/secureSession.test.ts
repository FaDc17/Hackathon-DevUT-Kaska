import { expect, it, vi } from "vitest";
const bridge = vi.hoisted(() => ({ native: false, value: null as string | null }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => bridge.native },
  registerPlugin: () => ({
    get: async () => ({ value: bridge.value }),
    set: async ({ value }: { value: string }) => {
      bridge.value = value;
    },
    remove: async () => {
      bridge.value = null;
    },
  }),
}));
import { clearSecureSession, getSecureSession, saveSecureSession } from "./secureSession";

it("preserves a conversation identity on renewal and replaces it on a new login", async () => {
  await clearSecureSession();
  await saveSecureSession({ userId: "owner", accessToken: "initial" });
  const first = (await getSecureSession())!;
  expect(first.sessionId).toBeTruthy();
  await saveSecureSession({ ...first, accessToken: "renewed" });
  expect((await getSecureSession())?.sessionId).toBe(first.sessionId);
  await clearSecureSession();
  await saveSecureSession({ userId: "owner", accessToken: "another-login" });
  expect((await getSecureSession())?.sessionId).not.toBe(first.sessionId);
  await clearSecureSession();
});
it("migrates an already-installed native session without losing the conversation on its first renewal", async () => {
  bridge.native = true;
  bridge.value = JSON.stringify({ userId: "owner", accessToken: "legacy-saved-token" });
  try {
    const first = (await getSecureSession())!;
    expect(first.sessionId).toMatch(/^legacy-[a-f0-9]{64}$/);
    expect((await getSecureSession())?.sessionId).toBe(first.sessionId);
    await saveSecureSession({ ...first, accessToken: "renewed" });
    expect((await getSecureSession())?.sessionId).toBe(first.sessionId);
  } finally {
    await clearSecureSession();
    bridge.native = false;
  }
});
