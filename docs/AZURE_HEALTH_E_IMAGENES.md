# Kuska: Azure App Service, health e imágenes

Comprobación del **8 de noviembre de 2026, 04:43 America/Lima**. Este informe actualiza el diagnóstico de la revisión anterior: el servidor público ahora responde HTTP; el timeout anterior es evidencia histórica, no el resultado actual.

## A. Resultado de Azure App Service

Host comprobado: `https://kuska-api-fadc-akd8fkcrfpcwdgdj.eastus2-01.azurewebsites.net`.

| Comprobación pública de solo lectura | Resultado actual |
| --- | --- |
| DNS | Resuelve mediante CNAME Azure a `20.119.128.19`. |
| TCP/HTTPS | Conexión y TLS correctos. Primera prueba: DNS 0,118 s, TCP 0,180 s, TLS 0,318 s y respuesta completa en 0,507 s. |
| `GET /` | 401. No se interpreta como caída de la API. |
| `GET /actuator/health`, sin token | **401 UNAUTHORIZED**, JSON con firma de la aplicación Kuska. |
| `GET /actuator/health`, bearer deliberadamente inválido | **401 UNAUTHORIZED**. |
| `GET /api/catalogos/departamentos` | **200**, 25 filas. |
| `GET /api/catalogos/distritos` | **200**, 1111 filas. La única Bellavista es Cajamarca/Jaén, ID 493. No hay distritos asociados a Callao. |
| `GET /api/catalogos/categorias-servicio` | **200**, 11 filas. |
| `GET /api/usuarios/me`, sin token | **401**, protección correcta para esta solicitud. |
| `GET /api/servicios`, sin token | **401**, protección correcta para esta solicitud. |
| `GET /actuator/env` y `/actuator/health/db`, sin token | **401**, no se expusieron. |

La comprobación reproducible está en `scripts/verify-app-service.ps1`. Su salida final se guardó en `.cache/app-service-verification.json` (09:43:21 UTC). Solo hace GET y conserva códigos, tiempos, nombres de campos y cantidades; no registra tokens ni el contenido de catálogos/perfiles. Una primera llamada a departamentos tardó 16,7 s; las posteriores respondieron en menos de un segundo. No hay evidencia suficiente para atribuir esa primera latencia a una causa concreta.

### ¿Está iniciado? ¿Responde Spring Boot?

Existe un servicio HTTP público que devuelve datos de los endpoints de Kuska. Esto prueba accesibilidad y ejecución de rutas de la aplicación. La respuesta 401 coincide con `SecurityConfiguration.writeError`: timestamp, status, error UNAUTHORIZED y el mensaje de sesión de Kuska, junto con cabeceras de Spring Security. **La inferencia principal es que el 401 de health viene de la autorización Spring desplegada**, no de un fallo DNS/TLS ni de CORS.

No se dispone de acceso al plano de administración para certificar el campo `state=Running`, logs de arranque, versión Java del recurso, JAR desplegado, perfiles o variables efectivas. No se afirma que esos datos se hayan inspeccionado. Tampoco se puede descartar una configuración adicional de autenticación Azure: no se leyó `authsettingsV2`. La respuesta observada apunta al manejador de Kuska, pero comparar el artefacto y los logs es necesario para cerrar la causa exacta.

### Health local y cambios de código

Actuator ya estaba instalado en `pom.xml`. La copia local ya contenía estas reglas antes de esta etapa:

```java
.requestMatchers(HttpMethod.GET, "/actuator/health").permitAll()
.anyRequest().authenticated()
```

El filtro JWT existente continúa la cadena si no hay token o si el token es inválido. No había evidencia de un rechazo local de solicitudes anónimas que justificara sustituir ese filtro. **No se modificaron SecurityConfiguration ni JwtAuthenticationFilter en esta etapa**; se mantuvieron registro, catálogos públicos y JWT privados.

Se añadió únicamente la configuración explícita de componentes:

```properties
management.endpoints.web.exposure.include=health
management.endpoint.health.show-details=never
management.endpoint.health.show-components=never
```

