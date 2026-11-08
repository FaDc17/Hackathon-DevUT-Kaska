import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const state = vi.hoisted(() => ({
  db: null as unknown,
  native: true,
  session: { accessToken: "test-token", userId: "account-one" } as {
    accessToken: string;
    userId: string;
  } | null,
  request: vi.fn(),
}));
vi.mock("../connection", () => ({ getDatabase: async () => state.db }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => state.native } }));
vi.mock("../../services/secureSession", () => ({ getSecureSession: async () => state.session }));
vi.mock("../../services/apiClient", () => ({
  apiRequest: state.request,
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public code: string,
    ) {
      super(message);
    }
  },
}));

import { getFavoriteIds, setFavorite } from "./favorites";
import { ApiError } from "../../services/apiClient";
import { markSyncOperationSucceeded, pendingSyncOperations } from "./syncQueue";
import { cacheRemoteList } from "../../services/remoteRead";

let sql: DatabaseSync;
let fixturePath: string;
let directory: string;
const online = (value: boolean) => vi.stubGlobal("navigator", { onLine: value });
function openDatabase(): void {
  sql = new DatabaseSync(fixturePath);
  sql.exec("PRAGMA foreign_keys=ON;");
  state.db = {
    query: async (statement: string, values: unknown[] = []) => ({
      values: sql.prepare(statement).all(...(values as never[])),
    }),
    run: async (statement: string, values: unknown[] = []) => {
      const result = sql.prepare(statement).run(...(values as never[]));
      return {
        changes: { changes: Number(result.changes), lastId: Number(result.lastInsertRowid) },
      };
    },
    executeSet: async (statements: Array<{ statement: string; values: unknown[] }>) => {
      sql.exec("BEGIN;");
      try {
        for (const statement of statements)
          sql.prepare(statement.statement).run(...(statement.values as never[]));
        sql.exec("COMMIT;");
      } catch (error) {
        sql.exec("ROLLBACK;");
        throw error;
      }
    },
  };
}

beforeEach(() => {
  state.native = true;
  state.session = { accessToken: "test-token", userId: "account-one" };
  state.request.mockReset();
  state.request.mockResolvedValue([]);
  online(false);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("window", new EventTarget());
  directory = mkdtempSync(join(tmpdir(), "kuska-favorites-test-"));
  fixturePath = join(directory, "kuska.sqlite");
  openDatabase();
  sql.exec(readFileSync(join(process.cwd(), "kuska_sqlite.sql"), "utf8"));
  sql.exec(
    "ALTER TABLE ColaSincronizacion ADD COLUMN OwnerId TEXT; ALTER TABLE ColaSincronizacion ADD COLUMN ClientOperationId TEXT;",
  );
});
afterEach(() => {
  sql.close();
  for (const path of [fixturePath, `${fixturePath}-wal`, `${fixturePath}-shm`])
    if (existsSync(path)) unlinkSync(path);
  rmdirSync(directory);
  vi.unstubAllGlobals();
});

