import { describe, expect, it } from "vitest";
import type { Post, Service } from "../../types";
import type { ConversationContext } from "./chatMemory";
import { planConversation, resultSummary } from "./chatConversation";
import { buscarServiciosLocales, categoriaDeConsulta, extraerPresupuesto } from "./hybridSearch";

function service(id: string, owner: string, price: number, district = "Bellavista"): Service {
  return {
    id,
    owner,
    ownerId: `owner-${id}`,
    title: `Electricista ${owner}`,
    description: "Reparaciones eléctricas e instalación de luminarias",
    category: "Electricidad",
    district,
    priceMin: price,
    priceMax: price,
    priceLabel: `S/ ${price}`,
    currency: "PEN",
    contactPhone: "900000000",
    createdAt: 1,
    location: district,
    image: "",
    reviews: [],
  };
}

const services: Service[] = [
  service("ana", "Ana Pérez", 40),
  service("luis", "Luis Soto", 60),
  service("ana-torres", "Ana Torres", 90, "Callao"),
  {
    ...service("gasfitero", "José Díaz", 35),
    category: "Gasfiteria",
    title: "Gasfitero José Díaz",
  },
];
const context: ConversationContext = {
  query: "busco electricista en bellavista hasta 100 soles",
  district: "Bellavista",
  resultIds: ["ana", "luis"],
  postIds: [],
};

function plan(text: string, previous: ConversationContext | null = null, records = services) {
  return planConversation(text, previous, records, [], "Bellavista");
}

function search(text: string, previous: ConversationContext | null = null) {
  const result = plan(text, previous);
  expect(result.kind).toBe("search");
  if (result.kind !== "search") throw new Error(`Expected search for: ${text}`);
  return result;
}

