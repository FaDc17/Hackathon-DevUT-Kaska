import { Capacitor, registerPlugin } from "@capacitor/core";

type Draft = { name: string; phone: string; address: string; districtId?: number; savedAt: number };
const storage = registerPlugin<{
  set(options: { key: string; value: string }): Promise<void>;
  get(options: { key: string }): Promise<{ value: string | null }>;
  remove(options: { key: string }): Promise<void>;
}>("SecureStorage");
const key = "registration-draft";
let webDraft: Draft | null = null;
export async function saveRegistrationDraft(input: Omit<Draft, "savedAt">): Promise<void> {
  // Explicit allowlist: password and confirmation can never enter this storage.
  const draft: Draft = { name: input.name, phone: input.phone, address: input.address,
    districtId: input.districtId, savedAt: Date.now() };
  if (Capacitor.isNativePlatform()) await storage.set({ key, value: JSON.stringify(draft) });
  else webDraft = draft; // Browser drafts live only in memory, never localStorage.
}
export async function readRegistrationDraft(): Promise<Draft | null> {
  const value = Capacitor.isNativePlatform() ? (await storage.get({ key })).value : null;
  try {
    const draft = Capacitor.isNativePlatform() ? (value ? JSON.parse(value) : null) : webDraft;
    if (!draft) return null;
    if (typeof draft.name !== "string" || typeof draft.phone !== "string" || typeof draft.address !== "string" ||
      !Number.isFinite(draft.savedAt) || Date.now() - draft.savedAt > 7 * 86400_000) {
      await clearRegistrationDraft(); return null;
    }
    return { name: draft.name, phone: draft.phone, address: draft.address,
      districtId: Number.isInteger(draft.districtId) ? draft.districtId : undefined, savedAt: draft.savedAt };
  } catch { return null; }
}
export async function clearRegistrationDraft(): Promise<void> {
  if (Capacitor.isNativePlatform()) await storage.remove({ key });
  webDraft = null;
}
