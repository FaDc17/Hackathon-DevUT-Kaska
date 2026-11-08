import { Capacitor } from "@capacitor/core";
import { clearSecureSession, getSecureSession, saveSecureSession } from "./secureSession";
import { tokenExpiresAt } from "./sessionTokens";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const defaultBaseUrl =
  Capacitor.getPlatform() === "android" ? "http://10.0.2.2:8080" : "http://localhost:8080";
export const API_BASE_URL = (configuredBaseUrl || defaultBaseUrl).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let renewal: Promise<void> | null = null;
let retryRenewalAt = 0;
/** Only renew a still-valid session. Older deployed servers may not support this endpoint yet. */
export async function renewSessionIfNeeded(allowRenewal = true): Promise<void> {
  if (renewal) return renewal;
  const session = await getSecureSession();
  const expires = session ? tokenExpiresAt(session.accessToken) : null;
  if (!session || !expires) return;
  if (expires <= Date.now()) {
    if ((await getSecureSession())?.accessToken === session.accessToken) {
      await clearSecureSession();
      window.dispatchEvent(new Event("kuska:unauthorized"));
    }
    return;
  }
  if (!allowRenewal || !navigator.onLine || expires - Date.now() > 120_000 || Date.now() < retryRenewalAt) return;
  if (renewal) return renewal;
  renewal = (async () => {
    try {
      const result = await apiRequest<{ accessToken: string; user: { id: string } }>("/api/auth/refresh", { method: "POST" });
      if ((await getSecureSession())?.accessToken !== session.accessToken) return;
      if (result.user.id !== session.userId || (tokenExpiresAt(result.accessToken) ?? 0) <= Date.now()) throw new Error("Sesión inválida");
      await saveSecureSession({ ...session, accessToken: result.accessToken });
    } catch {
      retryRenewalAt = Date.now() + 60_000;
      // Network and missing-endpoint failures never invalidate an otherwise valid JWT.
    }
  })().finally(() => { renewal = null; });
  return renewal;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  operationId?: string,
  timeoutMs = 15_000,
  responseType: "json" | "blob" = "json",
): Promise<T> {
  if (
    Capacitor.isNativePlatform() &&
    import.meta.env.PROD &&
    (!configuredBaseUrl || !/^https:\/\//i.test(configuredBaseUrl))
  ) {
    throw new ApiError(
      "La aplicación necesita la dirección HTTPS del servidor Kuska.",
      0,
      "API_NOT_CONFIGURED",
    );
  }
  const headers = new Headers(options.headers);
  if (
    options.body &&
    !(typeof FormData !== "undefined" && options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (!path.startsWith("/api/auth/") && !headers.has("Authorization")) await renewSessionIfNeeded();
  const session = await getSecureSession();
  if (session?.accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  if (operationId) headers.set("X-Operation-Id", operationId);

  let response: Response;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, timeoutMs);
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      "No hay conexión con Kuska. Comprueba Internet e inténtalo nuevamente.",
      0,
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }

  if (response.status === 401 && session && headers.get("Authorization") === `Bearer ${session.accessToken}` && !["/api/auth/login", "/api/auth/register"].some(route => path.startsWith(route)) &&
      (await getSecureSession())?.accessToken === session.accessToken) {
    await clearSecureSession();
    window.dispatchEvent(new Event("kuska:unauthorized"));
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    throw new ApiError(
      body?.message || "No fue posible completar la solicitud.",
      response.status,
      body?.error || "API_ERROR",
    );
  }
  if (response.status === 204) return undefined as T;
  if (responseType === "blob") return (await response.blob()) as T;
  return (await response.json()) as T;
}
