# Kuska: implementación y verificación de experiencia

Actualización posterior: el límite de fotografías, la compresión y el manejo multipart se corrigieron en [KUSKA_LIMITE_FOTOGRAFIAS.md](KUSKA_LIMITE_FOTOGRAFIAS.md). Los límites, conteos y huellas de artefactos de este informe son históricos de la revisión anterior.

Fecha: 8 de noviembre de 2026, America/Lima. Rama: `Actualizacion-del-chatBOT`.

Se trabajó sobre el proyecto existente. La inspección inicial encontró 39 archivos ya modificados y numerosos archivos nuevos del equipo. Esos cambios se conservaron. No hubo reset, commit, push, merge, despliegue, migración SQL compartida ni cambios de infraestructura.

## Estado por funcionalidad

| Funcionalidad | Clasificación | Alcance comprobado |
| --- | --- | --- |
| Iconos del catálogo | IMPLEMENTADA Y PROBADA | Nombres reales obtenidos de Azure; correspondencias verificadas por pruebas locales. |
| Gesto y actualización de listas | IMPLEMENTADA Y PROBADA | Eventos táctiles de Edge móvil y API simulada; publicación, edición y eliminación visibles sin reiniciar. |
| Ubicación escrita independiente | IMPLEMENTADA Y PROBADA | Navegador: escribir no busca, no cambia coordenadas ni persiste publicaciones. |
| Botón Usar mi ubicación | IMPLEMENTADA, PENDIENTE DE PRUEBA REAL | Se conserva el flujo existente; falta probar permisos/GPS en teléfono. |
| Renovación y expiración de sesión | IMPLEMENTADA, PENDIENTE DE PRUEBA REAL | Pruebas TypeScript y Spring con dependencias simuladas; necesita desplegar el nuevo endpoint. |
| Marcadores coincidentes | IMPLEMENTADA Y PROBADA | Agrupación, filtros y selección individual en navegador con datos sintéticos. |
| Persistencia y estados de fotografías | IMPLEMENTADA Y PROBADA | SQLite real en archivo; puente Android, HTTP y Blob simulados. |
| Subida real a Blob y lectura entre dos teléfonos | BLOQUEADA POR DEPENDENCIA EXTERNA | Faltan sesión/cuentas de prueba autorizadas y teléfonos. No se certifica que Blob funcione en producción. |
| Integración completa de imágenes | PARCIALMENTE IMPLEMENTADA | Código existente reutilizado y corregido; falta cerrar la comprobación remota anterior. |
| Agente: conversación, navegación, filtros y transición offline/online | IMPLEMENTADA Y PROBADA | Reglas/repositorios y navegador con API simulada; respuesta real del Worker comprobada aparte. |
| Consultas del agente sobre publicaciones productivas autenticadas | IMPLEMENTADA, PENDIENTE DE PRUEBA REAL | No se accedió a datos privados ni a una sesión productiva. |
| Compilación Android | IMPLEMENTADA Y PROBADA | APK debug compilado; no implica ejecución física. |
| Despliegue del backend y distribución/instalación del APK | REQUIERE AUTORIZACIÓN | No realizados. |

## 1. Iconos corregidos

El catálogo remoto devuelve `Gasfiteria`, `Carpinteria`, `Jardineria` y `Tecnologia`, sin tildes. El código anterior comparaba nombres exactos con una lista que contenía tildes, y carecía de iconos específicos para varias categorías.

El mapeo visual ahora normaliza tildes, espacios y mayúsculas, sin modificar nombres, IDs ni relaciones: Gasfitería→gota, Electricidad→rayo, Carpintería→martillo, Clases→libro, Mascotas→huella, Transporte→auto, Hogar→casa, Tecnología→computadora, Jardinería→hoja, Belleza→tijeras y Eventos→calendario. Otros y categorías desconocidas usan la cuadrícula genérica. Se amplió el componente SVG existente; se conservan tamaños y colores.

Inicio usa accesos de navegación a secciones, cuyos iconos ya correspondían a sus etiquetas; no se cambiaron.

## 2–3. Gesto y publicaciones sin reiniciar

El gesto comienza exclusivamente al inicio del desplazamiento. Requiere un arrastre vertical deliberado de aproximadamente 144 px; el indicador alcanza el umbral de 72 px mediante resistencia visual. Se cancelan movimientos hacia arriba, horizontales y multitáctiles. No comienza sobre controles, modales ni mapas. Una referencia bloquea recargas simultáneas del gesto/botón.

