import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Post, Service } from "../../types";

const state = vi.hoisted(() => ({
  db: null as unknown,
  native: true,
  session: { accessToken: "test-only-token", userId: "owner-real-id" } as {
    accessToken: string;
    userId: string;
  } | null,
  request: vi.fn(),
}));
vi.mock("../connection", () => ({ getDatabase: async () => state.db }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => state.native, convertFileSrc: (s: string) => s },
  registerPlugin: () => ({}),
}));
vi.mock("../../services/secureSession", () => ({
  getSecureSession: async () => state.session,
  clearSecureSession: async () => {
    state.session = null;
  },
}));
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

import { createService, deleteService, listServices, updateService, addReview } from "./services";
import { createPost, deletePost, listPosts, updatePost, addComment } from "./posts";
import {
  pendingSyncOperations,
  markSyncOperationSucceeded,
  markSyncOperationFailed,
  ensureQueueOwnership,
} from "./syncQueue";
import { cacheRemoteUser } from "./users";
import { isRemoteImage, persistSelectedImage } from "../../services/images";
import { updateProfileOnlineOrQueue, deleteOwnAccount } from "../../services/session";
import { ApiError } from "../../services/apiClient";

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
        for (const item of statements) sql.prepare(item.statement).run(...(item.values as never[]));
        sql.exec("COMMIT;");
      } catch (error) {
        sql.exec("ROLLBACK;");
        throw error;
      }
    },
  };
}
const service = (id = "service-original-text-001"): Service => ({
  id,
  ownerId: "owner-real-id",
  owner: "Vecina",
  title: "Reparación",
  description: "Instalación de un enchufe",
  categoryId: 1,
  category: "Electricidad",
  priceLabel: "S/ 20 – S/ 40",
  priceMin: 20,
  priceMax: 40,
  currency: "PEN",
  district: "Chachapoyas",
  createdAt: 1_770_000_000_000,
  contactPhone: "987654321",
  location: "Zona pública",
  image: "",
  reviews: [],
});
const post = (id = "post-original-text-001"): Post => ({
  id,
  ownerId: "owner-real-id",
  owner: "Vecina",
  title: "Ayuda comunitaria",
  description: "Se ofrece ayuda",
  typeId: 1,
  category: "Necesito",
  district: "Chachapoyas",
  location: "Plaza",
  createdAt: 1_770_000_000_000,
  comments: [],
});
const remoteService = (id = "remote-original-id") => ({
  id,
  ownerId: "owner-real-id",
  owner: "Vecina",
  phone: "987654321",
  district: "Chachapoyas",
  districtId: 1,
  categoryId: 1,
  category: "Electricidad",
  title: "Remoto",
  description: "Contenido remoto",
  priceMin: 20,
  priceMax: 40,
  location: "Plaza",
  latitude: null,
  longitude: null,
  publishedAt: "2026-02-01T12:00:00",
  images: [],
  reviews: [],
});

beforeEach(async () => {
  state.native = true;
  state.session = { accessToken: "test-only-token", userId: "owner-real-id" };
  state.request.mockReset();
  state.request.mockResolvedValue([]);
  online(false);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
  });
  const target = new EventTarget();
  vi.stubGlobal("window", Object.assign(target, { setTimeout, clearTimeout }));
  directory = mkdtempSync(join(tmpdir(), "kuska-data-test-"));
  fixturePath = join(directory, "kuska.sqlite");
  openDatabase();
  sql.exec(readFileSync(join(process.cwd(), "kuska_sqlite.sql"), "utf8"));
  // Test-only people; the schema's real geographic/catalog seeds remain unchanged.
  sql
    .prepare(
      "INSERT INTO Usuarios (IdUsuario,NombreUsuario,ContrasenaHash,Celular,DireccionPrivada,IdDistrito,SyncEstado) VALUES (?,?,'',?,'Dirección de prueba',1,'sincronizado');",
    )
    .run("owner-real-id", "Vecina", "987654321");
  sql
    .prepare(
      "INSERT INTO Usuarios (IdUsuario,NombreUsuario,ContrasenaHash,Celular,DireccionPrivada,IdDistrito,SyncEstado) VALUES (?,?,'',?,'Dirección de prueba',1,'sincronizado');",
    )
    .run("other-owner", "OtroVecino", "986543210");
  // Migrations are normally run lazily once per process; fresh test databases need the latest columns.
  sql.exec(
    "ALTER TABLE ColaSincronizacion ADD COLUMN OwnerId TEXT; ALTER TABLE ColaSincronizacion ADD COLUMN ClientOperationId TEXT;",
  );
  await ensureQueueOwnership();
});
afterEach(() => {
  sql.close();
  for (const path of [fixturePath, `${fixturePath}-wal`, `${fixturePath}-shm`])
    if (existsSync(path)) unlinkSync(path);
  rmdirSync(directory);
  vi.unstubAllGlobals();
});