describe("favorites API and existing native SQLite queue", () => {
  it("loads original service identifiers from the real endpoint contract and removes duplicates", async () => {
    state.native = false;
    online(true);
    state.request.mockResolvedValue([
      { id: "service-original-text" },
      { id: "service-original-text" },
      { id: "another-id" },
    ]);
    expect(await getFavoriteIds()).toEqual(["service-original-text", "another-id"]);
    expect(state.request).toHaveBeenCalledWith("/api/usuarios/me/favoritos");
    online(false);
    expect(await getFavoriteIds()).toEqual(["service-original-text", "another-id"]);
  });

  it("persists native choices and ordered removals across reopening without inserting fake users or services", async () => {
    await setFavorite("service-original-text", true);
    sql.close();
    openDatabase();
    expect(await getFavoriteIds()).toEqual(["service-original-text"]);
    const first = (await pendingSyncOperations())[0];
    expect(first).toMatchObject({
      Entidad: "ServiciosFavoritos",
      EntidadId: "service-original-text",
      Operacion: "crear",
      OwnerId: "account-one",
    });
    expect(JSON.parse(first.Payload!)).toEqual({ serviceId: "service-original-text" });
    await setFavorite("service-original-text", false);
    expect(await getFavoriteIds()).toEqual([]);
    expect(sql.prepare("SELECT COUNT(*) AS n FROM Usuarios").get()?.n).toBe(0);
    expect(sql.prepare("SELECT COUNT(*) AS n FROM Servicios").get()?.n).toBe(0);
    expect(sql.prepare("SELECT COUNT(*) AS n FROM ServiciosFavoritos").get()?.n).toBe(0);
    expect(state.request).not.toHaveBeenCalled();
    await markSyncOperationSucceeded(
      first.IdOperacion,
      "ServiciosFavoritos",
      "service-original-text",
    );
    expect((await pendingSyncOperations())[0].Operacion).toBe("eliminar");
  });

  it("overlays unsent native changes over a stale server snapshot and retains the choice after acknowledgment offline", async () => {
    await setFavorite("service-new", true);
    online(true);
    state.request.mockResolvedValue([{ id: "service-old" }]);
    expect(await getFavoriteIds()).toEqual(["service-old", "service-new"]);
    const operation = (await pendingSyncOperations())[0];
    await markSyncOperationSucceeded(operation.IdOperacion, "ServiciosFavoritos", "service-new");
    online(false);
    sql.close();
    openDatabase();
    expect(await getFavoriteIds()).toEqual(["service-old", "service-new"]);
  });

  it("isolates both cached favorites and pending operations when the account changes", async () => {
    await setFavorite("private-favorite", true);
    state.session = { accessToken: "other-token", userId: "account-two" };
    expect(await getFavoriteIds()).toEqual([]);
    expect(await pendingSyncOperations()).toEqual([]);
    await setFavorite("second-account-favorite", true);
    expect(await getFavoriteIds()).toEqual(["second-account-favorite"]);
    state.session = { accessToken: "test-token", userId: "account-one" };
    expect(await getFavoriteIds()).toEqual(["private-favorite"]);
  });

  it("requires server confirmation for web changes and preserves cached state on rejection", async () => {
    state.native = false;
    await cacheRemoteList("/api/usuarios/account-one/favoritos", [{ id: "existing" }]);
    state.request.mockRejectedValue(new ApiError("Sin conexión", 0, "NETWORK_ERROR"));
    await expect(setFavorite("new", true)).rejects.toThrow("Sin conexión");
    expect(await getFavoriteIds()).toEqual(["existing"]);
    state.request.mockResolvedValue(undefined);
    await setFavorite("new/id", true);
    expect(state.request).toHaveBeenLastCalledWith("/api/servicios/new%2Fid/favorito", {
      method: "POST",
    });
    expect(await getFavoriteIds()).toEqual(["existing", "new/id"]);
    await setFavorite("new/id", false);
    expect(state.request).toHaveBeenLastCalledWith("/api/servicios/new%2Fid/favorito", {
      method: "DELETE",
    });
    expect(await getFavoriteIds()).toEqual(["existing"]);
  });

  it("uses saved favorites for network/server failures while rejecting unauthorized API reads", async () => {
    online(true);
    await cacheRemoteList("/api/usuarios/account-one/favoritos", [{ id: "saved" }]);
    state.request.mockRejectedValue(new ApiError("Servidor no disponible", 503, "SERVER_ERROR"));
    expect(await getFavoriteIds()).toEqual(["saved"]);
    state.request.mockRejectedValue(new ApiError("Sesión vencida", 401, "UNAUTHORIZED"));
    await expect(getFavoriteIds()).rejects.toThrow("Sesión vencida");
  });

  it("does not return another account's in-flight API response", async () => {
    online(true);
    state.request.mockImplementation(async () => {
      state.session = { accessToken: "other-token", userId: "account-two" };
      return [{ id: "first-account-only" }];
    });
    expect(await getFavoriteIds()).toEqual([]);
    online(false);
    expect(await getFavoriteIds()).toEqual([]);
  });

  it("requires a secure session before writing and never treats a local profile as authentication", async () => {
    state.session = null;
    expect(await getFavoriteIds()).toEqual([]);
    await expect(setFavorite("service", true)).rejects.toThrow("Inicia sesión");
    expect(state.request).not.toHaveBeenCalled();
    expect(sql.prepare("SELECT COUNT(*) AS n FROM ColaSincronizacion").get()?.n).toBe(0);
  });
});
