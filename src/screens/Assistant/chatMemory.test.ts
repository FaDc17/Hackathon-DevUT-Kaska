import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ChatSnapshot } from "./chatMemory";
import type { SecureSession } from "../../services/secureSession";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../../services/secureSession", () => ({ getSecureSession: getSession }));

const firstSession: SecureSession = { userId: "user-a", accessToken: "session-a" };
let memory: typeof import("./chatMemory");

function conversation(): ChatSnapshot {
  return {
    messages: [
      { id: 1, sender: "user", text: "Busco electricista", time: "10:00" },
      {
        id: 2,
        sender: "agent",
        text: "Encontré dos opciones.",
        time: "10:00",
        acciones: ["services"],
        sugerencias: ["Uno más barato"],
      },
    ],
    context: {
      query: "electricista en Bellavista hasta 50 soles",
      district: "Bellavista",
      resultIds: ["service-a", "service-b"],
      postIds: ["post-a"],
      selectedId: "service-b",
      pending: "contact",
      page: 1,
    },
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-08T15:00:00Z"));
  vi.stubGlobal("window", new EventTarget());
  // Accessing persistent storage would fail this suite.
  vi.stubGlobal("localStorage", {
    setItem: () => {
      throw new Error("No disk storage");
    },
  });
  vi.stubGlobal("sessionStorage", {
    setItem: () => {
      throw new Error("No disk storage");
    },
  });
  getSession.mockReset();
  getSession.mockResolvedValue(firstSession);
  memory = await import("./chatMemory");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("memoria temporal del chatbot", () => {
  it("restaura mensajes, filtros y selección al volver con la misma sesión", async () => {
    expect(await memory.restoreChat()).toBeNull();
    const saved = conversation();
    memory.saveChat(saved);
    expect(await memory.restoreChat()).toEqual(saved);
  });

  it("no comparte conversaciones entre usuarios ni entre tokens del mismo usuario", async () => {
    await memory.restoreChat();
    memory.saveChat(conversation());
    getSession.mockResolvedValue({ userId: "user-b", accessToken: "session-b" });
    expect(await memory.restoreChat()).toBeNull();
    memory.saveChat(conversation());
    getSession.mockResolvedValue(firstSession);
    expect(await memory.restoreChat()).toBeNull();
    memory.saveChat(conversation());
    getSession.mockResolvedValue({ ...firstSession, accessToken: "renewed-session" });
    expect(await memory.restoreChat()).toBeNull();
  });

  it("no guarda antes de identificar una sesión fiable ni usa una memoria de invitado compartida", async () => {
    memory.saveChat(conversation());
    expect(await memory.restoreChat()).toBeNull();
    getSession.mockResolvedValue(null);
    expect(await memory.restoreChat()).toBeNull();
    memory.saveChat(conversation());
    expect(await memory.restoreChat()).toBeNull();
    getSession.mockResolvedValue(firstSession);
    expect(await memory.restoreChat()).toBeNull();
  });

  it("descarta la conversación si falla la lectura de identidad", async () => {
    await memory.restoreChat();
    memory.saveChat(conversation());
    getSession.mockRejectedValueOnce(new Error("SecureStorage unavailable"));
    expect(await memory.restoreChat()).toBeNull();
    expect(await memory.restoreChat()).toBeNull();
  });

  it("caduca a los treinta minutos desde la última escritura y permite iniciar otra conversación", async () => {
    await memory.restoreChat();
    memory.saveChat(conversation());
    vi.advanceTimersByTime(29 * 60 * 1000);
    expect(await memory.restoreChat()).not.toBeNull();
    vi.advanceTimersByTime(60 * 1000);
    expect(await memory.restoreChat()).toBeNull();
    memory.saveChat(conversation());
    expect(await memory.restoreChat()).not.toBeNull();
  });

  it("conserva solo los sesenta mensajes más recientes", async () => {
    await memory.restoreChat();
    memory.saveChat({
      messages: Array.from({ length: 85 }, (_, id) => ({
        id,
        sender: "user" as const,
        text: `Mensaje ${id}`,
        time: "10:00",
      })),
      context: null,
    });
    const restored = await memory.restoreChat();
    expect(restored?.messages).toHaveLength(60);
    expect(restored?.messages[0].id).toBe(25);
    expect(restored?.messages.at(-1)?.id).toBe(84);
  });

  it("copia defensivamente mensajes, acciones, sugerencias y contexto", async () => {
    await memory.restoreChat();
    const saved = conversation();
    memory.saveChat(saved);
    saved.messages[0].text = "Modificado";
    saved.messages[1].acciones!.push("profile");
    saved.messages[1].sugerencias!.push("Otra sugerencia");
    saved.context!.resultIds.push("unexpected");
    saved.context!.postIds.length = 0;
    const first = await memory.restoreChat();
    expect(first).toEqual(conversation());
    first!.messages.length = 0;
    first!.context!.selectedId = "other";
    expect(await memory.restoreChat()).toEqual(conversation());
  });

  it("reiniciar borra historial y filtros y permite guardar mensajes nuevos", async () => {
    await memory.restoreChat();
    memory.saveChat(conversation());
    memory.clearChat();
    expect(await memory.restoreChat()).toBeNull();
    const empty = { messages: [], context: null };
    memory.saveChat(empty);
    expect(await memory.restoreChat()).toEqual(empty);
  });

  it.each(["kuska:unauthorized", "kuska:account-deleted"])(
    "limpia e invalida la identidad ante %s aunque la pantalla ya no esté montada",
    async (event) => {
      await memory.restoreChat();
      memory.saveChat(conversation());
      window.dispatchEvent(new Event(event));
      memory.saveChat(conversation());
      expect(await memory.restoreChat()).toBeNull();
    },
  );

  it("registra una sola pareja de listeners aunque se restaure repetidamente", async () => {
    const add = vi.spyOn(window, "addEventListener");
    await memory.restoreChat();
    await memory.restoreChat();
    await memory.restoreChat();
    expect(add.mock.calls.map(([event]) => event)).toEqual([
      "kuska:unauthorized",
      "kuska:account-deleted",
    ]);
  });

  it("un evento de cierre invalida una restauración de identidad todavía pendiente", async () => {
    let resolveSession!: (session: SecureSession) => void;
    getSession.mockReturnValueOnce(
      new Promise<SecureSession>((resolve) => {
        resolveSession = resolve;
      }),
    );
    const restoring = memory.restoreChat();
    window.dispatchEvent(new Event("kuska:unauthorized"));
    resolveSession(firstSession);
    expect(await restoring).toBeNull();
    memory.saveChat(conversation());
    expect(await memory.restoreChat()).toBeNull();
  });
});
