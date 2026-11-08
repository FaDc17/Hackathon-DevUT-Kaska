import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: null as { userId: string; accessToken: string } | null, clear: vi.fn(), save: vi.fn(), fetch: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));
vi.mock("./secureSession", () => ({
  getSecureSession: async () => state.session,
  clearSecureSession: async () => { state.clear(); state.session = null; },
  saveSecureSession: async (session: typeof state.session) => { state.save(session); state.session = session; },
}));
const token = (expires: number) => `header.${btoa(JSON.stringify({ sub: "owner", exp: expires }))}.signature`;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); state.fetch.mockReset();
  state.session = { userId: "owner", accessToken: token(Math.floor(Date.now() / 1000) + 60) };
  vi.stubGlobal("navigator", { onLine: true }); vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("fetch", state.fetch);
});
afterEach(() => vi.unstubAllGlobals());
it("renews once before a request and sends the renewed short-lived token", async () => {
  const renewed = token(Math.floor(Date.now() / 1000) + 900);
  state.fetch.mockResolvedValueOnce(json({ accessToken: renewed, user: { id: "owner" } })).mockResolvedValueOnce(json([]));
  const { apiRequest } = await import("./apiClient");
  await apiRequest("/api/servicios");
  expect(state.fetch.mock.calls[0][0]).toMatch(/\/api\/auth\/refresh$/);
  expect(state.fetch.mock.calls[1][1].headers.get("Authorization")).toBe(`Bearer ${renewed}`);
  expect(state.save).toHaveBeenCalledTimes(1);
});
it("coalesces concurrent renewal calls", async () => {
  const renewed = token(Math.floor(Date.now() / 1000) + 900);
  state.fetch.mockResolvedValue(json({ accessToken: renewed, user: { id: "owner" } }));
  const { renewSessionIfNeeded } = await import("./apiClient");
  await Promise.all([renewSessionIfNeeded(), renewSessionIfNeeded(), renewSessionIfNeeded()]);
  expect(state.fetch).toHaveBeenCalledTimes(1);
});
it.each([404, 503])("preserves a valid session and limits retries if refresh returns %s", async status => {
  state.fetch.mockResolvedValueOnce(json({}, status)).mockImplementation(async () => json([]));
  const { apiRequest } = await import("./apiClient");
  await apiRequest("/api/servicios"); await apiRequest("/api/publicaciones");
  expect(state.fetch.mock.calls.filter(([url]) => url.endsWith("/api/auth/refresh"))).toHaveLength(1);
  expect(state.clear).not.toHaveBeenCalled(); expect(state.session).not.toBeNull();
});
it("never renews an expired JWT and respects a server rejection", async () => {
  state.session!.accessToken = token(Math.floor(Date.now() / 1000) - 1);
  state.fetch.mockResolvedValue(json({}, 401));
  const { apiRequest } = await import("./apiClient");
  await expect(apiRequest("/api/servicios")).rejects.toMatchObject({ status: 401 });
  expect(state.fetch).toHaveBeenCalledTimes(1); expect(state.clear).toHaveBeenCalledOnce();
});
it("does not erase a new session when a delayed request from the old account returns 401", async () => {
  state.session!.accessToken = token(Math.floor(Date.now() / 1000) + 900);
  state.fetch.mockImplementation(async () => {
    state.session = { userId: "new-owner", accessToken: "another-session" };
    return json({}, 401);
  });
  const { apiRequest } = await import("./apiClient");
  await expect(apiRequest("/api/servicios")).rejects.toMatchObject({ status: 401 });
  expect(state.clear).not.toHaveBeenCalled(); expect(state.session?.userId).toBe("new-owner");
});
it("keeps the session during a transport failure", async () => {
  state.fetch.mockRejectedValue(new TypeError("offline"));
  const { apiRequest } = await import("./apiClient");
  await expect(apiRequest("/api/servicios")).rejects.toMatchObject({ status: 0 });
  expect(state.clear).not.toHaveBeenCalled();
});
it("respects expiration offline without attempting a renewal request", async () => {
  state.session!.accessToken = token(Math.floor(Date.now() / 1000) - 1);
  vi.stubGlobal("navigator", { onLine: false });
  const { renewSessionIfNeeded } = await import("./apiClient");
  await renewSessionIfNeeded(false);
  expect(state.clear).toHaveBeenCalledOnce(); expect(state.fetch).not.toHaveBeenCalled();
});
