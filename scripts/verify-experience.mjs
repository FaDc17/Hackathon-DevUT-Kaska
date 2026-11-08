// Read-only checks. Never logs tokens, credentials or provider information.
const api = process.env.VITE_API_BASE_URL || "https://kuska-api-fadc-akd8fkcrfpcwdgdj.eastus2-01.azurewebsites.net";
const checks = await Promise.all(["/actuator/health", "/api/imagenes/estado", "/api/catalogos/categorias-servicio"].map(async path => {
  try {
    const response = await fetch(new URL(path, api), { signal: AbortSignal.timeout(15000) });
    const value = await response.json().catch(() => null);
    return { path, httpStatus: response.status, health: path === "/actuator/health" ? value?.status : undefined,
      available: path === "/api/imagenes/estado" ? value?.available : undefined,
      categories: Array.isArray(value) ? value.map(({ id, nombre }) => ({ id, nombre })) : undefined };
  } catch { return { path, transportError: true }; }
}));
try {
  const response = await fetch("https://kuska-agente-api.kuska-app.workers.dev/buscar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mensaje: "Hola hijito", distritoUsuario: "Bellavista" }), signal: AbortSignal.timeout(15000),
  });
  const value = await response.json().catch(() => null);
  checks.push({ cloudflareStatus: response.status, usoIA: value?.usoIA, externalResultCount: value?.resultados?.length, hasFilters: !!value?.filtros });
} catch { checks.push({ cloudflareTransportError: true }); }
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), readOnly: true, checks }, null, 2));
