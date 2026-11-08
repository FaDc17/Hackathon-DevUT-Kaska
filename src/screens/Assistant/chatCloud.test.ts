import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consultCloud, conversationalCloudText, type CloudReply } from "./chatCloud";

const request = vi.fn();
const reply = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  vi.stubGlobal("fetch", request);
  request.mockReset();
  request.mockResolvedValue(reply({ resultados: [], usoIA: true }));
});

afterEach(() => vi.unstubAllGlobals());

describe("contrato remoto del chatbot", () => {
  it("conserva endpoint, contrato y señal sin enviar historial ni datos personales adicionales", async () => {
    const controller = new AbortController();
    await consultCloud("  Busco electricista  ", "  Bellavista  ", controller.signal);
    expect(request).toHaveBeenCalledWith("https://kuska-agente-api.kuska-app.workers.dev/buscar", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ mensaje: "Busco electricista", distritoUsuario: "Bellavista" }),
      signal: controller.signal,
    });
  });

  it("limita las entradas y limpia caracteres de control sin perder caracteres españoles", async () => {
    await consultCloud(`  ¿${"ñ".repeat(700)}\u0000  `, "Breña", new AbortController().signal);
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.mensaje).toHaveLength(600);
    expect(body.mensaje.startsWith("¿ñ")).toBe(true);
    expect(body.distritoUsuario).toBe("Breña");
  });

  it("admite texto conversacional sin exigir un array de resultados", async () => {
    request.mockResolvedValue(reply({ mensaje: "  ¡Hola! ¿Cómo puedo ayudarte?  ", usoIA: true }));
    expect(await consultCloud("Hola", "Bellavista", new AbortController().signal)).toEqual({
      mensaje: "¡Hola! ¿Cómo puedo ayudarte?",
      usoIA: true,
      filtros: undefined,
      hasExternalResults: false,
    });
  });

  it("valida los filtros y no convierte resultados externos en registros reales", async () => {
    request.mockResolvedValue(
      reply({
        resultados: [{ id: "external", telefono: "inventado" }],
        usoIA: "true",
        filtros: {
          categoria: " electricidad ",
          distrito: null,
          maxPrecio: 50,
          estricto: false,
          accion: "delete",
        },
      }),
    );
    expect(await consultCloud("Electricista", "Bellavista", new AbortController().signal)).toEqual({
      mensaje: undefined,
      usoIA: false,
      filtros: { categoria: "electricidad", distrito: null, maxPrecio: 50, estricto: false },
      hasExternalResults: true,
    });
  });

  it("limita el texto remoto a dos mil caracteres", async () => {
    request.mockResolvedValue(reply({ mensaje: `\u0000${"a".repeat(2500)}` }));
    const cloud = await consultCloud("Hola", "Bellavista", new AbortController().signal);
    expect(cloud.mensaje).toHaveLength(2000);
  });

  it.each([
    null,
    [],
    "texto sin contrato",
    {},
    { usoIA: true },
    { mensaje: "   " },
    { mensaje: 3 },
    { resultados: null },
    { resultados: {} },
    { filtros: null },
    { filtros: [] },
    { filtros: { categoria: 25 } },
    { filtros: { distrito: "a".repeat(101) } },
    { filtros: { maxPrecio: "50" } },
    { filtros: { maxPrecio: -1 } },
    { filtros: { maxPrecio: 100001 } },
    { filtros: { estricto: 1 } },
  ])("rechaza una respuesta malformada: %j", async (value) => {
    request.mockResolvedValue(reply(value));
    await expect(
      consultCloud("Hola", "Bellavista", new AbortController().signal),
    ).rejects.toThrow();
  });

  it("rechaza presupuestos no finitos incluso si el transporte entrega un objeto sin serializar", async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({ filtros: { maxPrecio: Number.NaN } }),
    });
    await expect(
      consultCloud("Hola", "Bellavista", new AbortController().signal),
    ).rejects.toThrow();
  });

  it("propaga fallos HTTP y JSON inválido hacia el respaldo local", async () => {
    request.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    await expect(consultCloud("Hola", "Bellavista", new AbortController().signal)).rejects.toThrow(
      "HTTP 503",
    );
    request.mockResolvedValueOnce(new Response("<html>Bad gateway</html>"));
    await expect(
      consultCloud("Hola", "Bellavista", new AbortController().signal),
    ).rejects.toThrow();
  });

  it("propaga la cancelación y no inicia una petición si ya estaba cancelada", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(consultCloud("Hola", "Bellavista", cancelled.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(request).not.toHaveBeenCalled();
    const failure = new DOMException("Cancelled", "AbortError");
    request.mockRejectedValueOnce(failure);
    await expect(consultCloud("Hola", "Bellavista", new AbortController().signal)).rejects.toBe(
      failure,
    );
  });

  it("no acepta una respuesta que llega después de la cancelación", async () => {
    const controller = new AbortController();
    request.mockResolvedValue({
      ok: true,
      json: async () => {
        controller.abort();
        return { mensaje: "Hola" };
      },
    });
    await expect(consultCloud("Hola", "Bellavista", controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("texto conversacional remoto sin datos de negocios", () => {
  const conversational = (mensaje: string, overrides: Partial<CloudReply> = {}): CloudReply => ({
    mensaje,
    usoIA: true,
    hasExternalResults: false,
    ...overrides,
  });

  it("permite una respuesta natural sin resultados ni filtros significativos", () => {
    const text = "¡Hola! Soy el asistente de Kuska. ¿Cómo puedo ayudarte?";
    expect(conversationalCloudText(conversational(text))).toBe(text);
    expect(
      conversationalCloudText(
        conversational(text, {
          filtros: { categoria: null, distrito: null, maxPrecio: null, estricto: false },
        }),
      ),
    ).toBe(text);
  });

  it.each([
    { hasExternalResults: true },
    { filtros: { categoria: "electricidad" } },
    { filtros: { distrito: "Bellavista" } },
    { filtros: { maxPrecio: 0 } },
    { filtros: { estricto: true } },
  ])("no muestra una respuesta ligada a búsquedas externas: %j", (overrides) => {
    expect(conversationalCloudText(conversational("¡Hola!", overrides))).toBeUndefined();
  });

  it.each([
    "Encontré tres electricistas.",
    "Estos son tus resultados.",
    "Este proveedor es verificado.",
    "El negocio de Juan es DEMO.",
    "El precio es veinte soles.",
    "Te recomiendo a Juan Pérez.",
    "Juan repara instalaciones.",
    "Llama al 987654321.",
    "Puedes escribir al +51 (987) 654-321.",
    "Más información en https://ejemplo.com",
    "Visita ejemplo.com/servicio",
    "[Juan](tel:987654321)",
    "<a href='https://ejemplo.com'>Hola</a>",
    "Abre la pantalla Facturación.",
    "Tu contraseña debe compartirse aquí.",
  ])("descarta recomendaciones, contactos o acciones no respaldadas: %s", (text) => {
    expect(conversationalCloudText(conversational(text))).toBeUndefined();
  });
});
