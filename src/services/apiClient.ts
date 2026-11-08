import { Capacitor } from "@capacitor/core";
import { clearSecureSession, getSecureSession } from "./secureSession";

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

  if (response.status === 401 && !path.startsWith("/api/auth/login")) {
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