Se reutilizan `refreshFeed`, los repositorios, la caché, la cola SQLite y los eventos existentes. Hay un botón Actualizar como alternativa accesible. La lectura usa API cuando está disponible y conserva los datos guardados al fallar; el mensaje distingue caché y actualización online.

El guardado existente confirma primero la escritura o transacción local, actualiza el estado React e incorpora el resultado por ID. El refresco vuelve a consultar las páginas cargadas. Crear, editar, eliminar, comentarios y sincronización conservan sus flujos existentes. Al recuperar conexión o volver a la aplicación se reintenta la sincronización y se actualizan las listas. Mapa, perfil y agente consultan el conjunto completo del repositorio para no limitar sus registros a la primera página del feed.

La carga de favoritos ya existía en el detalle del servicio, con actualización local tras confirmar el cambio. No existe una pantalla independiente de listado de favoritos en la navegación actual; no se inventó una ruta nueva.

## 4–6. Ubicación y persistencia del formulario

Se retiraron únicamente la búsqueda escrita y el botón Buscar de `LocationPicker`, así como sus conexiones en Servicios, Comunidad y Emergencias. El endpoint geográfico y las búsquedas generales de la aplicación permanecen disponibles para sus otros usos.

El campo es texto controlado independiente. No se envía a Nominatim ni al backend geográfico, no mueve el mapa y no cambia coordenadas. La referencia inicial usa el distrito, nunca la dirección privada. El mapa sigue aceptando una selección manual opcional.

Usar mi ubicación conserva `getUserPosition`, permisos y redondeo aproximado. Solo modifica coordenadas temporales. Los botones auxiliares siguen siendo `type="button"`. La persistencia se ejecuta en el manejador de envío de Publicar/Guardar cambios. La prueba de navegador comprueba cero escrituras al introducir la referencia y una sola escritura al publicar.

## 7–8. Sesión

La causa comprobada en código es un JWT de acceso de 900.000 ms por defecto (15 minutos), sin renovación. No se encontró un temporizador de cierre por inactividad. Los errores de red ya se diferenciaban de 401; se conservaron esas comprobaciones y el acceso offline previamente autorizado de Android.

Se añadió `POST /api/auth/refresh`, protegido por la cadena JWT existente y la comprobación de cuenta activa. Solo acepta un token firmado y todavía vigente. La renovación mantiene la duración corta configurada y un `auth_time` firmado con límite absoluto de ocho horas desde la autenticación original; una cadena de renovaciones no extiende ese límite. Los tokens anteriores sin ese campo usan su fecha original de emisión.

El cliente renueva antes de expirar, durante el uso activo y antes de solicitudes autenticadas. Las llamadas simultáneas comparten una renovación; los fallos de red o un servidor antiguo sin el endpoint tienen espera entre reintentos y no invalidan un JWT vigente. Un 401 de una solicitud antigua ya no borra una sesión nueva. La expiración real también se comprueba offline durante el mantenimiento periódico. No se guardan contraseñas, no se cambia la clave JWT y no se añade una tabla de sesiones.

Se conserva la revocación disponible mediante el estado activo/eliminado de la cuenta. El proyecto no tenía una lista de revocación individual por token; no se afirma haber añadido esa capacidad. Android sigue usando su almacenamiento seguro existente; el acceso web de desarrollo no autentica Android.

Este endpoint necesita despliegue autorizado. Hasta entonces el cliente conserva el comportamiento seguro del servidor desplegado: un JWT realmente vencido requiere iniciar sesión nuevamente.

## 9–10. Publicaciones coincidentes en el mapa

Leaflet permanece como biblioteca. Los registros se agrupan por latitud/longitud exactas después de aplicar los filtros existentes. Se eliminan únicamente repeticiones de la misma identidad tipo+ID; los registros distintos se conservan.

Un punto con varias publicaciones abre una lista con cada título y tipo. Al elegir una aparece la vista previa correspondiente; Ver detalle abre su servicio o publicación original. No se desplazan ni inventan coordenadas. Las pruebas cubren tres servicios, tipos mezclados y filtros, además de selección individual real en el navegador con datos sintéticos.

## 11–15. Fotografías y Azure Blob Storage

El proyecto ya contenía persistencia local, subida multipart, lectura autenticada y un almacén Azure con claves derivadas de contenido para reintentos idempotentes. No se reemplazaron.

Almacenamiento real según el código:

- Android: bytes en archivos privados `files/kuska-images/`; SQLite conserva `RutaLocal`, `UrlRemota` y estado. La cola existente envía primero el padre y después la imagen.
- Web: la copia pendiente usa localStorage. La publicación de texto web requiere API; no se añadió una segunda cola offline web.
- Backend: `POST /api/imagenes` comprueba propietario y archivo, sube mediante `AzureBlobImageStore` y guarda la referencia HTTPS en las tablas de imágenes de Azure SQL. Los bytes no se guardan como Base64 en SQL.
- Otro usuario: el frontend conserva la referencia remota y recupera los bytes por `/api/imagenes/{tipo}/{imagenId}/archivo` con JWT. Se mantienen privados los contenedores y las credenciales permanecen en el backend.

Fallos encontrados y corregidos:

1. Los repositorios web sustituían incondicionalmente la referencia remota por la foto local y la marcaban pendiente. Ahora solo se muestra la copia pendiente de su propietario; tras confirmación se prefiere la referencia remota.
2. Una cuenta diferente podía recibir la foto local de un registro con el mismo ID. El overlay local se limita al propietario autenticado.
3. Los errores de subida web se ocultaban. Se conserva el error, se muestra un mensaje sencillo y se aplican esperas crecientes. Los fallos transitorios programan hasta cinco reintentos automáticos mediante los eventos de sincronización existentes; una actualización posterior puede reintentar. No hay solicitudes infinitas.
4. Se valida ID y URL HTTPS en la confirmación antes de marcar subida completada.
5. Una copia local antigua podía ocultar una fotografía remota actualizada desde otro dispositivo. Se respeta la nueva referencia del backend.
6. Editar solo texto podía perder la asociación de la copia offline de una imagen ya subida. Se conserva cuando la referencia remota sigue siendo la misma.
7. Reintentar el envío del mismo formulario podía copiar otra vez el mismo archivo seleccionado. Se reutiliza su persistencia mientras esa selección siga vigente.

El aviso pendiente no se oculta artificialmente: se muestra cuando existe una copia sin confirmación remota, o el error de subida correspondiente. Las pruebas verifican esos estados, la confirmación, conservación de originales, reintentos y referencias después de reabrir SQLite. Los puentes de archivos Android y Azure Blob se simulan en esas pruebas.

Comprobación externa real del 8 de noviembre, aproximadamente 17:35 America/Lima:

| Solicitud | Resultado observado |
| --- | --- |
| GET Azure `/actuator/health` | 200, `UP` |
| GET Azure `/api/catalogos/categorias-servicio` | 200, 11 categorías reales |
| GET Azure `/api/imagenes/estado` sin JWT | 401 |
| POST Worker `/buscar`, saludo sintético | 200, `usoIA=true`, cero resultados externos |

El 401 protege el endpoint y no demuestra disponibilidad de Blob. **No se ha confirmado una subida real, referencia en Azure SQL ni visualización desde un segundo teléfono.** Faltan cuentas/sesión de prueba autorizadas y dispositivos. No se crearon usuarios/publicaciones en la base compartida ni se cambiaron permisos para eludir esa comprobación.

No se pudo atribuir el fallo remoto concreto de las fotografías pendientes en Android a credenciales, permisos, versión desplegada u otra causa: no se inspeccionaron la configuración efectiva ni los logs autenticados de Azure. Las correcciones locales no sustituyen ese diagnóstico pendiente.

## 16–19. Agente existente

El chat conserva su diseño, Worker y contratos. Se mejoraron saludos coloquiales como «Hola, hijito», «Necesito ayuda», preguntas sobre dónde encontrar servicios, publicación y edición. Ofrece instrucciones cortas en español y acciones a las pantallas reales, sin rutas ficticias.

Las búsquedas consultan los repositorios de Kuska, no presentan resultados del D1 del Worker como proveedores reales. Cloudflare interpreta; los registros y contactos proceden de los repositorios. Se conservan exclusiones DEMO y controles sobre texto remoto. No se modificó el Worker ni se afirmó que D1 y Azure SQL estén sincronizados.

Offline, las reglas reconocen oficio, distrito y presupuesto y consultan SQLite/caché, incluso registros fuera de la página visible. No se llama a Cloudflare sin conexión. Una búsqueda nueva explícita vuelve a consultar online al recuperar internet; los ajustes breves del contexto pueden resolverse localmente. Se mantienen cancelación, plazo máximo y protección contra mensajes duplicados.

Se conservan rangos: un servicio de S/ 30–40 no se convierte en un precio exacto. Las pruebas existentes comprueban límites estrictos/inclusivos y descartan rangos cuyo máximo supera el presupuesto. No se publican direcciones privadas.