La exposición HTTP se limita a health; no se activaron env, beans, configprops o heapdump. Las opciones de ocultación son las documentadas por [Spring Boot Actuator](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html).

Se amplió la prueba de HTTP real con Tomcat local: health anónimo e inválido 200, estado UP, ausencia de componentes/detalles, privados y mutaciones sin JWT 401, y contributor de prueba DOWN produce 503 sin detalles. En este entorno Spring también incluye los nombres de grupos liveness/readiness; la prueba no los confunde con detalles de base de datos. El contributor de fallo es **sintético**, no una conexión SQL.

La llamada solicitada a `http://localhost:8080/actuator/health` encontró el puerto sin servidor. No se puso en marcha un backend productivo con credenciales ficticias. La verificación local aprobada usa el puerto aleatorio del servidor de pruebas y HTTP real, con repositorios simulados.

### Azure SQL: lo comprobado y lo pendiente

Hay lecturas públicas reales de tres catálogos. El código local de esas rutas obtiene entidades desde repositorios JPA, sin sustituirlas por listas de demostración. Esto aporta evidencia de lectura de la aplicación desplegada, pero **no certifica por sí solo el servidor/base SQL ni su conexión JDBC actual**: faltan el artefacto publicado y sus logs.

La configuración de producción utiliza DataSource/JPA y el verificador de arranque ejecuta `SELECT DB_NAME(), @@SERVERNAME` con comprobación de identidad. Es necesario ver ese resultado en el arranque real y realizar una consulta autorizada independiente, por ejemplo `SELECT 1`, desde el backend desplegado. El indicador DB de Actuator debe comprobarse en su registro/configuración efectiva; no basta con asumirlo a partir de UP. Las pruebas usan el perfil test, que excluye DataSource y no prueba Azure SQL.

En el proceso actual faltan AZURE_SQL_USERNAME, AZURE_SQL_PASSWORD y JWT_SECRET. No se intentaron escrituras ni creación de usuarios de prueba sobre la base compartida.

### Despliegue y acceso pendiente

La diferencia observable es concreta: el código local permite health y el host publicado lo rechaza. Hay que comparar JAR/commit, configuración activa y cadena de seguridad publicada. Si el recurso usa un JAR anterior, será necesario desplegar el preparado, con autorización. No se puede garantizar que desplegarlo sea la única acción necesaria sin revisar el recurso.

JAR listo: `backend/kuska-api/kuska-api/target/kuska-api-0.0.1-SNAPSHOT.jar`.

SHA-256: `702E79D03E340C45F285DB83CACD3F7F0570D071104485AEFEB704CEBD72D8E3`.

No hubo publicación. Tampoco hubo cambios en exposición pública, red, reglas, permisos ni autenticación Azure. La búsqueda de integraciones disponibles no encontró una conexión para administrar App Service/Blob; Azure CLI, Az.Accounts y un perfil de autenticación Azure tampoco están disponibles en el entorno.

## B. Dónde se guardan las imágenes actualmente

La inspección siguió los formularios → `services/images.ts` → repositorios → tablas/cola → DTO y backend. No se dedujo almacenamiento de archivos a partir del nombre de una tabla.

| Módulo | Selección y almacenamiento local | Relación persistida |
| --- | --- | --- |
| Servicios | CreateService lee el archivo; persistSelectedImage usa Data URI en web o copia privada en Android. | ImagenesServicio, IdImagen `img-<idServicio>`, RutaLocal/UrlRemota. |
| Comunidad | CreatePost usa el mismo helper y conserva la imagen existente si no se elige otra. | ImagenesPublicacion, IdImagen `img-<idPublicacion>`. |
| Emergencias | CreateEmergency selecciona un archivo y llama al mismo helper, conservando el ID del borrador. | Es una publicación tipo Emergencia; utiliza ImagenesPublicacion, no un almacén distinto. |
| Perfil | El avatar es una letra/inicial guardada como texto y renderizada en un div. | No hay selección, subida ni archivo de fotografía de perfil implementados. |
| Ejemplos antiguos | Algunas imágenes de demo.ts son URLs de Unsplash. | Son recursos externos de demostración, no una integración de subida de fotos de Kuska. |

