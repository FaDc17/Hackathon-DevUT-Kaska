# Kuska: implementación y verificación

> Actualización posterior: [Azure, health e imágenes](AZURE_HEALTH_E_IMAGENES.md). El App Service ahora responde catálogos con HTTP 200 y health con HTTP 401; la suite vigente es 55 Vitest y 41 Maven. El APK actual incorpora la URL HTTPS comprobada. Los tiempos de espera, conteos y hashes de esta revisión inicial se conservan como historial.

Revisión del 8 de noviembre de 2026, zona America/Lima. Rama: `feature/agente-kuska-hibrido`. La revisión comenzó en `a4dca6d`, con el árbol de trabajo limpio. Los commits existentes se conservan. No hubo push, merge, despliegue, cambios en infraestructura ni escrituras sobre Azure SQL.

Esta entrega modifica la aplicación existente. Conserva CSS, colores, tipografías, navegación, pantallas, Leaflet, Java/Spring, SQLite y Cloudflare. Incorpora controles de gestión y mensajes con los componentes actuales.

## Estado verificable

| Funcionalidad | Clasificación | Evidencia y límite |
| --- | --- | --- |
| Identificadores originales | IMPLEMENTADA Y PROBADA | Servicios, publicaciones, comentarios, reseñas y navegación aceptan IDs textuales originales. Pruebas de persistencia SQLite. |
| Crear, leer, editar y eliminar servicios/publicaciones | IMPLEMENTADA, PENDIENTE DE PRUEBA REAL | Interfaz conectada a repositorios, backend con permisos y borrado lógico; pruebas locales de Java y SQLite. Falta recorrido completo Android → App Service → Azure SQL. |
| Registro geográfico | PARCIALMENTE IMPLEMENTADA | Selectores departamento/provincia/distrito, IDs exactos, API y caché; catálogo local incompleto, incluido Callao. No se inventan filas ausentes. |
| Emergencias y canales | PARCIALMENTE IMPLEMENTADA | Cobertura nacional/regional/distrital, ID exacto, deduplicación y caché. No hay contactos distritales Callao en el respaldo. Fuente y fecha almacenadas no equivalen a verificar hoy cada teléfono. |
| Edición de perfil | IMPLEMENTADA, PENDIENTE DE PRUEBA REAL | Android conserva cambios pendientes y web exige confirmación API. Faltan pruebas remotas y en dispositivo. |
| Eliminar cuenta propia | IMPLEMENTADA, PENDIENTE DE PRUEBA REAL | Confirmación ELIMINAR, contraseña comprobada por backend, baja lógica transaccional y rechazo del JWT de cuentas inactivas. Limpieza local únicamente tras HTTP 204. No se eliminó ninguna cuenta real durante pruebas. |
| SQLite y persistencia al reiniciar | IMPLEMENTADA Y PROBADA | Base SQLite real en archivo temporal de prueba, cierre/reapertura, integridad referencial, escrituras y cola atómicas. El puente Capacitor aún requiere dispositivo. |
| Sincronización | PARCIALMENTE IMPLEMENTADA | Cola existente, aislamiento por cuenta, UUID por operación, orden, reintentos, ACK condicionado y tombstones. Sin versión/ETag para resolver ediciones simultáneas entre dispositivos ni registro duradero de idempotencia servidor. |
| Agente IA | PARCIALMENTE IMPLEMENTADA | Cloudflare real respondió HTTP 200 y filtros de IA; búsquedas locales y presupuestos probados. No hay evidencia de sincronización D1/Azure. Los resultados reales dependen de la API Kuska y su caché disponible. |
| Fotografías locales | IMPLEMENTADA, PENDIENTE DE PRUEBA REAL | Selección de archivo, plugin privado Android, ruta persistente, visualización local y marca pendiente. Plugin compilado; falta validar archivo y reinicio en dispositivo. |
| Fotografías remotas | BLOQUEADA POR DEPENDENCIA EXTERNA | No existe almacenamiento de imágenes autorizado disponible. No se envía Base64 ni rutas locales a SQL. El texto puede publicarse sin subir la foto. |
| Favoritos | IMPLEMENTADA, PENDIENTE DE PRUEBA REAL | Botón en detalle, API web, cola nativa y caché por cuenta. Ocho pruebas de repositorio sobre SQLite real; falta validar servidor compartido y dispositivo. |
| App Service público | BLOQUEADA POR DEPENDENCIA EXTERNA | DNS/TCP/TLS responden; HTTP agota timeout sin bytes. Falta acceso de lectura al recurso y sus registros. |
| Azure SQL real | BLOQUEADA POR DEPENDENCIA EXTERNA | No están disponibles las credenciales autorizadas de SQL ni una sesión de administración Azure. Los tests JDBC utilizan simulación. |
| Android/APK | IMPLEMENTADA, PENDIENTE DE PRUEBA REAL | Capacitor sincroniza y Gradle genera APK debug. ADB no encuentra dispositivos. La URL HTTPS productiva necesita configurarse y comprobarse antes de la prueba conectada. |
| Recuperación de contraseña | BLOQUEADA POR DEPENDENCIA EXTERNA | El proyecto no tiene un servicio de recuperación conectado. La pantalla informa esta limitación sin afirmar que registró una solicitud. |

