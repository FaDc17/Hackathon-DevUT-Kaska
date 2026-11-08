import { describe, expect, it } from "vitest";
import type { Service } from "../../types";
import {
  distinctInstruction,
  guidanceForAction,
  planAppAssistance,
  type AssistantAppState,
} from "./appAssistance";
const app: AssistantAppState = { userId: "owner", visits: ["home", "services"] };
const record: Service = {
  id: "real",
  ownerId: "owner",
  owner: "Vecina",
  title: "Servicio real",
  description: "Reparaciones",
  category: "Electricidad",
  district: "Bellavista",
  createdAt: 1,
  priceMin: 30,
  priceMax: 40,
  priceLabel: "S/ 30–40",
  currency: "PEN",
  location: "Plaza",
  contactPhone: "",
  image: "",
  reviews: [],
};
const plan = (
  q: string,
  state: Parameters<typeof planAppAssistance>[1] = null,
  observed = app,
  records = [record],
) => planAppAssistance(q, state, observed, records, []);

describe("assistance grounded in Kuska's actual screens and activity", () => {
  it.each([
    ["Abre Servicios", "services"],
    ["Muéstrame Comunidad", "solidarity"],
    ["Quiero consultar emergencias", "emergency"],
    ["Abre mi perfil", "profile"],
  ])("navigates once for %s", (query, screen) => {
    expect(plan(query)?.execute).toEqual({ kind: "screen", screen });
  });
  it("opens the real publication form on request, without persisting or submitting anything", () => {
    const response = plan("Quiero publicar un servicio")!;
    expect(response.execute).toEqual({ kind: "createService" });
    expect(response.text).toContain("tú pulses Publicar");
    expect(plan("¿Cómo publico un servicio?")?.execute).toBeUndefined();
  });
  it("understands confirmation of the previous task instead of asking the goal again", () => {
    const initial = plan("Cómo publicar un servicio")!;
    expect(plan("Sí", initial.guidance)?.execute).toEqual({ kind: "createService" });
    expect(plan("Volver")?.execute).toEqual({ kind: "back" });
    expect(plan("Quiero cambiar mi nombre")?.actions).toEqual([{ kind: "editProfile" }]);
  });
  it("does not navigate to the same screen again on an acknowledgment after returning", () => {
    const navigated = plan("Abre Servicios")!;
    const continued = plan("Sí", navigated.guidance)!;
    expect(continued.execute).toBeUndefined();
    expect(continued.text).toContain("Mostrar todos");
    expect(plan("¿Y luego?", continued.guidance)?.text).not.toBe(continued.text);
  });
  it("opens a suggested list on confirmation even if that screen was visited earlier", () => {
    const observed = { ...app, visits: ["profile" as const] };
    const response = plan("Mis servicios", null, observed)!;
    expect(response.execute).toBeUndefined();
    expect(plan("Sí", response.guidance, observed)?.execute).toEqual({
      kind: "screen",
      screen: "profile",
    });
  });
  it("continues from the next step without repeating the initial navigation instructions", () => {
    const initial = plan("¿Cómo publicar un servicio?")!;
    const next = plan("¿Y luego?", initial.guidance)!;
    const confirm = plan("Ya está listo", next.guidance)!;
    expect(new Set([initial.text, next.text, confirm.text]).size).toBe(3);
    expect(confirm.text).toContain("Pulsa Publicar servicio");
    expect(confirm.execute).toBeUndefined();
  });
  it("responds to difficulty without blindly advancing the task", () => {
    const initial = plan("Quiero publicar un servicio")!;
    const blocked = plan("No encuentro el botón", initial.guidance)!;
    expect(blocked.guidance?.step).toBe(initial.guidance?.step);
    expect(blocked.actions).toContainEqual({ kind: "createService" });
    expect(blocked.suggestions).toContain("Me aparece un error");
  });
  it("acknowledges reaching Services and offers the form instead of sending the user to the start", () => {
    const initial = plan("Cómo publicar un servicio")!;
    const reached = plan("Ya estoy en Servicios", initial.guidance)!;
    expect(reached.actions).toEqual([{ kind: "createService" }]);
    expect(reached.text).not.toContain("abre Servicios");
  });
  it("confirms only observed saves after the task started and keeps local/pending photos explicit", () => {
    const initial = plan("Quiero publicar un servicio")!;
    const savedApp: AssistantAppState = {
      ...app,
      lastSaved: { kind: "service", id: "real", revision: 1 },
    };
    const saved = plan("Ya lo hice", initial.guidance, savedApp, [
      { ...record, syncStatus: "pendiente", imagePending: true },
    ])!;
    expect(saved.text).toContain("Guardaste «Servicio real»");
    expect(saved.text).toContain("envío al servidor sigue pendiente");
    expect(saved.text).toContain("fotografía todavía está pendiente");
    expect(plan("Ya publiqué", initial.guidance)?.text).not.toContain("Guardaste");
    expect(
      plan("Ya publiqué", { ...initial.guidance!, eventRevision: 1 }, savedApp)?.text,
    ).not.toContain("Guardaste");
  });
  it("uses real loaded data, excludes demos and preserves legacy owner mappings", () => {
    const records = [
      record,
      { ...record, id: "demo", isDemo: true },
      { ...record, id: "another", ownerId: "stranger" },
    ];
    expect(plan("Cuántos servicios hay", null, app, records)?.text).toContain("2 servicios");
    expect(plan("Mis servicios", null, app, records)?.text).toContain("1 servicio");
    expect(
      plan("Mis servicios", null, { ...app, userId: "local-owner", remoteUserId: "owner" }, records)
        ?.text,
    ).toContain("1 servicio");
  });
  it("knows the actual last viewed record and never offers the removed recovery flow", () => {
    expect(
      plan("¿Qué estoy viendo?", null, { ...app, visits: ["serviceDetail"], serviceId: "real" })
        ?.text,
    ).toContain("Servicio real");
    const recovery = plan("Quiero recuperar mi contraseña")!;
    expect(recovery.text).toContain("todavía no está disponible");
    expect(recovery.actions).toEqual([{ kind: "screen", screen: "profile" }]);
  });
  it("leaves service searches and provider selection to the existing search flow", () => {
    for (const query of [
      "Busco electricista en Bellavista hasta 50 soles",
      "El contacto del segundo",
      "Hola hijito",
    ])
      expect(plan(query)).toBeNull();
  });
  it("avoids repeating identical canned instructions and clears a canceled task", () => {
    const initial = plan("Cómo publicar un servicio")!;
    const changed = distinctInstruction(initial.text, [initial.text]);
    expect(changed).not.toBe(initial.text);
    expect(distinctInstruction(initial.text, [initial.text, changed])).not.toBe(changed);
    expect(plan("Cancelar", initial.guidance)?.guidance).toBeNull();
    expect(guidanceForAction({ kind: "createService" }, null, app).step).toBe(1);
  });
});