### Navegador

`FileReader.readAsDataURL` produce `data:image/...;base64,...`. `saveBrowserImage` guarda esa cadena en localStorage bajo `kuska:local-image:service:<id>` o `kuska:local-image:post:<id>`. No se guarda un archivo del sistema operativo ni se utiliza SQLite nativo en Chrome. Los repositorios recuperan la cadena al volver a leer la lista y marcan `imagePending=true`.

Se conserva mientras ese almacenamiento del navegador exista y no se borre o se agote su cuota. La validación admite JPG/PNG/WebP hasta 5 MiB; una Data URI crece respecto al binario y puede superar antes la cuota práctica de localStorage. El código informa el fallo y permite quitar la fotografía para publicar texto. La prueba nueva verifica recarga del módulo con el mismo almacenamiento **simulado**, no un reinicio real del navegador.

Las escrituras web requieren API. Una fotografía guardada localmente antes de una solicitud fallida no implica que el contenido se haya publicado ni que exista una cola offline web equivalente a la de Android.

### Android

`PersistentImagesPlugin.save` decodifica el Data URI y escribe un archivo bajo `getContext().getFilesDir()/kuska-images/`. Usa archivo temporal en ese mismo directorio, escritura/flush y rename al destino. La ubicación final pertenece al almacenamiento privado persistente de la aplicación; no es el URI temporal del selector. `Capacitor.convertFileSrc` proporciona una URL de WebView para mostrarlo.

SQLite guarda **la referencia textual y la asociación**, no los bytes, en RutaLocal de ImagenesServicio/ImagenesPublicacion. UrlRemota queda nula para una nueva selección local y SyncEstado pendiente. El contenido y su entrada de cola se confirman en una transacción. No obstante, el guardado físico del archivo ocurre antes y no forma parte de esa transacción SQLite: cancelar o fallar después puede dejar un archivo sin asociación.

La referencia de SQLite sobrevivió a cerrar/reabrir una base real en archivo de prueba. El plugin compiló dentro del APK. **La escritura física, lectura en WebView y persistencia tras reiniciar el teléfono no se pudieron ejecutar en dispositivo**: ADB devuelve lista vacía. Desinstalar o borrar datos de la app elimina su almacenamiento privado; no es una copia remota.

### Azure SQL y sincronización

El backend recibe ImageRequest `{id,url,order}`, exige URL HTTPS y guarda referencias en UrlRemota. El reporte de esquema existente registra UrlRemota `nvarchar(1000) NOT NULL` en ambas tablas centrales, no un campo binario. No se inspeccionó el esquema vivo por JDBC durante esta etapa.

No hay SDK Blob en pom.xml, cliente de almacenamiento, controlador multipart de archivos, endpoint de sesión de subida, configuración de cuenta/contenedor ni renovación de SAS en el código inspeccionado. **No existe un flujo de subida Blob implementado en este checkout.** Esto no demuestra que la suscripción Azure carezca de una cuenta de almacenamiento; el inventario cloud no está accesible.

Para una fotografía nueva local, los payloads de servicios/publicaciones envían `images:[]`. La cola no envía Base64 ni `file://`/URLs WebView a Azure. Operaciones heredadas de imagen con URL local se conservan pendientes de subida fuera de la sincronización remota, en lugar de declararlas completadas. El texto puede sincronizarse independientemente.

Si el registro ya tiene una URL HTTPS externa válida, otros dispositivos con acceso a esa URL pueden mostrarla. **Las fotos recién seleccionadas y guardadas solo localmente no se comparten entre celulares.** Un snapshot de URL remota tampoco descarga automáticamente los bytes para verlos offline: esa foto depende de conectividad o de una caché externa no garantizada por Kuska.

### Edición, eliminación y problemas observados