describe("conversación del Agente Kuska", () => {
  it("responde a saludos, agradecimientos y cancelaciones sin buscar ni perder los filtros", () => {
    for (const text of ["hola", "¡Hola!", "gracias", "no", "no gracias", "sí"]) {
      const response = plan(text, context);
      expect(response.kind, text).toBe("reply");
      if (response.kind === "reply") expect(response.text.length).toBeGreaterThan(15);
    }
    expect(context.query).toBe("busco electricista en bellavista hasta 100 soles");
  });

  it("acumula oficio, distrito y presupuesto sin exigir repetir la consulta", () => {
    const initial = search("Busco un electricista en Bellavista");
    const next = search("uno de menos de 50 soles", {
      ...initial.context,
      resultIds: ["ana", "luis"],
    });
    expect(categoriaDeConsulta(next.query)).toBe("electricidad");
    expect(next.context.district).toBe("Bellavista");
    expect(extraerPresupuesto(next.query)).toEqual({ max: 50, estricto: true });
    expect(next.preferLocal).toBe(true);
    expect(
      buscarServiciosLocales(next.query, services, "Bellavista").map((item) => item.id),
    ).toEqual(["ana"]);
  });

  it("reemplaza el presupuesto anterior y conserva ambos extremos de un intervalo", () => {
    const response = search("mejor entre 40 y 60 soles", context);
    expect(extraerPresupuesto(response.query)).toEqual({ min: 40, max: 60, estricto: false });
    expect(response.query).not.toContain("100");
    expect(
      buscarServiciosLocales(response.query, services, "Bellavista").map((item) => item.id),
    ).toEqual(["ana", "luis"]);
  });

  it("conserva los decimales del presupuesto al interpretar el mensaje", () => {
    const response = search("menos de 50,50 soles", context);
    expect(extraerPresupuesto(response.query)).toEqual({ max: 50.5, estricto: true });
  });

  it("cambia el distrito manteniendo el oficio y permite quitar el presupuesto después", () => {
    const relocated = search("ahora en Callao", context);
    expect(relocated.context.district).toBe("Callao");
    expect(relocated.query).not.toMatch(/en bellavista/i);
    expect(extraerPresupuesto(relocated.query).max).toBe(100);
    const unlimited = search("sin presupuesto", relocated.context);
    expect(extraerPresupuesto(unlimited.query).max).toBeNull();
    expect(categoriaDeConsulta(unlimited.query)).toBe("electricidad");
    expect(unlimited.context.district).toBe("Callao");
  });

  it("un oficio nuevo limpia los filtros y la selección de la búsqueda anterior", () => {
    const response = search("busco un gasfitero", {
      ...context,
      selectedId: "ana",
      pending: "contact",
      district: "Callao",
    });
    expect(categoriaDeConsulta(response.query)).toBe("gasfiteria");
    expect(extraerPresupuesto(response.query).max).toBeNull();
    expect(response.context).toMatchObject({ district: "Bellavista", resultIds: [], postIds: [] });
    expect(response.context.selectedId).toBeUndefined();
    expect(response.context.pending).toBeUndefined();
    expect(response.preferLocal).toBe(false);
  });

  it("resuelve el contacto por ordinal y por nombre del proveedor", () => {
    for (const text of ["Dame el contacto del segundo", "El teléfono de Luis"]) {
      const response = plan(text, context);
      expect(response.kind, text).toBe("selection");
      if (response.kind === "selection") {
        expect(response.action).toBe("contact");
        expect(response.service.id).toBe("luis");
        expect(response.context.selectedId).toBe("luis");
      }
    }
  });

  it("pide aclaración ante varios proveedores y recuerda qué acción se solicitó", () => {
    const question = plan("Dame el contacto", context);
    expect(question.kind).toBe("reply");
    if (question.kind !== "reply") throw new Error("Expected clarification");
    expect(question.context?.pending).toBe("contact");
    const answer = plan("el segundo", question.context ?? null);
    expect(answer.kind).toBe("selection");
    if (answer.kind === "selection") {
      expect(answer.action).toBe("contact");
      expect(answer.service.id).toBe("luis");
    }
  });

  it("permite cambiar los filtros mientras se está aclarando una solicitud de contacto", () => {
    const response = search("mejor menos de 50 soles", { ...context, pending: "contact" });
    expect(extraerPresupuesto(response.query)).toEqual({ max: 50, estricto: true });
    expect(response.context.resultIds).toEqual([]);
  });

  it("un nombre compartido exige aclaración aunque hubiera una selección previa", () => {
    const response = plan("dame el contacto de Ana", {
      ...context,
      resultIds: ["ana", "ana-torres"],
      selectedId: "ana",
    });
    expect(response.kind).toBe("reply");
    if (response.kind === "reply") expect(response.text).toContain("proveedor");
  });

  it("el nombre completo distingue proveedores que comparten un nombre", () => {
    const response = plan("dame el contacto de Ana Pérez", {
      ...context,
      resultIds: ["ana", "ana-torres"],
      selectedId: "ana-torres",
    });
    expect(response.kind).toBe("selection");
    if (response.kind === "selection") expect(response.service.id).toBe("ana");
  });

  it("un nombre explícito desconocido pide aclaración aunque solo hubiera un resultado", () => {
    const response = plan("dame el contacto de Pedro", {
      ...context,
      resultIds: ["ana"],
      selectedId: "ana",
    });
    expect(response.kind).toBe("reply");
    if (response.kind === "reply") {
      expect(response.text).toContain("No identifiqué");
      expect(response.context?.selectedId).toBeUndefined();
    }
  });

  it("no usa la selección anterior cuando una aclaración contiene un nombre desconocido", () => {
    const response = plan("Pedro", { ...context, pending: "contact", selectedId: "ana" });
    expect(response.kind).toBe("reply");
  });

  it("pedir el contacto de otro oficio inicia una nueva búsqueda", () => {
    const response = search("Dame el contacto de un gasfitero", { ...context, selectedId: "ana" });
    expect(categoriaDeConsulta(response.query)).toBe("gasfiteria");
    expect(response.context.pending).toBe("contact");
    expect(response.context.selectedId).toBeUndefined();
  });

  it("un oficio desconocido no reutiliza el proveedor de un oficio anterior", () => {
    const response = plan("necesito el contacto de un mecánico", {
      ...context,
      resultIds: ["ana"],
      selectedId: "ana",
    });
    expect(response.kind).not.toBe("selection");
  });

  it("las búsquedas explícitas de oficios desconocidos mantienen su tema y presupuesto", () => {
    for (const subject of ["mecánico", "pollería"]) {
      for (const previous of [null, context]) {
        const response = search(`busco un ${subject} hasta 50 soles`, previous);
        expect(response.query).toContain(subject === "mecánico" ? "mecanico" : "polleria");
        expect(response.query).not.toContain("electricista");
        expect(extraerPresupuesto(response.query).max).toBe(50);
        expect(response.preferLocal).toBe(false);
      }
    }
  });

  it("pedir uno más barato sigue siendo un ajuste de la búsqueda actual", () => {
    const response = search("necesito uno más barato", context);
    expect(categoriaDeConsulta(response.query)).toBe("electricidad");
    expect(response.preferLocal).toBe(true);
    expect(extraerPresupuesto(response.query)).toEqual({ max: 40, estricto: true });
  });

  it("una selección de contacto pendiente no bloquea navegación ni ayuda de la aplicación", () => {
    const pending: ConversationContext = { ...context, pending: "contact" };
    expect(plan("abre mapa", pending)).toEqual({ kind: "navigate", destination: "map" });
    expect(plan("abre servicios", pending)).toEqual({ kind: "navigate", destination: "services" });
    const profile = plan("mi perfil", pending);
    expect(profile.kind).toBe("reply");
    if (profile.kind === "reply") expect(profile.acciones).toContain("profile");
    const publish = plan("cómo publicar un servicio", pending);
    expect(publish.kind).toBe("reply");
    if (publish.kind === "reply") expect(publish.acciones).toContain("services");
  });

  it("buscar reparación del celular no equivale a pedir el contacto del proveedor anterior", () => {
    for (const text of [
      "necesito reparar mi celular",
      "busco reparación de un teléfono",
      "quiero arreglar el celular",
    ]) {
      const response = search(text, { ...context, pending: "contact", selectedId: "ana" });
      expect(categoriaDeConsulta(response.query), text).toBe("tecnologia");
      expect(response.context.pending, text).toBeUndefined();
      expect(response.context.selectedId, text).toBeUndefined();
    }
    const explicitContact = search("necesito el contacto para reparar mi celular", context);
    expect(explicitContact.context.pending).toBe("contact");
  });

  it("una nueva zona en una petición de contacto no reutiliza los resultados de otra zona", () => {
    const response = search("Dame el contacto de un electricista en Callao", {
      ...context,
      selectedId: "ana",
    });
    expect(response.context.district).toBe("Callao");
    expect(response.context.selectedId).toBeUndefined();
  });

  it("un ordinal fuera de rango no cae en el proveedor previamente seleccionado", () => {
    const response = plan("dame el contacto del quinto", { ...context, selectedId: "ana" });
    expect(response.kind).toBe("reply");
    if (response.kind === "reply") expect(response.text).toContain("no está disponible");
  });

  it("no desplaza los ordinales cuando desaparece un registro", () => {
    const remaining = services.filter((item) => item.id !== "ana");
    const missing = plan("dame el contacto del primero", context, remaining);
    expect(missing.kind).toBe("reply");
    const second = plan("dame el contacto del segundo", context, remaining);
    expect(second.kind).toBe("selection");
    if (second.kind === "selection") expect(second.service.id).toBe("luis");
  });

  it("las sugerencias conservan los números mostrados cuando se borran registros", () => {
    const remaining = services.filter((item) => item.id !== "ana");
    const response = plan("contacto de Pedro", context, remaining);
    expect(response.kind).toBe("reply");
    if (response.kind === "reply") expect(response.sugerencias).toEqual(["El segundo"]);
  });

  it("consulta la memoria solo ante preguntas específicas y no ante palabras dentro de una búsqueda", () => {
    const remembered = plan("¿Qué recuerdas?", context);
    expect(remembered.kind).toBe("reply");
    if (remembered.kind === "reply") expect(remembered.text).toContain(context.query);
    const response = search("busco un técnico para ampliar memoria de computadora", context);
    expect(categoriaDeConsulta(response.query)).toBe("tecnologia");
    expect(response.query).toContain("memoria");
    expect(search("busco un electricista de los que recuerdas", context).query).toContain(
      "electricista",
    );
  });

  it("la selección distingue abrir un detalle y consultar el perfil del proveedor", () => {
    const detail = plan("abre el segundo", context);
    const profile = plan("ver perfil del segundo", context);
    expect(detail.kind).toBe("selection");
    expect(profile.kind).toBe("selection");
    if (detail.kind === "selection") expect(detail.action).toBe("detail");
    if (profile.kind === "selection") expect(profile.action).toBe("profile");
  });

  it("conserva la navegación explícita y permite reiniciar la conversación", () => {
    expect(plan("abre servicios", context)).toEqual({ kind: "navigate", destination: "services" });
    expect(plan("abre el mapa", context)).toEqual({ kind: "navigate", destination: "map" });
    expect(plan("ir a mi perfil", context)).toEqual({ kind: "navigate", destination: "profile" });
    expect(plan("nueva conversación", context)).toEqual({ kind: "reset" });
  });

  it("solicita el oficio antes de aplicar un filtro sin contexto", () => {
    expect(plan("menos de 50 soles").kind).toBe("reply");
    expect(plan("necesito ayuda").kind).toBe("reply");
  });
});

describe("resumen de resultados del chat", () => {
  it("explica el alcance local y la posible antigüedad de los datos", () => {
    const summary = resultSummary([services[0]], [], true);
    expect(summary).toContain("una opción");
    expect(summary).toContain("guardados en este dispositivo");
    expect(summary).toContain("desactualizados");
    expect(summary).not.toMatch(/verificad|actualizad[oa]s en tiempo real/i);
    expect(resultSummary([], [], true)).toContain("No encontré coincidencias");
  });

  it("no presenta una lista limitada como un conteo completo del catálogo", () => {
    const summary = resultSummary([...services, service("extra", "Pedro López", 80)], [], false);
    expect(summary).toContain("cinco resultados");
    expect(summary).not.toContain("guardados en este dispositivo");
    const post = { id: "post", title: "Dono ropa" } as Post;
    expect(resultSummary([], [post], false)).toContain("abrir una publicación");
  });
});