## Cambios funcionales

Se reutilizan los controladores CRUD y JWT existentes. La interfaz ya no guarda contenido productivo únicamente en arrays de React ni publica mensajes de éxito antes de guardar. Los formularios esperan la escritura, preservan un ID por borrador y bloquean doble envío. Un error al refrescar la lista después de guardar no se presenta como un fallo de la escritura.

Los propietarios ven Editar y Eliminar en sus detalles; el backend vuelve a comprobar la propiedad. Los detalles inexistentes muestran ausencia de contenido y nunca abren el primer registro como sustituto. El perfil público se obtiene por ID exacto y excluye dirección privada y teléfono del usuario. El contacto visible procede del servicio publicado, sin números de respaldo ficticios.

Los formularios utilizan las categorías del catálogo. Se mantienen los intervalos oficiales de precio y se conserva el rango de registros anteriores al editar otros campos. No se añadieron categorías de restaurantes o comida. La búsqueda del agente exige que el precio máximo conocido cumpla el presupuesto; “menos de” es estricto y “hasta/máximo” es inclusivo. Los ejemplos Cloudflare se etiquetan DEMO y no abren proveedores inventados. Los registros de demostración heredados se identifican y se excluyen de las recomendaciones reales.

La autenticación local del navegador requiere explícitamente `VITE_ENABLE_LOCAL_AUTH=true` en desarrollo. Android y producción usan el backend JWT. El token web sigue en memoria; recargar el navegador exige autenticarse de nuevo. No se persiste el JWT en localStorage.

## Endpoints

| Ruta | Cambio |
| --- | --- |
| `GET /actuator/health` | Salud pública sin detalles internos. |
| `GET /api/catalogos/provincias?departamentoId=…` | Nuevo; provincias derivadas de Distritos.NombreProvincia. |
| `GET /api/catalogos/canales-ayuda?distritoId=…` | Incluye únicamente la cobertura registrada que corresponde al distrito. |
| `GET /api/usuarios/{id}/publico` | Nuevo; perfil público sin datos privados. |
| `DELETE /api/usuarios/me` | Nuevo; JSON `{password, confirmation:"ELIMINAR"}`, devuelve 204 tras confirmar la baja. Contraseña incorrecta: 403, conserva la sesión válida. |
| `PUT/DELETE /api/servicios/{id}` | Reutilizados, con protección del propietario y reintentos de borrado. |
| `PUT/DELETE /api/publicaciones/{id}` | Reutilizados, con protección del autor y eliminación lógica. |
| `PUT /api/servicios/{id}/resenas` | La interfaz utiliza el endpoint real y conserva IDs. |
| `POST /api/publicaciones/{id}/respuestas` | La interfaz utiliza el endpoint real; autor desde JWT. |
| `GET /api/usuarios/me/favoritos`, `POST/DELETE /api/servicios/{id}/favorito` | Reutilizados desde el detalle; caché aislada por cuenta y cola existente en Android. |
| `POST /api/sync/operations` | Se reutiliza el mecanismo existente y los IDs originales. |

