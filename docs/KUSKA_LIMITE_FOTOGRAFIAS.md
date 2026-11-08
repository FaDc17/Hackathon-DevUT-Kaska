# Corrección de subida de fotografías

8 de noviembre de 2026. Rama `Actualizacion-del-chatBOT`.

El mensaje aportado, `The field archivo exceeds its maximum permitted size of 1048576 bytes`, identifica un límite multipart efectivo de 1 MiB en el servidor que procesó esa petición. La copia local ya tenía 5 MB por archivo y 6 MB por petición. No se puede concluir solo con ese log si producción usa un artefacto anterior o una configuración externa que prevalece sobre el archivo.

## Cambios implementados

- `application.properties`: 10 MB por archivo y 11 MB por petición, dejando margen para cabeceras, delimitadores y campos del formulario. Spring expresa estos tamaños como múltiplos de 1024 bytes.
- `BlobImageService` y `AzureBlobImageStore`: límite coherente de 10 MiB tanto en subida como en lectura. No queda un segundo rechazo a los 5 MiB después del parser.
- `ApiExceptionHandler`: respuesta global HTTP 413 con `error=IMAGE_TOO_LARGE` y un mensaje sencillo. Se retiró el manejador duplicado del controlador. El rechazo multipart previo a seleccionar controlador también queda cubierto y no se registra como un error interno 500.
- Cliente: permite originales JPG, PNG y WebP de hasta 10 MiB; rechaza archivos mayores antes de decodificar.
- `PersistentImagesPlugin` de Android: límite binario coherente de 10 MiB, incluyendo margen calculado para Base64 al validar la entrada. También permite conservar descargas autorizadas entre 5 y 10 MiB; el puente antes seguía limitado a 5 MiB.
- Compresión de archivos superiores a 750 KiB, antes de persistir la selección y antes de subir fotos pendientes antiguas: lado máximo de 1280 px y calidad 0,7. JPEG conserva JPEG; PNG/WebP usan WebP para conservar transparencia. Hay un decodificador alternativo para WebView sin `createImageBitmap`, y se liberan bitmap y URL temporal.
- Nunca se sustituye el original por un resultado más pesado ni se marca una imagen como subida antes de la confirmación del backend. Si falla la compresión al reintentar una fotografía pendiente ya guardada, se conserva esa copia local. No se crea una referencia remota ficticia.

Se mantiene el campo multipart `archivo`, el MIME real y la extensión correspondiente al resultado comprimido, los IDs, la cola de sincronización existente y la lectura mediante el backend. No se modificaron tablas, contenedores, credenciales, URL del backend ni datos compartidos.

## Verificación ejecutada

| Prueba | Resultado |
| --- | --- |
| TypeScript | Correcto. |
| Vitest | 228 pruebas en 17 archivos aprobadas. Incluye compresión, persistencia del resultado y envío de una foto pendiente antigua con el MIME correcto. |
| Maven/Spring Boot | 65 pruebas aprobadas, cero fallos/errores. |
| HTTP real contra Tomcat local | Archivos de 2 MiB y exactamente 10 MiB aceptados; archivo de 10 MiB + 1 byte rechazado con 413 y `IMAGE_TOO_LARGE`. Se usan los valores leídos del archivo productivo. Repositorios simulados; endpoint de prueba presente solo en fuentes/perfil de test. |
| Servicio Blob con dependencias simuladas | Foto mayor de 1 MiB aceptada; exceso de 10 MiB rechazado sin leer/subir bytes. |
| Navegador Edge, codificadores reales | Imagen PNG sintética de 1600×1200 y 6.606.744 bytes reducida a WebP de 1280×960 y 603.778 bytes en la ejecución observada. El resultado varía según la fotografía. |
| Regresión de navegador | 14 escenarios aprobados; API/Worker simulados, sin escrituras en Azure. |
| Vite | Compilación correcta; conserva el aviso previo de tamaño del bundle. |
| Empaquetado Spring Boot | JAR generado después de las pruebas, sin despliegue. |
| Capacitor y Gradle | Sincronización y `assembleDebug` correctos; sin instalación ni prueba física. |

Scripts y suites relevantes: `scripts/qa-experience.mjs`, `src/services/imageCompression.test.ts`, `src/services/images.test.ts`, `src/services/blobImages.test.ts`, `BlobImageServiceTests`, `BlobImageControllerTests` y `BackendHttpSmokeTests`.

## Aplicación en Azure y Android

El JAR preparado está en `backend/kuska-api/kuska-api/target/kuska-api-0.0.1-SNAPSHOT.jar`. La aplicación necesita el frontend actualizado para comprimir selecciones nuevas y fotos pendientes al subirlas. El APK debug se encuentra en `android/app/build/outputs/apk/debug/app-debug.apk`.

Huellas SHA-256: JAR `43144c1459f243e5ce93ba31de597d707d6558db92359ef35515feb715cb6d01`; APK `b6bec5cb7ef2d4bb59dbc58fd2a44af997815ca2d81b476e31d466c054494af9`. Se comprobó directamente que el JAR contiene las propiedades multipart de 10 MB y 11 MB.

El diff acumulado de estas correcciones y las mejoras anteriores está en `KUSKA_MEJORAS.diff`; la lista de archivos está en `KUSKA_ARCHIVOS_MODIFICADOS.txt` y el estado de la rama en `KUSKA_GIT_FINAL.txt`. Se conservan los cambios iniciales del equipo y no hubo commit, push ni merge.

No se desplegó ni se alteraron variables de App Service. Para que producción aplique el límite nuevo hay que autorizar el despliegue y revisar si existen estas variables que sobrescriben el archivo:

```text
SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE=10MB
SPRING_SERVLET_MULTIPART_MAX_REQUEST_SIZE=11MB
```

Modificar esas variables y aplicar los cambios puede reiniciar App Service; no se ejecutó esa acción. El artefacto también contiene los cambios locales previos del equipo, por lo que deben revisarse conjuntamente antes del despliegue compartido.

Pendiente: publicar con una cuenta autorizada, comprobar creación del objeto Blob y persistencia de su referencia en Azure SQL, y abrir la fotografía desde una segunda cuenta/dispositivo. Las pruebas locales no certifican esos resultados remotos. La compresión suele reducir el tamaño, pero no garantiza que todas las fotografías queden por debajo del antiguo límite de 1 MiB; sigue siendo necesario corregir la configuración efectiva del servidor.