describe("SQLite content persistence and its existing synchronization queue", () => {
  it("keeps original textual IDs, pending content and local photos after reopening the database", async () => {
    await createService({
      ...service(),
      image: "http://localhost/_capacitor_file_/persistent.jpg",
    });
    await createPost(post());
    sql.close();
    openDatabase();
    const services = await listServices();
    expect(services[0].id).toBe("service-original-text-001");
    expect(services[0].imagePending).toBe(true);
    expect(services[0].syncStatus).toBe("pendiente");
    expect((await listPosts())[0].id).toBe("post-original-text-001");
    const queued = await pendingSyncOperations();
    expect(queued.map((item) => item.Entidad)).toEqual(["Servicios", "Publicaciones"]);
    expect(queued[0].ClientOperationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(queued[0].Payload!).images).toEqual([]);
  });
  it("commits the local write and queue together if a foreign key fails", async () => {
    await expect(createService({ ...service(), categoryId: 999999 })).rejects.toThrow();
    expect(sql.prepare("SELECT COUNT(*) AS n FROM Servicios").get()?.n).toBe(0);
    expect(sql.prepare("SELECT COUNT(*) AS n FROM ColaSincronizacion").get()?.n).toBe(0);
  });
  it("keeps newer pending edits when an older operation is acknowledged and orders each entity", async () => {
    await createService(service());
    await updateService({ ...service(), title: "Edición más reciente" });
    const first = await pendingSyncOperations();
    expect(first).toHaveLength(1);
    expect(first[0].Operacion).toBe("crear");
    await markSyncOperationSucceeded(first[0].IdOperacion, "Servicios", String(service().id));
    expect((await listServices())[0].syncStatus).toBe("pendiente");
    const second = await pendingSyncOperations();
    expect(second).toHaveLength(1);
    expect(second[0].Operacion).toBe("actualizar");
    expect(second[0].ClientOperationId).not.toBe(first[0].ClientOperationId);
    expect((await listServices())[0].title).toBe("Edición más reciente");
  });
  it("hides deletions offline and after acknowledgment even when a stale API snapshot contains the record", async () => {
    online(true);
    state.request.mockResolvedValue([remoteService()]);
    expect((await listServices())[0].id).toBe("remote-original-id");
    await deleteService("remote-original-id", "owner-real-id");
    expect(await listServices()).toEqual([]);
    const operation = (await pendingSyncOperations())[0];
    await markSyncOperationSucceeded(operation.IdOperacion, "Servicios", "remote-original-id");
    expect(await listServices()).toEqual([]);
    online(false);
    sql.close();
    openDatabase();
    expect(await listServices()).toEqual([]);
  });
  it("does not replace pending edits with remote values and does not send a different account queue", async () => {
    await createService(service("shared-id"));
    await updateService({ ...service("shared-id"), title: "Edición local" });
    online(true);
    state.request.mockResolvedValue([remoteService("shared-id")]);
    expect((await listServices())[0].title).toBe("Edición local");
    state.session = { accessToken: "other-test-token", userId: "other-owner" };
    expect(await pendingSyncOperations()).toEqual([]);
    await expect(deleteService("shared-id", "owner-real-id")).rejects.toThrow("Solo puedes");
  });
  it("updates and tombstones a community post without losing its original key", async () => {
    await createPost(post());
    await updatePost({ ...post(), description: "Texto corregido" });
    expect((await listPosts())[0].description).toBe("Texto corregido");
    await deletePost(post().id, "owner-real-id");
    expect(await listPosts()).toEqual([]);
    sql.close();
    openDatabase();
    expect(await listPosts()).toEqual([]);
    expect(
      sql.prepare("SELECT Eliminado FROM Publicaciones WHERE IdPublicacion=?").get(post().id)
        ?.Eliminado,
    ).toBe(1);
  });
  it("keeps review/reply IDs intact in pending operations for public cached content", async () => {
    await addReview("service-original-id", {
      id: "review-original-id",
      user: "Vecina",
      userId: "owner-real-id",
      stars: 5,
      comment: "Gracias",
      date: "2026-02-01",
    });
    await addComment("post-original-id", {
      id: "reply-original-id",
      user: "Vecina",
      userId: "owner-real-id",
      content: "Puedo ayudar",
      createdAt: 1,
    });
    expect((await pendingSyncOperations()).map((item) => item.EntidadId)).toEqual([
      "review-original-id",
      "reply-original-id",
    ]);
  });
  it("does not clear a real session if the server rejects account deletion", async () => {
    online(true);
    state.request.mockRejectedValue(new ApiError("Contraseña incorrecta", 403, "INVALID_PASSWORD"));
    await expect(deleteOwnAccount("wrong-password")).rejects.toThrow();
    expect(state.session?.userId).toBe("owner-real-id");
    expect(sql.prepare("SELECT COUNT(*) AS n FROM Usuarios").get()?.n).toBe(2);
  });
  it("clears the session after server-confirmed account deletion even if local cleanup fails", async () => {
    online(true);
    state.request.mockResolvedValue(undefined);
    const adapter = state.db as { executeSet: () => Promise<void> };
    adapter.executeSet = async () => {
      throw new Error("disk-full-test");
    };
    await expect(deleteOwnAccount("valid-password")).rejects.toThrow(
      "El servidor eliminó tu cuenta",
    );
    expect(state.session).toBeNull();
  });
  it("requires a real backend confirmation for web profile changes instead of a nonexistent web queue", async () => {
    state.native = false;
    state.request.mockRejectedValue(new ApiError("Sin conexión", 0, "NETWORK_ERROR"));
    await expect(
      updateProfileOnlineOrQueue({
        id: "owner-real-id",
        name: "Vecina",
        phone: "987654321",
        address: "Dirección real",
        district: "Chachapoyas",
        districtId: 1,
        avatar: "V",
        about: "",
      }),
    ).rejects.toThrow("Sin conexión");
    expect(localStorage.getItem("kuska-cached-user")).toBeNull();
  });
  it("never uploads Capacitor localhost file references as remote HTTPS images", async () => {
    expect(isRemoteImage("https://localhost/_capacitor_file_/data/user/0/photo.jpg")).toBe(false);
    expect(isRemoteImage("https://127.0.0.1/photo.jpg")).toBe(false);
    expect(isRemoteImage("https://storage.example.com/photo.jpg")).toBe(true);
    await createService({
      ...service(),
      image: "https://localhost/_capacitor_file_/persistent.jpg",
    });
    expect(JSON.parse((await pendingSyncOperations())[0].Payload!).images).toEqual([]);
    expect((await listServices())[0].imagePending).toBe(true);
  });
  it("caches a real authenticated district absent from the bundled geographic subset", async () => {
    const user = await cacheRemoteUser({
      id: "callao-user",
      username: "BellavistaUser",
      phone: "985432109",
      address: "Privada",
      districtId: 99999,
      district: "Bellavista",
      province: "Callao",
      departmentId: 7,
      department: "Callao",
      about: "",
    });
    expect(user.districtId).toBe(99999);
    expect(user.district).toBe("Bellavista");
    const row = sql
      .prepare("SELECT NombreProvincia,NombreDistrito FROM Distritos WHERE IdDistrito=99999;")
      .get();
    expect(row).toMatchObject({ NombreProvincia: "Callao", NombreDistrito: "Bellavista" });
  });
  it("rejects conflicting geographic IDs instead of attaching the user to a homonymous district", async () => {
    await expect(
      cacheRemoteUser({
        id: "wrong-district-user",
        username: "DistrictUser",
        phone: "985432109",
        address: "Privada",
        districtId: 1,
        district: "Bellavista",
        province: "Callao",
        departmentId: 7,
        department: "Callao",
        about: "",
      }),
    ).rejects.toThrow("no coincide");
    expect(
      sql.prepare("SELECT COUNT(*) AS n FROM Usuarios WHERE IdUsuario=?").get("wrong-district-user")
        ?.n,
    ).toBe(0);
  });
  it("preserves legacy local ownership when the secure session uses its mapped remote ID", async () => {
    sql
      .prepare("UPDATE Usuarios SET RemoteId=? WHERE IdUsuario=?")
      .run("remote-owner-id", "owner-real-id");
    state.session = { accessToken: "test", userId: "remote-owner-id" };
    await createService(service());
    expect((await listServices())[0].ownerId).toBe("owner-real-id");
    expect((await pendingSyncOperations())[0].OwnerId).toBe("remote-owner-id");
  });
  it("replaces a permanently rejected create with the corrected payload while preserving create ordering", async () => {
    await createService(service());
    const original = (await pendingSyncOperations())[0];
    await markSyncOperationFailed(original.IdOperacion, "INVALID_OPERATION");
    expect(await pendingSyncOperations()).toEqual([]);
    await updateService({ ...service(), title: "Título corregido" });
    const corrected = await pendingSyncOperations();
    expect(corrected).toHaveLength(1);
    expect(corrected[0].Operacion).toBe("crear");
    expect(corrected[0].ClientOperationId).not.toBe(original.ClientOperationId);
    expect(JSON.parse(corrected[0].Payload!).title).toBe("Título corregido");
  });
  it("allows deleting a permanently rejected local creation without retrying an impossible remote delete", async () => {
    await createPost(post());
    const original = (await pendingSyncOperations())[0];
    await markSyncOperationFailed(original.IdOperacion, "INVALID_OPERATION");
    await deletePost(post().id, "owner-real-id");
    expect(await pendingSyncOperations()).toEqual([]);
    expect(await listPosts()).toEqual([]);
  });
  it("persists the edited publication type in SQLite", async () => {
    await createPost(post());
    const solidarityId = Number(
      sql
        .prepare("SELECT IdTipoPublicacion FROM TiposPublicacion WHERE NombreTipo=?")
        .get("Solidaridad")?.IdTipoPublicacion,
    );
    await updatePost({ ...post(), typeId: solidarityId, category: "Solidaridad" });
    expect((await listPosts())[0].category).toBe("Solidaridad");
  });
  it("removes only the confirmed account data and preserves unrelated cached content", async () => {
    await createService(service());
    sql
      .prepare("UPDATE Usuarios SET RemoteId=? WHERE IdUsuario=?")
      .run("remote-owner-id", "owner-real-id");
    state.session = { accessToken: "test", userId: "remote-owner-id" };
    sql.exec(
      "CREATE TABLE IF NOT EXISTS CacheLecturasRemotas (Ruta TEXT PRIMARY KEY, Payload TEXT NOT NULL);",
    );
    sql.prepare("INSERT INTO CacheLecturasRemotas (Ruta,Payload) VALUES (?,?)").run(
      "/api/servicios",
      JSON.stringify([
        { ...remoteService(), ownerId: "remote-owner-id" },
        {
          ...remoteService("other-service"),
          ownerId: "other-owner",
          reviews: [
            { id: "own-review", userId: "remote-owner-id" },
            { id: "other-review", userId: "other-owner" },
          ],
        },
      ]),
    );
    online(true);
    state.request.mockResolvedValue(undefined);
    sql
      .prepare("INSERT INTO CacheLecturasRemotas (Ruta,Payload) VALUES (?,?)")
      .run("/api/usuarios/remote-owner-id/favoritos", '[{"id":"other-service"}]');
    sql
      .prepare("INSERT INTO CacheLecturasRemotas (Ruta,Payload) VALUES (?,?)")
      .run("/api/usuarios/other-owner/favoritos", '[{"id":"other-service"}]');
    await deleteOwnAccount("valid-password");
    expect(state.session).toBeNull();
    expect(sql.prepare("SELECT COUNT(*) AS n FROM Usuarios").get()?.n).toBe(1);
    expect(sql.prepare("SELECT COUNT(*) AS n FROM Servicios").get()?.n).toBe(0);
    expect(
      sql
        .prepare("SELECT COUNT(*) AS n FROM ColaSincronizacion WHERE OwnerId IN (?,?)")
        .get("remote-owner-id", "owner-real-id")?.n,
    ).toBe(0);
    expect(
      sql
        .prepare("SELECT Payload FROM CacheLecturasRemotas WHERE Ruta=?")
        .get("/api/usuarios/remote-owner-id/favoritos"),
    ).toBeUndefined();
    expect(
      sql
        .prepare("SELECT Payload FROM CacheLecturasRemotas WHERE Ruta=?")
        .get("/api/usuarios/other-owner/favoritos"),
    ).toBeDefined();
    const cached = JSON.parse(
      String(
        sql.prepare("SELECT Payload FROM CacheLecturasRemotas WHERE Ruta='/api/servicios'").get()
          ?.Payload,
      ),
    );
    expect(cached).toHaveLength(1);
    expect(cached[0].id).toBe("other-service");
    expect(cached[0].reviews).toEqual([{ id: "other-review", userId: "other-owner" }]);
  });
  it("rejects oversized or unsupported selected images before reading them into memory", async () => {
    await expect(
      persistSelectedImage({ type: "image/svg+xml", size: 200 } as File),
    ).rejects.toThrow("JPG, PNG o WebP");
    await expect(
      persistSelectedImage({ type: "image/jpeg", size: 6 * 1024 * 1024 } as File),
    ).rejects.toThrow("hasta 5 MB");
  });
  it("deletes a remote owned service using its legacy local owner without breaking the SQLite foreign key", async () => {
    sql
      .prepare("UPDATE Usuarios SET RemoteId=? WHERE IdUsuario=?")
      .run("remote-owner-id", "owner-real-id");
    state.session = { accessToken: "test", userId: "remote-owner-id" };
    online(true);
    state.request.mockResolvedValue([{ ...remoteService(), ownerId: "remote-owner-id" }]);
    await deleteService("remote-original-id", "owner-real-id");
    expect(await listServices()).toEqual([]);
    expect(
      sql
        .prepare("SELECT IdUsuario,Eliminado FROM Servicios WHERE IdServicio=?")
        .get("remote-original-id"),
    ).toMatchObject({ IdUsuario: "owner-real-id", Eliminado: 1 });
  });
  it("rejects a spoofed local owner on an existing service before changing its text or photo", async () => {
    await createService(service());
    state.session = { accessToken: "other-test", userId: "other-owner" };
    await expect(
      updateService({
        ...service(),
        ownerId: "other-owner",
        image: "https://storage.example.com/spoof.jpg",
        title: "Ajeno",
      }),
    ).rejects.toThrow("Solo puedes");
    expect(sql.prepare("SELECT Titulo FROM Servicios").get()?.Titulo).toBe("Reparación");
    expect(sql.prepare("SELECT COUNT(*) AS n FROM ImagenesServicio").get()?.n).toBe(0);
  });
});
