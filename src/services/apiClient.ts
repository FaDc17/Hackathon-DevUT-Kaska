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
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const session = await getSecureSession();
  if (session?.accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  if (operationId) headers.set("X-Operation-Id", operationId);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      "No hay conexión con Kuska. Comprueba Internet e inténtalo nuevamente.",
      0,
      "NETWORK_ERROR",
    );
  }

  if (response.status === 401 && !path.startsWith("/api/auth/login")) {
    await clearSecureSession();
    window.dispatchEvent(new Event("kuska:unauthorized"));
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string; error?: string }
      | null;
    throw new ApiError(
      body?.message || "No fue posible completar la solicitud.",
      response.status,
      body?.error || "API_ERROR",
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
