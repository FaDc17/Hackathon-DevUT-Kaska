import { Capacitor } from "@capacitor/core";
import type { User } from "../types";

let browserProfile: User | null = null;
export function setBrowserProfile(user: User): void {
  browserProfile = { ...user };
  localStorage.removeItem("kuska-cached-user");
}
export function getBrowserProfile(): User | null {
  // Legacy browser copies were server-confirmed caches, never pending drafts.
  if (!Capacitor.isNativePlatform()) localStorage.removeItem("kuska-cached-user");
  return browserProfile;
}
export function clearBrowserProfile(): void {
  browserProfile = null;
  localStorage.removeItem("kuska-cached-user");
}
