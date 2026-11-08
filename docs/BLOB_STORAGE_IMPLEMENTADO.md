# Kuska: integración de imágenes con Blob Storage

8 de noviembre de 2026, America/Lima. Rama de trabajo: `feature/agente-kuska-hibrido`. Cuenta indicada por el usuario: **blobkuska**. Contenedor existente: **imagenes**.

## Resultado comprobado

La comprobación pública de App Service devuelve **GET /actuator/health → 200, status UP**, sin token y con un token deliberadamente inválido. No aparecen detalles internos. Los catálogos devuelven 200 (25 departamentos, 1111 distritos y 11 categorías). Perfil y servicios sin autenticación siguen devolviendo 401. Evidencia reproducible: `scripts/verify-app-service.ps1`; salida de esta etapa en `.cache/blob-app-service-verification.json`.

La consulta anónima del contenedor devolvió 404. Una consulta anónima no acredita la existencia/permisos de un contenedor privado ni la conexión autenticada App Service → Blob. Se respeta la información proporcionada por el equipo sobre el recurso existente; **no se creó otra cuenta ni otro contenedor**.

Se implementó código funcional para subir y leer imágenes con el backend y sincronizarlas desde la aplicación. El JAR nuevo no se desplegó sobre el servicio compartido. No hay credenciales Blob en la sesión local; la subida al recurso real queda pendiente de la prueba autenticada tras publicar el JAR. No se presenta una prueba local como una subida real a Azure.

## Cambios conservando la aplicación existente

Se añadieron un módulo Java de imágenes y un módulo TypeScript. Se incorporaron llamadas pequeñas en los repositorios y el procesador de sincronización actuales. Se mantienen las pantallas, navegación, mapa, colores, autenticación JWT, servicios y publicaciones existentes. No se modificó SecurityConfiguration ni JwtAuthenticationFilter.

La integración necesita esos puntos de conexión para que los formularios existentes efectivamente suban sus fotos; no se reescribió el CRUD ni se creó una segunda base o cola. Se reutilizan **ImagenesServicio, ImagenesPublicacion, ColaSincronizacion y CacheLecturasRemotas**. No hay migraciones de Azure SQL ni cambios de esquema compartido. No se borraron fotografías existentes ni se añadieron tareas automáticas de limpieza.

## Flujo implementado

1. El formulario guarda la fotografía como ya hacía: archivo privado persistente en Android, Data URI/localStorage en web. SQLite guarda RutaLocal, no los bytes.
2. El texto utiliza el CRUD y la cola existentes. En Android, la operación de imagen se agrega a la misma cola, dentro de la transacción de contenido y fotografía.
3. La cola espera que el padre se confirme en el backend. Después envía multipart con JWT a `/api/imagenes`.
4. El backend verifica propiedad y padre activo, tamaño máximo de 5 MiB, firma JPG/PNG/WebP y coincidencia con el MIME declarado. Ignora el nombre del archivo para formar la dirección de almacenamiento.
5. El SDK guarda los bytes en el contenedor existente. La clave incluye tipo, hashes de los IDs y SHA-256 completo de los bytes. El ID original de servicio/publicación se conserva. La condición If-None-Match impide sobrescribir un blob existente: un reintento del mismo archivo reutiliza la misma dirección y una foto diferente obtiene otra clave.
6. Tras confirmar Blob, se reutiliza ContentService para comprobar de nuevo la propiedad/padre y hacer upsert en Azure SQL. Se guarda **URL permanente sin SAS**, IdImagen y orden. No se guarda Base64.
7. Android actualiza UrlRemota y SyncEstado únicamente tras confirmación. Conserva RutaLocal para uso offline. Si llega una respuesta de una foto anterior después de seleccionar otra, no se sobrescribe la selección nueva.
8. Si falla el almacenamiento, el padre ya puede estar sincronizado y la fotografía permanece pendiente. La cola conserva la operación y aplica reintentos. Si el padre fue eliminado, la fotografía no se sube ni restaura el contenido.
9. En web, la selección local se conserva si falla la subida; se reintenta al volver a consultar el contenido propio. Una marca local evita volver a enviar fotos ya confirmadas. Las escrituras de texto web siguen requiriendo API, como antes.

Los archivos guardados antes de incorporar esta integración se recuperan de las filas locales pendientes y se agregan a la cola actual. Las operaciones antiguas de fotografía marcadas IMAGE_UPLOAD_UNAVAILABLE vuelven a poder procesarse. No se eliminan los archivos originales para realizar esa recuperación.

## Lectura privada y funcionamiento offline

El contenedor no necesita ser público. La aplicación consulta una ruta de imagen protegida por JWT en el backend; el backend lee Blob con sus propias credenciales y entrega únicamente los bytes de una imagen asociada a contenido disponible. La referencia debe pertenecer al contenedor configurado y al prefijo Kuska. No se aceptan URLs de otros servidores para descargarlas desde el backend.

