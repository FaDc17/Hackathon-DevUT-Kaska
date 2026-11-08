export function tokenExpiresAt(token: string): number | null {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload));
    return typeof claims.exp === "number" && Number.isFinite(claims.exp) ? claims.exp * 1000 : null;
  } catch { return null; }
}