## 20–21. Archivos, diff y pruebas

La lista exacta de los archivos cambiados en esta tarea está en `KUSKA_ARCHIVOS_MODIFICADOS.txt`. `KUSKA_MEJORAS.diff` compara contra una copia tomada al inicio de esta tarea, por lo que separa estas modificaciones de las que ya estaban pendientes del equipo. Los archivos de este informe y del estado Git son documentación adicional.

| Verificación ejecutada | Resultado y límite |
| --- | --- |
| Base inicial: TypeScript y Vitest | TypeScript correcto; 181 pruebas iniciales aprobadas. |
| `npm.cmd run typecheck` final | Correcto. |
| `npm.cmd test -- --reporter=dot` final | 222 pruebas en 16 archivos, todas aprobadas; +41 respecto a la base. |
| Maven/Spring Boot | 60 pruebas en 11 suites, cero fallos/errores; repositorios y almacenamiento simulados. Incluye HTTP local con servidor de pruebas. |
| `node scripts/qa-experience.mjs` | 13 escenarios aprobados en Edge headless a 390×844, eventos táctiles y cambios reales de conectividad del navegador; API/Worker sintéticos interceptados, cero escrituras remotas. |
| `node scripts/verify-experience.mjs` | Lecturas remotas y consulta sintética al Worker; resultados externos descritos arriba. |
| Vite | Build correcto; queda el aviso de tamaño de un bundle superior a 500 kB. |
| Capacitor | `cap sync android` correcto. |
| Android/Gradle | `assembleDebug` correcto. |
| ADB | Lista de dispositivos vacía; no hubo instalación ni prueba física. |
| Git | `git diff --check` correcto. |

Los 13 escenarios de navegador cubren login, ubicación sin búsqueda/guardado anticipado, publicación única visible, edición, eliminación, tres servicios en un punto y selección correcta, dos publicaciones comunitarias coincidentes, desplazamiento normal sin recarga, gesto de actualización, saludo coloquial, búsqueda offline con rangos, recuperación online y navegación del agente.

PowerShell bloquea `npm.ps1`; se usó `npm.cmd` sin cambiar la política del sistema. Maven y Gradle necesitaron acceso autorizado a sus cachés locales fuera del sandbox. Capacitor requirió ejecución fuera del sandbox por un fallo de `os.userInfo` del entorno restringido. Estas incidencias se resolvieron sin modificar configuración de seguridad del equipo.

El APK se genera en `android/app/build/outputs/apk/debug/app-debug.apk`. Para este build se utilizó únicamente en el proceso la URL HTTPS existente documentada en el proyecto:

APK final: 15.142.698 bytes; SHA-256 `1580f9e09b55d38387d8a46bb007fc526c8844e4123bbb12523fc6cd2d3d5cf8`.

```powershell
$env:VITE_API_BASE_URL='https://kuska-api-fadc-akd8fkcrfpcwdgdj.eastus2-01.azurewebsites.net'
npm.cmd run build
.\node_modules\.bin\cap.cmd sync android
```

No se escribió un `.env` ni se cambió el valor por defecto en el código. Un build nativo posterior debe volver a recibir esa variable; compilar sin ella no acredita conectividad con Azure.

La consola del entorno de desarrollo conserva avisos anteriores sobre el registro repetido del plugin SecureStorage y elementos con imagen vacía en registros sin fotografía. Los escenarios del navegador no registraron excepciones de ejecución; estos avisos no acreditan ni invalidan una subida a Azure.

## 22–24. Pendientes, autorizaciones y Git final

Pendiente de prueba real: GPS/permisos, conservación de archivos/Keystore tras reiniciar Android, renovación contra el backend desplegado, escritura SQL autenticada, subida/lectura Blob con dos cuentas y dos teléfonos, y sincronización completa del teléfono tras recuperar conexión. Los tests simulados no sustituyen esas pruebas.

Antes de desplegar hay que autorizar el nuevo endpoint de renovación y revisar el diff junto con todos los cambios previos del equipo que entrarían en el mismo artefacto. La creación de datos compartidos para pruebas y cualquier cambio de configuración o permisos Azure también requieren autorización. No se encontró evidencia suficiente para proponer cambios de infraestructura.

El estado final completo de Git está en `KUSKA_GIT_FINAL.txt`. La rama sigue siendo `Actualizacion-del-chatBOT`, con cambios locales del equipo y de esta tarea sin commit. No se hizo push ni merge. Los cambios locales implementados y las dependencias externas pendientes quedan separados en la matriz inicial.
