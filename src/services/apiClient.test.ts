import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" },
}));
vi.mock("./secureSession", () => ({
  getSecureSession: async () => ({ userId: "test-owner", accessToken: "test-only-token" }),
  clearSecureSession: vi.fn(),
}));
import { apiRequest } from "./apiClient";
const request = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", request);
  request.mockReset();
  request.mockResolvedValue(
    new Response('{"ok":true}', { headers: { "Content-Type": "application/json" } }),
  );
});
afterEach(() => vi.unstubAllGlobals());
it("keeps JWT authentication and lets the browser generate the multipart boundary", async () => {
  const body = new FormData();
  body.set("archivo", new Blob(["test-only"]), "file.png");
  await apiRequest("/api/imagenes", { method: "POST", body }, undefined, 60_000);
  const options = request.mock.calls[0][1];
  expect(options.body).toBe(body);
  expect(options.headers.has("Content-Type")).toBe(false);
  expect(options.headers.get("Authorization")).toBe("Bearer test-only-token");
});
it("preserves JSON content type for all existing text operations", async () => {
  await apiRequest("/api/servicios", { method: "POST", body: '{"title":"test"}' });
  expect(request.mock.calls[0][1].headers.get("Content-Type")).toBe("application/json");
});
it("returns authenticated image bytes without trying to decode them as JSON", async () => {
  request.mockResolvedValue(
    new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } }),
  );
  const file = await apiRequest<Blob>(
    "/api/imagenes/servicio/id/archivo",
    {},
    undefined,
    60_000,
    "blob",
  );
  expect(file.type).toBe("image/png");
  expect(file.size).toBe(4);
});
