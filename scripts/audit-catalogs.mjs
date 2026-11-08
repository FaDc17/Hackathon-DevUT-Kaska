// Ejecuta únicamente una base en memoria. No abre ni modifica las bases del usuario.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const db = new DatabaseSync(":memory:");
const schema = readFileSync(new URL("../kuska_sqlite.sql", import.meta.url), "utf8").replace(
  /^\uFEFF/,
  "",
);
db.exec(schema);
const all = (sql) => db.prepare(sql).all();
const counts = () =>
  Object.fromEntries(
    ["Departamentos", "Distritos", "CategoriasServicio", "CanalesAyuda"].map((table) => [
      table,
      db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
    ]),
  );
const initialCounts = counts();
db.exec(schema);
const report = {
  sqlite: all("SELECT sqlite_version() AS version")[0].version,
  counts: initialCounts,
  repeatedSeedCounts: counts(),
  foreignKeyViolations: all("PRAGMA foreign_key_check"),
  regions: all(
    "SELECT dep.NombreDepartamento AS departamento, COUNT(DISTINCT di.NombreProvincia) AS provincias, COUNT(di.IdDistrito) AS distritos FROM Departamentos dep LEFT JOIN Distritos di ON dep.IdDepartamento=di.IdDepartamento GROUP BY dep.IdDepartamento ORDER BY dep.NombreDepartamento",
  ),
  categories: all(
    "SELECT IdCategoria, NombreCategoria FROM CategoriasServicio ORDER BY IdCategoria",
  ),
  channelCoverage: all(
    "SELECT Cobertura, COUNT(*) AS cantidad FROM CanalesAyuda GROUP BY Cobertura",
  ),
  channelsWithoutVerification: all(
    "SELECT IdCanal FROM CanalesAyuda WHERE FuenteInformacion IS NULL OR trim(FuenteInformacion)='' OR FechaVerificacion IS NULL",
  ),
  duplicateChannels: all(
    "SELECT IdDepartamento, IdDistrito, NombreInstitucion, TipoAyuda, Telefono, COUNT(*) AS cantidad FROM CanalesAyuda GROUP BY IdDepartamento, IdDistrito, NombreInstitucion, TipoAyuda, Telefono HAVING COUNT(*) > 1",
  ),
  bellavista: all(
    "SELECT dep.NombreDepartamento, di.NombreProvincia, di.IdDistrito FROM Distritos di JOIN Departamentos dep ON dep.IdDepartamento=di.IdDepartamento WHERE di.NombreDistrito='Bellavista'",
  ),
};
console.log(JSON.stringify(report, null, 2));
db.close();
if (
  report.foreignKeyViolations.length ||
  JSON.stringify(report.counts) !== JSON.stringify(report.repeatedSeedCounts)
)
  process.exitCode = 1;
