import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Service } from "../types";

const state = vi.hoisted(() => ({
  native: false,
  db: null as unknown,
  request: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => state.native, convertFileSrc: (uri: string) => uri },
  registerPlugin: () => ({ save: state.save }),
}));
vi.mock("../database/connection", () => ({ getDatabase: async () => state.db }));
vi.mock("./secureSession", () => ({
  getSecureSession: async () => ({ userId: "reader", accessToken: "test-only-token" }),
}));
vi.mock("./apiClient", () => ({
  apiRequest: state.request,
  ApiError: class ApiError extends Error {},
}));
import { resolveImages, tryUploadBrowserImage, uploadLocalImage } from "./blobImages";
import { browserImageIsPending, saveBrowserImage } from "./images";
import * as compression from "./imageCompression";

let sql: DatabaseSync, directory: string, path: string;
function reopen() {
  sql = new DatabaseSync(path);
  state.db = {
    query: async (statement: string, values: unknown[] = []) => ({
      values: sql.prepare(statement).all(...(values as never[])),
    }),
    run: async (statement: string, values: unknown[] = []) =>
      sql.prepare(statement).run(...(values as never[])),
  };
}
const record = (id: string): Service => ({
  id,
  imageId: `original-photo-${id}`,
  owner: "Vecino",
  ownerId: "another-reader",
  title: "Servicio",
  description: "Servicio",
  category: "Hogar",
  priceMin: 0,
  priceMax: 20,
  priceLabel: "S/ 0 – S/ 20",
  currency: "PEN",
  district: "Lima",
  location: "Lima",
  contactPhone: "",
  createdAt: 1,
  image: `https://blobkuska.blob.core.windows.net/imagenes/kuska/${id}`,
  reviews: [],
});
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "kuska-media-read-"));
  path = join(directory, "cache.sqlite");
  reopen();
  state.native = false;
  state.request.mockReset();
  state.save.mockReset();
  state.request.mockResolvedValue(
    new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])], {
      type: "image/png",
    }),
  );
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "FileReader",
    class {
      result: string | null = null;
      onload?: () => void;
      readAsDataURL() {
        this.result = "data:image/png;base64,iVBORw0KGgo=";
        this.onload?.();
      }
    },
  );
  state.save.mockResolvedValue({
    uri: "file:///data/user/0/com.kuska.app/files/kuska-images/cached.png",
  });
});
afterEach(() => {
  sql.close();
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

it("reads private photos with the original image ID through the authenticated binary API", async () => {
  const original = record("binary-browser");
  const [result] = await resolveImages("service", [original]);
  expect(state.request.mock.calls[0][0]).toBe(
    "/api/imagenes/servicio/original-photo-binary-browser/archivo",
  );
  expect(state.request.mock.calls[0][4]).toBe("blob");
  expect(result.image).toMatch(/^blob:/);
  expect(result.imageReference).toBe(original.image);
  URL.revokeObjectURL(result.image);
});
it("caches Android downloads as private files and preserves their references after SQLite is reopened", async () => {
  state.native = true;
  const original = record("native-persistent-cache");
  const [first] = await resolveImages("service", [original]);
  expect(first.image).toMatch(/^file:/);
  expect(state.save).toHaveBeenCalledTimes(1);
  sql.close();
  reopen();
  state.request.mockClear();
  vi.stubGlobal("navigator", { onLine: false });
  const [offline] = await resolveImages("service", [original]);
  expect(offline.image).toBe(first.image);
  expect(state.request).not.toHaveBeenCalled();
  expect(sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([
    { name: "CacheLecturasRemotas" },
  ]);
});
it("does not replace the public reference with a fake download if the server fails", async () => {
  state.request.mockRejectedValue(new Error("offline"));
  const original = record("download-unavailable");
  expect((await resolveImages("service", [original]))[0].image).toBe(original.image);
  expect(state.save).not.toHaveBeenCalled();
});
it("keeps a malformed external reference from breaking the entire feed", async () => {
  const original = {
    ...record("malformed-external"),
    image: "https://blobkuska.blob.core.windows.net/imagenes/kuska/%GG",
  };
  expect(await resolveImages("service", [original])).toEqual([original]);
  expect(state.request).not.toHaveBeenCalled();
});
it("does not show a different account's local photo when publication IDs coincide", async () => {
  const original = { ...record("account-isolation"), image: "" };
  saveBrowserImage("service", original.id, "data:image/png;base64,cHJpdmF0ZQ==");
  const [result] = await resolveImages("service", [original]);
  expect(result.image).toBe(""); expect(result.imagePending).not.toBe(true);
});
it("uses the confirmed remote photo for its owner and removes the pending indication", async () => {
  const original = { ...record("confirmed-owner"), ownerId: "reader" };
  saveBrowserImage("service", original.id, "data:image/png;base64,bG9jYWw=");
  localStorage.setItem(`kuska:image-uploaded:service:${original.id}`, original.image);
  const [result] = await resolveImages("service", [original]);
  expect(result.image).toMatch(/^blob:/); expect(result.imagePending).toBe(false);
  expect(result.imageReference).toBe(original.image);
});
it("requires matching ID and a remote URL before accepting an upload confirmation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4]))));
  state.request.mockResolvedValue({ id: "wrong-id", url: "https://blobkuska.blob.core.windows.net/imagenes/kuska/test" });
  await expect(uploadLocalImage("service", "id", "img-id", "data:image/png;base64,test")).rejects.toThrow("no confirmó");
});
it("compresses legacy pending photos before building the multipart upload with the correct MIME", async () => {
  const bytes = new Uint8Array(2 * 1024 * 1024);
  bytes.set([137,80,78,71,13,10,26,10]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes)));
  const compressed = new Blob([new Uint8Array([255,216,255,1,2,3])], { type: "image/jpeg" });
  const prepare = vi.spyOn(compression, "compressImage").mockResolvedValue(compressed);
  state.request.mockResolvedValue({ id: "img-legacy", url: "https://blobkuska.blob.core.windows.net/imagenes/kuska/legacy" });
  try {
    await uploadLocalImage("service", "legacy", "img-legacy", "file:///pending.png");
    const uploaded = (state.request.mock.calls[0][1].body as FormData).get("archivo") as File;
    expect(uploaded.type).toBe("image/jpeg"); expect(uploaded.size).toBe(compressed.size);
    expect(uploaded.name).toBe("foto.jpg");
  } finally { prepare.mockRestore(); }
});
it("keeps failed browser uploads pending, shows the error and backs off repeated feed reads", async () => {
  const retry = vi.fn();
  vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout: retry }));
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4]))));
  const original = { ...record("failed-browser"), ownerId: "reader", image: "" };
  saveBrowserImage("service", original.id, "data:image/png;base64,dGVzdA==");
  state.request.mockRejectedValue(new Error("No se pudo subir la fotografía."));
  await tryUploadBrowserImage("service", original.id);
  await tryUploadBrowserImage("service", original.id);
  expect(state.request).toHaveBeenCalledTimes(1);
  expect(browserImageIsPending("service", original.id)).toBe(true);
  expect((await resolveImages("service", [original]))[0].imageError).toContain("No se pudo subir");
  expect(retry).toHaveBeenCalledWith(expect.any(Function), 2000);
});