## Tablas y almacenamiento

Se conservan Departamentos, Distritos, CategoriasServicio, TiposPublicacion, Usuarios, Servicios, ImagenesServicio, ServiciosFavoritos, ResenasServicio, Publicaciones, ImagenesPublicacion, RespuestasPublicacion, Emergencias, CanalesAyuda y ColaSincronizacion. No se creó otra base ni se cambió el esquema central.

SQLite recibe `CacheLecturasRemotas` para snapshots de lectura API: así se pueden consultar datos públicos sin crear usuarios privados ficticios para satisfacer claves foráneas. Las escrituras siguen en las tablas y cola existentes. La cola local incorpora OwnerId y ClientOperationId de forma aditiva. Los snapshots no reemplazan contenido pendiente ni restauran tombstones. El esquema inicial ya no exige cantidades exactas de catálogos después de una actualización válida.

La baja de cuenta utiliza transacción de desactivación y borrado lógico relacionado en el servidor, conservando claves foráneas. No equivale a una política de purga o anonimización. Tras confirmación remota se descarta la autoridad local, se retiran operaciones propias y datos correspondientes y se limpian fotografías privadas mediante rutas verificadas. Un fallo de disco se informa y no mantiene una sesión válida para una cuenta desactivada.

## Azure: resultado y acceso que falta

URL real aportada por el usuario: `https://kuska-api-fadc-akd8fkcrfpcwdgdj.eastus2-01.azurewebsites.net`.

La prueba externa conectó TCP 443 en 0,400 s y completó TLS en 0,540 s. La ruta de catálogo agotó 12,004 s sin bytes HTTP (`curl` salida 28, HTTP 000). También agotaron timeout raíz, salud y perfil protegido. No se obtuvo un 401/403/404/500/502/503 y no hay evidencia para atribuirlo a CORS. No se puede confirmar el arranque de Spring ni su conexión a SQL a partir de este resultado.

Faltan: suscripción y grupo de recursos, sesión autorizada de solo lectura, estado/configuración del App Service, Java y artefacto desplegado, comando de arranque, puertos, acceso público y restricciones, logs de arranque y solicitudes. Azure CLI/Az.Accounts y perfil de autenticación Azure no están disponibles en este entorno. Los secretos deben configurarse en el entorno del servidor, fuera del código y del APK.

La corrección local escucha en `0.0.0.0`, respeta PORT/SERVER_PORT y mantiene la configuración por entorno. Se genera un JAR verificable, **sin desplegarlo sobre el recurso compartido**. Después de revisar la configuración real podrá concretarse cualquier cambio de red, exposición o despliegue para su autorización. No se creó otro App Service ni otra base.

## Catálogos faltantes

La auditoría ejecuta el SQL dos veces en SQLite de memoria: 25 departamentos, 1111 distritos, 11 categorías y 43 canales; sin infracciones FK ni duplicados. Esto no acredita que Azure contenga exactamente las mismas filas.

Callao no tiene distritos en el respaldo. La única Bellavista local es Cajamarca/Jaén, ID 493. Se documentan los demás departamentos/provincias ausentes en [CATALOGOS_Y_FUENTES.md](CATALOGOS_Y_FUENTES.md). La propuesta [catalogos_callao.azure.sql](catalogos_callao.azure.sql) consulta faltantes por defecto, verifica IDENTITY y exige una opción explícita para insertar siete distritos oficiales. No se ejecutó. Los IDs deben provenir de la base central y sincronizarse hacia Android; no se asignan independientemente en SQLite.

## Configuración y reproducción

