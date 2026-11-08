# Auditoría de catálogos de Kuska

Fecha: 8 de noviembre de 2026 (America/Lima). Alcance: archivo local `kuska_sqlite.sql`; estos resultados no prueban el contenido actual de Azure SQL.

## Comprobación ejecutada

`node scripts/audit-catalogs.mjs` crea SQLite exclusivamente en memoria, ejecuta el esquema dos veces y consulta sus tablas. Motor utilizado: SQLite 3.54.0 incluido en Node. El alias Python instalado no pudo ejecutarse; no se utilizó Python para esta comprobación.

| Tabla | Registros |
| --- | ---: |
| Departamentos | 25 |
| Distritos | 1111 |
| CategoriasServicio | 11 |
| CanalesAyuda | 43 |

La segunda ejecución conserva las cantidades. `PRAGMA foreign_key_check` no devuelve infracciones. No se detectan canales duplicados por institución, tipo, teléfono y ámbito. Las 43 filas tienen fuente y fecha registradas, pero esa presencia por sí sola no demuestra que el teléfono continúe vigente.

## Cobertura geográfica local

El catálogo **no está completo**. La tabla `Distritos` conserva `NombreProvincia`; no existe una tabla independiente de provincias y los selectores las derivan de las filas disponibles. Las relaciones siempre se resuelven por `IdDistrito` e `IdDepartamento`.

| Departamento | Provincias presentes | Distritos presentes |
| --- | ---: | ---: |
| Amazonas | 0 | 0 |
| Ancash | 20 | 166 |
| Apurimac | 7 | 85 |
| Arequipa | 0 | 0 |
| Ayacucho | 11 | 124 |
| Cajamarca | 13 | 127 |
| Callao | 0 | 0 |
| Cusco | 13 | 116 |
| Huancavelica | 7 | 102 |
| Huanuco | 11 | 84 |
| Ica | 0 | 0 |
| Junin | 9 | 125 |
| La Libertad | 0 | 0 |
| Lambayeque | 0 | 0 |
| Lima | 1 | 43 |
| Loreto | 0 | 0 |
| Madre de Dios | 0 | 0 |
| Moquegua | 0 | 0 |
| Pasco | 3 | 29 |
| Piura | 0 | 0 |
| Puno | 13 | 110 |
| San Martin | 0 | 0 |
| Tacna | 0 | 0 |
| Tumbes | 0 | 0 |
| Ucayali | 0 | 0 |

Los nombres de esta tabla reproducen el respaldo, con su ortografía original. No se afirma que los departamentos con filas estén completos. Lima solo contiene la provincia Lima.

**Caso Bellavista:** la única fila local corresponde a Cajamarca, provincia Jaén, `IdDistrito=493`. No corresponde a Bellavista del Callao. El selector no sustituye un distrito por otro homónimo: el usuario elige departamento, provincia y distrito.

Callao tiene siete distritos según [RENIEC, publicación de marzo de 2026](https://identidad.reniec.gob.pe/b/reniec-provincia-constitucional-del-callao-registra-867-525-electores-para-las-elecciones-regionales-y-municipales). La lista también aparece en el [compendio del INEI, tabla 1.2](https://www.inei.gob.pe/media/MenuRecursivo/publicaciones_digitales/Est/Lib1696/libro.pdf): Callao, Bellavista, Carmen de la Legua Reynoso, La Perla, La Punta, Ventanilla y Mi Perú. Ninguno está asociado a Callao en la semilla local auditada.

Se preparó `docs/catalogos_callao.azure.sql`, **sin ejecutarlo**. Por defecto solo consulta faltantes (`@Aplicar=0`). La carga propuesta exige confirmar `IdDistrito` como identity mediante `COLUMNPROPERTY`; falla antes de escribir si el esquema central no lo cumple. JPA declara identity, pero no contamos con evidencia directa de esa propiedad en Azure SQL. La carga no modifica registros existentes. Después de revisión y aplicación por el equipo, el catálogo debe recibirse por la API para conservar los mismos IDs en Android. No corresponde insertar esos distritos de manera independiente en SQLite ni tomar `493` como ID de Bellavista del Callao.

Para los demás faltantes se requiere una exportación oficial completa y versionada de UBIGEO, comparar la clave natural departamento/provincia/distrito con el catálogo central, revisar homónimos y acentos y preparar una carga aditiva de los faltantes. No se descargó ni aplicó una lista de terceros. No se inventó la cantidad nacional actual de distritos.

## Emergencias

La semilla contiene 6 canales nacionales, 16 regionales y 21 distritales. No contiene canales interdistritales. Los distritales corresponden a Lima; no existe un canal distrital de Bellavista del Callao en este respaldo. No se agregó ningún teléfono.

Las fuentes registradas son etiquetas del respaldo, como “Portal del Estado Peruano” y `gob.pe/547`, con fecha `2026-11-07`. Esta auditoría no certifica nuevamente los números ni una comunicación real con autoridades. La interfaz muestra contactos con fuente y fecha, su cobertura y su fecha registrada; los datos offline se identifican como guardados y posiblemente desactualizados.

El filtro incluye un canal nacional; un regional únicamente si coincide `IdDepartamento`; uno distrital o interdistrital únicamente si coincide el `IdDistrito` registrado. No interpreta nombres parciales ni una descripción como prueba de cobertura adicional. Los teléfonos alternativos separados por `/` generan enlaces de llamada independientes.

## Categorías

Las 11 categorías locales son Gasfiteria, Electricidad, Carpinteria, Clases, Mascotas, Transporte, Hogar, Jardineria, Belleza, Tecnologia y Eventos. Restaurantes y negocios de comida no se añadieron al catálogo. El formulario carga las categorías reales de la API o las previamente guardadas. El agente puede encontrar una categoría nueva si ya existe en datos reales, sin modificar el esquema ni presentar ejemplos externos como negocios reales.

## Cloudflare: prueba externa real

La consulta de solo lectura a la URL existente `https://kuska-agente-api.kuska-app.workers.dev/buscar` respondió **HTTP 200**. Consulta utilizada: “Busco un electricista en Bellavista hasta 50 soles”. Resultado comprobado: `usoIA=true`, `filtros={categoria:"electricidad", distrito:"Bellavista", maxPrecio:50, estricto:false}`, un resultado marcado DEMO y `busquedaAmpliada=false`. No se escribieron registros.

El cliente consume el contrato `filtros` comprobado y busca después en los repositorios reales de Kuska. Un límite explícito en la consulta tiene prioridad sobre el filtro remoto. Los resultados externos DEMO se identifican y no se vinculan a perfiles inventados. Esta prueba no demuestra que D1 y Azure SQL estén sincronizados; no se encontró un mecanismo que lo acredite.

## Estado de validación

La ejecución en memoria valida el esquema y las semillas locales, no el plugin SQLite en un teléfono. Las pruebas Vitest cubren filtros geográficos, contactos duplicados, alternativas de teléfono, caché web, presupuestos y conservación de IDs. La prueba en dispositivo, la actualización efectiva de catálogos desde Azure y la aplicación de la carga revisada continúan pendientes.