Este mecanismo evita depender de CORS del contenedor y del permiso adicional de generar SAS. En el navegador, se crea una URL temporal de presentación en memoria. En Android, la descarga se copia con el plugin privado existente y se conserva su referencia en CacheLecturasRemotas. Las pruebas cierran y reabren SQLite para comprobar la recuperación de esa referencia. El puente nativo está simulado en esas pruebas; la escritura física debe verificarse en un teléfono.

Se distingue la dirección permanente de la URL temporal utilizada para mostrarla. Editar el texto de un registro con una imagen ya cargada no guarda una dirección `blob:` ni una SAS en SQL. Las imágenes de proveedores externos y los datos anteriores siguen utilizando sus URLs existentes.

También se ofrece una ruta opcional para generar SAS de lectura de diez minutos, limitada a HTTPS y lectura de un único blob. La app utiliza la lectura a través del backend por defecto. Las SAS no se guardan en SQL, SQLite ni los snapshots. Con identidad administrada, esa ruta opcional requiere permiso de delegación de usuario; **subir y mostrar mediante el backend no necesita conceder ese permiso adicional**.

Las APIs utilizadas y las condiciones de escritura se verificaron con el [SDK oficial de Blob para Java](https://learn.microsoft.com/en-us/java/api/com.azure.storage.blob.options.blobparalleluploadoptions?view=azure-java-stable). Las credenciales por variables de entorno admiten el nombre habitual de [Azure Service Connector](https://learn.microsoft.com/en-us/azure/service-connector/how-to-integrate-storage-blob).

## Configuración del App Service existente

El código reconoce:

| Variable | Uso |
| --- | --- |
| AZURE_STORAGE_CONNECTION_STRING | Cadena existente; solo en backend. |
| AZURE_STORAGEBLOB_CONNECTIONSTRING | Alias de Service Connector si no está definida la anterior. |
| AZURE_STORAGE_BLOB_ENDPOINT | Endpoint opcional; por defecto `https://blobkuska.blob.core.windows.net`. |
| AZURE_STORAGE_CONTAINER | Contenedor opcional; por defecto `imagenes`. |

Si no hay cadena, se utiliza DefaultAzureCredential, compatible con una identidad administrada ya configurada. La identidad debe tener lectura y escritura de datos del contenedor. No se asignaron roles ni se cambiaron permisos durante esta tarea. Los nombres de variables se inspeccionaron localmente sin mostrar valores; no había configuración Blob disponible en este proceso.

El SDK obtiene el cliente del contenedor existente; no llama a createContainer ni createIfNotExists. El arranque de Spring no hace una subida de prueba ni intenta crear recursos. GET estado realiza la comprobación autenticada del contenedor cuando un usuario autenticado la solicita. No se agregaron variables VITE con claves de almacenamiento.

## Endpoints nuevos

Todos requieren la sesión JWT existente. No se añadió ninguna excepción pública de seguridad.

| Endpoint | Contrato |
| --- | --- |
| `POST /api/imagenes` | Multipart: tipo, entidadId, imagenId, archivo. Comprueba propietario y devuelve `{id,url}`; URL permanente. |
| `GET /api/imagenes/{tipo}/{imagenId}/archivo` | Bytes protegidos, MIME validado, no-store y nosniff. Permite ver fotos de contenido disponible dentro de las reglas actuales de Kuska. |
| `GET /api/imagenes/{tipo}/{imagenId}/acceso` | Opcional: `{url,expiresIn}` con SAS temporal de lectura; no-store. |
| `GET /api/imagenes/estado` | `{available:true/false}` tras consultar el contenedor con la configuración del servidor. No devuelve secretos. Un error de acceso devuelve 503 BLOB_UNAVAILABLE. |

`tipo` admite **servicio** o **publicacion**. Las emergencias son publicaciones y usan publicacion. No se añadió fotografía de perfil, que no existe en el flujo actual.

Para Postman: obtener privadamente un JWT de una cuenta de prueba autorizada, crear un servicio/publicación de esa cuenta y enviar Authorization Bearer al endpoint. En form-data:

```text
tipo       servicio
entidadId  ID original del servicio propio ya confirmado
imagenId   img-ID_DEL_SERVICIO
archivo    [File: una fotografía JPG/PNG/WebP de hasta 5 MiB]
```

El texto del archivo adjunto era una referencia de configuración, no una cadena real. No se copió su clave de ejemplo al código. La subida pide IDs además de archivo para conservar las relaciones y evitar subidas anónimas o a contenido ajeno.

La URL permanente de un contenedor privado no tiene por qué abrirse anónimamente en un navegador. Para comprobarla se utiliza la app o GET archivo con JWT; si se necesita abrirla temporalmente en otra herramienta, GET acceso proporciona una SAS de lectura cuando los permisos configurados lo permiten. No se debe convertir el contenedor en público para hacer esta prueba.

## Pruebas

- **55 pruebas Maven aprobadas**, incluidas 14 nuevas del módulo Blob. Hay pruebas de propietario, reasignación de imagen, MIME falso, tamaño, fallo de almacenamiento sin referencia SQL falsa, IDs originales, lectura privada, formulario multipart, mensajes de error y caché HTTP.
- La prueba de SDK usa **el SDK real con HTTP contra un servidor local**. Comprueba PUT con If-None-Match, reintento sin sobrescritura, consulta del contenedor, descarga, URL codificada y permisos de lectura SAS. El servidor es una fixture local con credenciales sintéticas; no es Azure real.
- **69 pruebas Vitest aprobadas**. Incluyen flujo completo de la cola original: texto confirmado → multipart de foto → ACK; foto pendiente ante fallo; reemplazo mientras hay una subida; padre eliminado; exclusión de SAS/URLs de presentación del almacenamiento; API de lectura binaria y recuperación de caché al reabrir SQLite.
- TypeScript y Vite aprobados. Se mantiene la advertencia de tamaño del bundle, sin errores de compilación.
- Capacitor sync y Gradle assembleDebug aprobados. APK: `android/app/build/outputs/apk/debug/app-debug.apk`; SHA-256 `B188517178058733B66B9E83A9BC4FB3A1AE5C054F5C8316569CFFD30B5EEAB0`.
- Comprobación del bundle: no contiene configuración AZURE_STORAGE_CONNECTION_STRING, AZURE_STORAGEBLOB_CONNECTIONSTRING ni AccountKey. Las credenciales de almacenamiento permanecen en el backend.
- El JAR se generó con el SDK de Azure incluido. Su tamaño crece por las dependencias de almacenamiento e identidad.
- La comprobación pública de App Service/health se ejecutó realmente y resultó 200/UP. La lectura/escritura Blob con credenciales del App Service y la persistencia central deben ejecutarse después de desplegar el JAR. No se registraron cuentas ni se escribieron datos de prueba en producción.
- La persistencia física en Android y la prueba entre dos teléfonos siguen pendientes de dispositivo. Las comprobaciones de archivos usan la abstracción nativa simulada y SQLite real; no se afirma que equivalgan a una prueba en teléfono.

## Entrega y archivos

JAR preparado: `backend/kuska-api/kuska-api/target/kuska-api-0.0.1-SNAPSHOT.jar` (96.169.590 bytes).

SHA-256: `43A481588AC242C7AAB4BB8358127CE5F6E64207374EC4F1468699AD2F8EB0FC`.

Se añaden `BlobImageStore`, `AzureBlobImageStore`, `BlobImageService`, `BlobImageController` y `BlobUnavailableException` en el subpaquete Java `images`, con sus tres archivos de pruebas. En frontend se añade `services/blobImages.ts` y sus pruebas, y pruebas de multipart/lectura binaria de apiClient.

Los cambios en archivos existentes se limitan a dependencias/configuración, los puntos de conexión de imagen en services/posts/syncQueue, soporte opcional multipart/binario en apiClient, campos de presentación y helpers de imagen. Las pruebas anteriores se ampliaron para demostrar que el flujo de texto sigue funcionando. No se cambiaron pantallas, CSS fuente, mapa, agente ni los rangos de precios.

El diff de esta etapa se entrega localmente en `.cache/kuska-blob-review.patch`. El código, las pruebas y esta documentación se publican en GitHub a solicitud del usuario. Los APK/JAR generados y la configuración local permanecen excluidos por Git. No hubo despliegue de backend, cambios de infraestructura o eliminación de imágenes.

## Verificación final que debe hacer el equipo

1. Revisar y autorizar la publicación de este JAR en el App Service existente. Comparar el hash antes de desplegar y conservar el artefacto anterior para rollback.
2. Confirmar que la variable de cadena ya configurada tiene uno de los nombres reconocidos, o que la identidad administrada tiene los permisos de datos requeridos. No enviar su valor por WhatsApp, GitHub o el chat.
3. Con una cuenta de prueba autorizada, consultar GET /api/imagenes/estado. Debe responder available=true. Esto comprueba acceso al contenedor; la prueba posterior de subida verifica escritura.
4. Publicar texto con foto y comprobar Blob, UrlRemota en SQL y RutaLocal/UrlRemota en SQLite. Abrir la misma publicación desde otro teléfono autenticado.
5. Probar sin red, cerrar/abrir, recuperar conexión y comprobar un único archivo para el mismo ID/contenido. Reemplazar la foto y verificar que una respuesta antigua no pisa la nueva.

La integración conserva los originales y las versiones anteriores en Blob. No hay limpieza automática ni transacción única Blob/SQL: si Blob se confirma y SQL falla, el reintento reutiliza el mismo objeto y vuelve a registrar la relación. No se borran objetos para compensar errores. La política de retención/limpieza de huérfanos queda a decisión del equipo.