`.env.example` contiene configuración local y la URL existente comentada, identificada como aún inaccesible por HTTP. No se activó como servidor comprobado. Para Android de producción se exige una URL HTTPS explícita; el emulador no se usa como respaldo silencioso.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
node scripts/audit-catalogs.mjs
npx.cmd cap sync android
cd android
.\gradlew.bat --no-daemon assembleDebug
```

Backend, desde `backend/kuska-api/kuska-api`:

```powershell
.\mvnw.cmd test
.\mvnw.cmd package
```

Vite incorpora las variables durante el build. Cuando el servidor público responda y se configure VITE_API_BASE_URL, hay que volver a ejecutar build, sincronización Capacitor y Gradle. El APK generado actualmente comprueba la compilación; no acredita conectividad con Azure. El script existente `test-kuska-integration.ps1` escribe registros de prueba en Azure y **no se ejecutó** sin credenciales/cuentas de prueba autorizadas.

## Pruebas y artefactos

- `npm.cmd run typecheck`: aprobado.
- `npm.cmd test`: **49 pruebas aprobadas, cinco archivos**. Incluye 21 pruebas de persistencia y ocho de favoritos sobre SQLite real en archivos temporales, 13 del agente, tres de catálogos y cuatro de utilidades. API y puente Capacitor simulados en los tests de repositorios.
- `npm.cmd run build`: aprobado. Advertencia de Vite: bundle principal de aproximadamente 625 kB antes de gzip; no impide compilar. No se añadió una biblioteca visual.
- `node scripts/audit-catalogs.mjs`: aprobado; SQL repetido sin duplicados y `foreign_key_check` vacío.
- Maven `test` y `package`: **39 pruebas aprobadas**, JAR construido. Tomcat local recibió HTTP real; repositorios y JDBC de esas pruebas son simulados.
- Capacitor `sync android` y Gradle `assembleDebug`: aprobados. Se requirió ejecutar fuera del entorno restringido por limitaciones de acceso de Node/Gradle.
- `git diff --check`: aprobado. Cambios locales disponibles para revisión.

Artefactos generados, ignorados por Git: `android/app/build/outputs/apk/debug/app-debug.apk` y `backend/kuska-api/kuska-api/target/kuska-api-0.0.1-SNAPSHOT.jar`. El diff completo, incluidos archivos nuevos, se entrega en `.cache/kuska-review.patch`. La evidencia específica del backend se conserva en [BACKEND_VERIFICATION.md](../backend/kuska-api/kuska-api/BACKEND_VERIFICATION.md).

APK final: 14.824.582 bytes; SHA-256 `7AC6642BB05984E353B93D6C82A7EBA0B152DEDA13AC796C642746DBE5CD04DF`. Esta revisión deja 63 archivos rastreados modificados y 20 archivos nuevos, sin cambios en el índice ni commits.

Limitaciones de verificación: no hubo navegador automatizado disponible; la comprobación del preview en localhost:8443 no obtuvo respuesta. No se arrancó un segundo servidor ni se instaló un navegador. La revisión visual completa, interacción táctil y permisos/rutas SQLite/fotos de Android quedan pendientes. `adb devices -l` devolvió una lista vacía.

## Inventario de archivos

En las rutas backend de esta tabla, `B/` significa `backend/kuska-api/kuska-api/`. Los demás nombres parten de la raíz del repositorio. M indica archivo modificado y N archivo nuevo. Los archivos generados de compilación no se incorporan al control de versiones.

| Archivo(s) | Estado | Motivo |
| --- | --- | --- |
| `.gitignore`, `.env.example` | M, N | Ejemplo de entorno sin secretos, URL real comentada y modo local explícito. |
| `package.json`, `src/vite-env.d.ts` | M | Comando typecheck y declaración de configuración local de autenticación. |
| `src/App.tsx` | M | Conecta flujos existentes a repositorios/API, gestión de propietario, perfil y cuenta; elimina sustituciones por datos ficticios y esperas de refresco que duplicaban escrituras. |
| `src/main.tsx` | M | Conserva inicialización SQLite; evita mostrar excepciones internas al usuario. |
| `src/types/index.ts` | M | EntityId original, districtId, estado de envío, fotografía pendiente y marca DEMO. |
| `src/components/common/CommonComponents.tsx` | M | Etiquetas DEMO, ausencia de teléfonos ficticios, diálogo accesible y foco de teclado. |
| `src/components/map/KuskaMap.tsx`, `src/utils/geo.ts` | M | Compatibilidad con IDs textuales; el cálculo para separar marcadores nunca sustituye IDs persistentes. |
| `src/database/init.ts` | M | Valida integridad sin exigir cantidades fijas después de incorporar catálogos reales. |
| `src/database/seed.ts` | M | Impide sembrar personas/negocios ficticios en Android o producción. |
| `src/database/repositories/services.ts` | M | Lectura API/caché/SQLite, CRUD del propietario, reseñas e imágenes locales; IDs y tombstones. |
| `src/database/repositories/posts.ts` | M | CRUD, comentarios, actualización de tipo, cola y tombstones. |
| `src/database/repositories/users.ts` | M | Web sin SQLite nativo, protección de perfil pendiente y ubicación exacta recibida del servidor. |
| `src/database/repositories/syncQueue.ts` | M | Aislamiento por cuenta, UUID por operación, orden y ACK seguro ante nuevas ediciones. |
| `src/database/repositories/contentShared.ts` | N | Transacciones de contenido/cola, comprobación del propietario y corrección de operaciones rechazadas. |
| `src/database/repositories/contentPersistence.test.ts` | N | Pruebas sobre SQLite en archivo, reinicio, permisos, tombstones, imágenes, cuenta y conflictos geográficos. |
| `src/database/repositories/favorites.ts`, `favorites.test.ts` | N | Favoritos con API, cola existente, caché privada y pruebas reales de persistencia. |
| `src/services/apiClient.ts` | M | Timeout, cancelación y requisito de HTTPS explícito para Android productivo. |
| `src/services/auth.ts` | M | Perfil público exacto con caché y fallback de lectura. |
| `src/services/remoteRead.ts` | M | Snapshots públicos persistentes y actualización de caché tras una escritura confirmada. |
| `src/services/session.ts` | M | Sesiones web/nativas, perfil, cuenta y limpieza propia únicamente tras confirmación remota. |
| `src/services/sync.ts` | M | Procesamiento secuencial por entidad, reintentos y refresco tras confirmación. |
| `src/services/catalogs.ts`, `catalogs.test.ts` | N | Catálogos API/SQLite/web, cobertura de ayuda, deduplicación y pruebas. |
| `src/services/images.ts` | N | Persistencia local de fotografías, límites, eliminación privada y exclusión de rutas locales del payload remoto. |
| `src/screens/Register/RegisterScreen.tsx` | M | Registro con ID exacto y límites del backend. |
| `src/screens/Register/GeographicFields.tsx` | N | Departamento, provincia y distrito dependientes, sin resolver homónimos por nombre. |
| `src/screens/Channels/Channels.tsx` | M | Canales reales por cobertura/distrito, fuente y fecha, enlaces alternativos separados y ausencia de datos clara. |
| `src/screens/Emergency/Emergency.tsx` | M | Navegación compatible con IDs originales. |
| `src/screens/Emergency/CreateEmergency.tsx` | M | Guardado asíncrono, ID estable, fotografía persistente y mensajes sin prometer comunicación a autoridades. |
| `src/screens/Services/CreateService.tsx` | M | Creación/edición en el mismo formulario, categorías reales, fotos, precio, límites y doble envío bloqueado. |
| `src/screens/Services/ServiceDetail.tsx` | M | Editar/eliminar propio, favoritos, estados de envío/fotos y etiqueta DEMO. |
| `src/screens/Services/ReviewModal.tsx` | M | Escritura real esperada, ID estable y errores visibles. |
| `src/screens/Services/Services.tsx` | M | Catálogo completo de categorías y buscador funcional con el diseño existente. |
| `src/screens/Services/AllServices.tsx`, `src/screens/Home/Home.tsx` | M | IDs originales en callbacks de navegación. |
| `src/screens/Posts/CreatePost.tsx` | M | Creación/edición asíncrona, cambio de categoría correcto, fotos y borrador estable. |
| `src/screens/Posts/PostDetail.tsx` | M | Gestión propia, comentarios reales, IDs estables y estados de sincronización. |
| `src/screens/Posts/AllPosts.tsx`, `src/screens/Solidarity/Solidarity.tsx` | M | Navegación compatible con IDs textuales. |
| `src/screens/Profile/Profile.tsx` | M | Cuenta propia, contenido propio con IDs heredados y opción de eliminación. |
| `src/screens/Profile/EditProfile.tsx`, `AboutModal.tsx` | M | Guardado esperado, geografía real, validación y cierre protegido durante escritura. |
| `src/screens/Profile/NeighborProfile.tsx` | M | Perfil exacto sin contacto inventado y navegación estable. |
| `src/screens/Profile/DeleteAccount.tsx` | N | Contraseña, confirmación explícita y espera de respuesta del servidor. |
| `src/screens/RecoverPassword/RecoverScreen.tsx` | M | Mensaje veraz sobre la ausencia del servicio de recuperación. |
| `src/screens/Map/MapScreen.tsx` | M | Solo compatibilidad de selección y callbacks con IDs originales. |
| `src/screens/Assistant/AgentChat.tsx` | M | Filtros Cloudflare comprobados, datos de repositorios, perfiles, ubicación y DEMO explícito. |
| `src/screens/Assistant/hybridSearch.ts`, `hybridSearch.test.ts` | M | Presupuestos, homónimos por ID, intención, exclusión DEMO y pruebas. |
| `android/app/src/main/java/com/kuska/app/MainActivity.java` | M | Registra el plugin local de imágenes. |
| `android/app/src/main/java/com/kuska/app/media/PersistentImagesPlugin.java` | N | Archivos privados persistentes; borrado limitado a rutas canónicas de kuska-images. |
| `B/mvnw.cmd` | M | Wrapper Windows compatible con el entorno disponible. |
| `B/src/main/resources/application.properties` | M | Puerto/escucha por entorno y salud; conserva SQL, JWT y secretos externos. |
| `B/src/main/java/com/kuska/api/catalog/ApiExceptionHandler.java` | M | Mensaje de revalidación de cuenta con HTTP 403. |
| `B/src/main/java/com/kuska/api/catalog/{CatalogController,CatalogDtos,CatalogService}.java` | M | Provincias y cobertura geográfica de canales, sin nuevos esquemas. |
| `B/src/main/java/com/kuska/api/content/{ContentDtos,ContentRepository,ContentService}.java` | M | IDs geográficos, propietarios activos y reintentos seguros de borrado. |
| `B/src/main/java/com/kuska/api/security/{JwtAuthenticationFilter,SecurityConfiguration}.java` | M | Salud pública y rechazo de tokens de cuentas desactivadas. |
| `B/src/main/java/com/kuska/api/user/{AuthService,UserDtos,UsuarioController,UsuarioRepository}.java` | M | Baja propia, identidad revalidada, datos relacionados y DTO sin secretos en logs. |
| `B/src/main/java/com/kuska/api/user/{AccountVerificationException,PublicProfileController}.java` | N | Verificación de contraseña diferenciada y perfil público sin datos privados. |
| `B/src/test/java/com/kuska/api/{content/ContentServiceTests,security/SecurityEndpointsTests,user/AuthServiceTests}.java` | M | Permisos, datos de sincronización y cuenta. |
| `B/src/test/java/com/kuska/api/{catalog/CatalogServiceTests,security/BackendHttpSmokeTests}.java` | N | Cobertura/provincias y HTTP real local con datos simulados. |
| `B/AZURE_SQL_PENDING.md`, `B/BACKEND_VERIFICATION.md` | M, N | Configuración JWT vigente, diagnóstico y evidencia backend. |
| `scripts/audit-catalogs.mjs` | N | Auditoría repetible de integridad y cobertura de la semilla, en memoria. |
| `docs/CATALOGOS_Y_FUENTES.md`, `docs/catalogos_callao.azure.sql` | N | Faltantes y fuentes oficiales; propuesta aditiva Callao, sin ejecutar. |
| `docs/VERIFICACION_KUSKA.md` | N | Estado por funcionalidad, pruebas, bloqueos, artefactos e inventario. |

Para revisar los cambios rastreados: `git diff`. El patch de revisión incluye también los archivos nuevos y no modifica el índice de Git. No se crearon commits durante este trabajo.
