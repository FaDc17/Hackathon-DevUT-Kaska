import type { SecureSession } from "./secureSession";

/** Only gates a session previously received from the server and kept in Secure Storage.
 * JWT parsing here does not verify signatures and must never authenticate a new account. */
export function validOfflineSession(session: SecureSession, now = Date.now()): boolean {
  try {
    const payload = session.accessToken.split(".")[1];
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return claims.sub === session.userId && typeof claims.exp === "number" &&
      Number.isFinite(claims.exp) && claims.exp * 1000 > now;
  } catch { return false; }
}