| Operación | Comportamiento observado en código |
| --- | --- |
| Editar texto sin elegir foto | Conserva la referencia local existente. |
| Reemplazar foto en Android | Actualiza la fila de imagen al nuevo RutaLocal; no hay subida remota. Los formularios generales crean un archivo con otro UUID; el anterior puede quedar huérfano. |
| Reemplazar foto en web | Sobrescribe el valor local de esa clave. La foto permanece exclusiva de ese navegador. |
| Registro con foto remota previa y reemplazo local | El envío `images:[]` no elimina ni reemplaza automáticamente la referencia central previa. Otro dispositivo puede seguir mostrando la foto antigua. |
| Eliminar servicio/publicación Android | Tombstone de contenido, ocultación en listas y eliminación pendiente. No se borra físicamente el archivo de foto en ese flujo. |
| Eliminar contenido web tras respuesta del backend | Retira su clave local de imagen. No borra un archivo remoto de un proveedor externo. |
| Eliminar imagen por API | El backend ofrece borrado lógico de la referencia. No hay cliente de almacenamiento que borre bytes remotos. |
| Reinicio/cancelación antes de guardar contenido | Puede existir archivo Android sin fila o clave web sin contenido publicado; no hay recolector automático de huérfanos. |
| Eliminar cuenta | Existe limpieza local posterior a confirmación del servidor; no se ejecutó contra una cuenta real. En esta etapa no se eliminó ninguna fotografía existente. |

Los riesgos pendientes afectan a la subida entre dispositivos, reemplazo coherente de fotos ya remotas, huérfanos y descarga offline de fotos remotas. No se afirma una pérdida tras reinicio para las fotos ya copiadas: faltó la prueba real del dispositivo. Ninguna imagen existente fue borrada para realizar esta auditoría.

## C. Propuesta de Azure Blob Storage — no implementada

**Recomendación propuesta:** usar un contenedor Blob privado, preferiblemente en una cuenta que el equipo ya posea, coordinado por el backend Java. Es una solución adecuada para compartir nuevos archivos; no es necesario cambiar Azure SQL ni SQLite. Una URL HTTPS guardada en SQL por sí sola no aporta almacenamiento.

La primera versión más simple sería subida multipart autenticada al backend, con Managed Identity para acceder a Blob. La guía oficial de [Java Blob Storage](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-java) muestra el SDK y DefaultAzureCredential. La app no recibe claves de cuenta.

### Contrato propuesto

1. El dispositivo guarda el archivo como hoy, conserva un ID de imagen/borrador y escribe texto + cola. Sin red, sigue consultando RutaLocal.
2. Se sincroniza primero el contenido padre y se espera confirmación remota con su ID original.
3. Un endpoint nuevo de archivos comprueba JWT, usuario activo, propiedad del servicio/publicación, estado no eliminado, formato real del contenido, tamaño máximo y límites de uso. No basta con confiar en MIME o extensión enviados por el cliente. Conviene quitar metadatos EXIF de ubicación y generar una versión razonable para móvil.
4. El backend recibe el stream y guarda en Blob una clave determinista basada en tipo, ID del padre e ID de imagen. Registra MIME y hash de los bytes en metadatos del blob. El mismo ID y hash permiten reintentar sin crear otra foto; la asociación con un padre distinto debe rechazarse.
5. Tras confirmar la subida, el backend hace upsert autorizado en ImagenesServicio/ImagenesPublicacion. SQL conserva una referencia permanente, no una SAS con caducidad ni los bytes.
6. Solo después de la confirmación conjunta el móvil asigna UrlRemota y marca la operación de imagen sincronizada. Conserva RutaLocal para consulta offline; los fallos mantienen la operación pendiente con reintento y backoff.
7. Si Blob se guardó pero la respuesta o la transacción SQL falló, se reintenta el mismo ID/hash y se repara la relación. Blob y SQL no comparten una transacción atómica; hace falta esta compensación, no prometer entrega exactamente una vez.

Las rutas concretas de subida/lectura serían nuevas y deben acordarse antes de implementarlas; no se presentan como endpoints ya publicados.

### Lectura, SAS y privacidad

Se propone mantener el contenedor sin lectura anónima. El backend verifica permisos antes de entregar bytes o una URL de lectura temporal. Si SQL guarda una ruta estable de API, la interfaz debe resolverla con apiClient y guardar/cachear los bytes: una etiqueta `<img src>` no añade por sí sola el JWT de Kuska. Otra opción es obtener una SAS de lectura corta desde un endpoint autorizado y usarla como URL de presentación. Al expirar, se solicita otra; no se persiste como referencia central definitiva.

Para subidas directas futuras, el backend podría emitir user delegation SAS de pocos minutos, HTTPS, limitada a un único blob con permisos de escritura necesarios, sin listar ni borrar. La confirmación posterior debe validar contenido real, tamaño/hash y propietario antes de publicar su referencia. Esta alternativa exige más controles y CORS específico que la subida mediante backend. Son opciones de diseño, no permisos concedidos. Microsoft recomienda identidad administrada, mínimo privilegio y [SAS de delegación de usuario cuando se necesite delegar acceso](https://learn.microsoft.com/en-us/azure/storage/common/authorize-data-access).

### Reemplazo y eliminación propuestos

La foto anterior permanece visible hasta que la nueva esté subida y registrada. Después, una transacción cambia la referencia/orden activo y marca la anterior eliminada lógicamente. Los IDs del servicio/publicación no cambian. Se propone un ID nuevo de versión de imagen al reemplazar sus bytes para evitar sobrescribir la única copia antes de confirmar.

Si se elimina el padre durante una subida, el backend rechaza su publicación y la app no lo resucita. Un trabajo autorizado de limpieza puede retirar blobs huérfanos o eliminados tras la retención acordada; debe revalidar propietario/asociación y no borrar una imagen aún referenciada. Ese proceso requiere aprobación y no se ejecutó. La limpieza local también debe comprobar asociaciones antes de quitar archivos antiguos.

### Archivos a cambiar si se aprueba

| Área | Cambios propuestos, no realizados |
| --- | --- |
| `backend/.../pom.xml` | Dependencias azure-storage-blob y azure-identity con versiones compatibles verificadas. |
| `backend/.../application.properties` | Endpoint/contenedor por entorno, límites multipart y opción de integración desactivada si no se configura. Ninguna clave en Git. |
| Nuevo módulo Java de imágenes | Controlador, servicio de autorización/coordinación y adaptador Blob; manejo de errores, reintentos y lectura temporal. |
| ContentService/ContentRepository | Reutilizar propiedad, IdImagen, UrlRemota, Orden y Eliminado. Upsert de referencia solo tras confirmar bytes; no insertar una URL falsa para satisfacer NOT NULL. |
| `src/services/images.ts` | API de subida/resolución de lectura y descarga persistente offline, conservando helper local actual. |
| `src/services/sync.ts`, `src/database/repositories/syncQueue.ts` | Operaciones de archivos en la cola existente, dependencia de padre, reintentos y ACK real. No otra base/cola paralela. |
| Repositorios services/posts | Asociar ID de foto estable y actualizar UrlRemota/estado al confirmar la subida. |
| Plugin PersistentImages | Lectura por stream/archivo y caché de descargas si la API de transferencia nativa lo requiere. Evitar mover grandes cadenas por el puente. |
| Pruebas | Subida/lectura autorizada, usuario ajeno, tipo falso, tamaño, interrupción/reinicio, duplicados, padre eliminado y SAS expirada; cuenta/contenedor de pruebas autorizado. |

El esquema actual permite una primera versión sin migración compartida: los pendientes permanecen en SQLite; SQL solo recibe referencias válidas. Si se necesita almacenar estado/hash central o un registro duradero de operaciones, debe presentarse esa extensión separadamente al equipo.

### Recursos, permisos y costos

Primero se debe inventariar la suscripción: cuenta/contenedor existentes, región, redundancia, política de retención, acceso de red y Managed Identity. Reutilizar un recurso existente también puede incrementar consumo; requiere aprobación de acceso/roles. Si no hay almacenamiento adecuado, crear una cuenta/contenedor necesita autorización previa.

Se propone acceso de datos limitado al contenedor para la identidad del backend. Si se eligen SAS de delegación, habrá que añadir el permiso de generar claves de delegación al ámbito necesario, evitando dar al APK acceso administrativo. Se deben acordar presupuestos, retención y registro de uso. Las [recomendaciones de seguridad de Blob](https://learn.microsoft.com/en-us/azure/storage/blobs/security-recommendations) respaldan HTTPS, acceso mínimo y control de lectura anónima.

No se ofrece una cotización sin región, tier, redundancia y volumen. Los componentes de costo son capacidad, operaciones de escritura/lectura, transferencia, recuperación si se eligen tiers fríos, retención/versiones y observabilidad. [Microsoft describe estos factores](https://learn.microsoft.com/en-us/azure/storage/common/storage-plan-manage-costs). Ejemplo de dimensionamiento, **no precio**: 10.000 fotos de 500 KiB son aproximadamente 4,77 GiB; diez lecturas por foto transfieren unos 47,7 GiB antes de cachés. Conviene mantener App Service y almacenamiento en una región compatible para evitar transferencias innecesarias.

### Alternativas sin crear infraestructura adicional

1. Reutilizar una cuenta Blob existente con permisos y presupuesto aprobados: no requiere otra cuenta, pero sí integración y consumo.
2. Mantener fotos locales pendientes y sincronizar texto: ya funciona y no permite compartir nuevos archivos entre teléfonos.
3. Evaluar almacenamiento persistente ya incluido en App Service, detrás de endpoints autenticados. Deben verificarse su cuota, persistencia real y comportamiento al escalar; no usar el directorio temporal ni escribir junto al JAR. Microsoft distingue [almacenamiento persistente y temporal de App Service](https://learn.microsoft.com/en-us/azure/app-service/operating-system-functionality). No se implementó un servidor de archivos improvisado.
4. Conservar URLs externas ya existentes cuando sean legítimas y accesibles. Es válido para contenido previamente alojado; no resuelve subir una foto seleccionada en el celular.

No se propone Cosmos DB ni almacenar binarios/Base64 en Azure SQL.

## D. Pruebas ejecutadas realmente

| Prueba | Resultado y alcance |
| --- | --- |
| Maven package | **41 pruebas aprobadas**, JAR generado. Incluye dos pruebas HTTP nuevas; el resto de implementaciones anteriores se conserva. |
| Spring Security/REST local | Tomcat local real: health 200 sin token y con token inválido; env/beans/configprops/heapdump y health/db 401; modificación/eliminación de contenido y cuenta sin JWT 401. Repositorios simulados. |
| Health DOWN local | Contributor sintético: 503 con status DOWN y sin datos internos. No es una prueba SQL real. |
| Curl localhost:8080 | Intentado; conexión rechazada porque no había servidor en ese puerto. No se presenta como UP. |
| Health HTTPS público | Ejecutado repetidamente: **401**. Es una prueba pendiente de corrección en la versión publicada. |
| Catálogos HTTPS públicos | Ejecutados: 200 y cantidades indicadas. No se escribió información. |
| SQL JDBC real | No ejecutado: faltan credenciales/sesión autorizadas. Lectura de catálogos por API sí ejecutada; origen central exacto aún por confirmar. |
| Vitest | **55 pruebas aprobadas en seis archivos**; seis pruebas nuevas de imágenes. API, bridge nativo y almacenamiento web simulados en esas seis. |
| SQLite | Las pruebas existentes usan archivos SQLite reales: guardan rutas y filas, cierran/reabren, prueban cola, tombstones y aislamiento. No contienen archivos binarios de fotografías. |
| Imagen web | Prueba nueva: FileReader/almacenamiento simulados, recuperación después de recargar módulo, claves separadas y error de cuota. No navegador real. |
| Imagen Android | Contrato del bridge simulado: ruta privada, URL WebView no remota y error de guardado. Plugin Java compila; no se afirma escritura física en dispositivo. |
| Frontend | TypeScript y build Vite aprobados; persiste advertencia de bundle principal mayor de 500 kB. |
| Android | cap sync y Gradle assembleDebug aprobados. ADB sin dispositivos. No se instaló APK ni se hizo prueba entre celulares. |

Se configuró `.env.production.local` (ignorado por Git, sin secretos) con la URL HTTPS cuyo catálogo público se comprobó. Se verificó que el bundle incorpora ese host y se reconstruyó Android. Esto prepara el teléfono físico para hablar con la API existente, **no certifica login, CRUD ni compatibilidad de todos los endpoints de la versión publicada**.

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

SHA-256: `F877741EC55FF631560D8BCCA431861D81C1820BD210DC2D07DAB131BA1A75AF`.

## E. Archivos y Git

Los cambios anteriores permanecen pendientes en `feature/agente-kuska-hibrido`, HEAD `a4dca6d`. No se descartó trabajo, no se cambiaron ramas y no hubo commit, push o merge. Esta etapa añade:

| Archivo | Cambio de esta etapa |
| --- | --- |
| `.env.example` | Actualiza el comentario: catálogos públicos 200, health 401. |
| `.env.production.local` | Nuevo local ignorado: host HTTPS comprobado y auth local desactivada. |
| `backend/kuska-api/kuska-api/src/main/resources/application.properties` | Una línea: show-components=never. |
| `backend/kuska-api/kuska-api/src/test/java/com/kuska/api/security/BackendHttpSmokeTests.java` | Amplía HTTP local, privacidad del JSON, métodos protegidos y fallo de health. |
| `src/services/images.test.ts` | Nuevo: seis pruebas del contrato actual, sin cambiar la producción de imágenes. |
| `scripts/verify-app-service.ps1` | Nuevo: diagnóstico público reproducible y de solo lectura. |
| `docs/AZURE_HEALTH_E_IMAGENES.md` | Este informe, evidencia, análisis y propuesta. |
| Informes anteriores | Aviso de actualización para que el timeout histórico no se lea como estado actual. |

El diff acumulado, incluidos archivos nuevos, se entrega en `.cache/kuska-review.patch`. Los artefactos y evidencias `.cache` están ignorados. En esta etapa no se modificaron pantallas, mapa, agente, intervalos de precio, repositorios de producción de imágenes ni infraestructura.

## F. Próximos pasos exactos

1. **Dar acceso de lectura al recurso existente** o revisar junto al responsable: suscripción, grupo, nombre real, Deployment Center/Kudu, logs de arranque/HTTP, Java 21, comando/puerto, perfil activo, nombres de variables, restricciones y authsettingsV2. No compartir valores secretos en el informe.
2. **Comparar el JAR publicado con el preparado.** Si falta la regla GET health, solicitar autorización para desplegar el JAR identificado por SHA-256, con respaldo/rollback del artefacto actual. No se ha ejecutado ese despliegue.
3. **Repetir el script tras la corrección**: health sin token debe retornar 200 con UP; privados continúan 401 sin token y operaciones ajenas 403 con cuentas de prueba autorizadas. Verificar SQL desde el backend con una consulta de lectura independiente.
4. **Si Easy Auth es quien bloquea health**, proponer únicamente la excepción exacta de esa ruta tras leer su configuración y pedir autorización para ese cambio. No desactivar Easy Auth globalmente. Microsoft documenta [la capa de autenticación de App Service](https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization) y [excludedPaths](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-file-based).
5. **Configurar el monitor de App Service solo después de verificar su ruta.** El Health check de la plataforma espera una respuesta exitosa; configurarlo cambia el recurso y puede reiniciarlo, por lo que requiere aprobación. Ver [Health check de App Service](https://learn.microsoft.com/en-us/azure/app-service/monitor-instances-health-check).
6. **Decidir almacenamiento:** informar si existe una cuenta/contenedor reutilizable, definir privacidad, retención y un presupuesto. Aprobar explícitamente integración y permisos; creación de recursos solo si se confirma necesaria. La propuesta de esta sección no activa Blob.
7. **Prueba final con dos teléfonos y cuenta de prueba:** foto offline → cerrar/abrir → recuperar red → subir → confirmación → ver desde otro dispositivo → reemplazar/eliminar con permisos. Conservar la foto pendiente ante cualquier fallo. Hasta entonces, almacenamiento remoto y persistencia nativa completa permanecen pendientes de prueba real.
