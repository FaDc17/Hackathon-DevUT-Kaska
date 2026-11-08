# Verificación backend Kuska — 8 de noviembre de 2026

> Actualización posterior: [Azure, health e imágenes](../../../docs/AZURE_HEALTH_E_IMAGENES.md). Catálogos públicos HTTP 200, health público HTTP 401, health local HTTP 200; 41 pruebas Maven y JAR reconstruido. El diagnóstico de timeout y el conteo anterior de este documento son históricos.

## Cambios y contratos

Se reutilizan Spring Boot, JWT, Azure SQL y los endpoints CRUD existentes. No se
crean tablas, recursos de Azure, cuentas de prueba remotas ni otro servicio.

| Ruta | Comportamiento |
| --- | --- |
| `GET /api/catalogos/provincias?departamentoId=…` | Provincias distintas de `Distritos.NombreProvincia`, con `idDepartamento`, `departamento`, `nombre`. El filtro es opcional. |
| `GET /api/catalogos/canales-ayuda?distritoId=…&tipoAyuda=…` | Aplica conjuntamente ubicación y tipo; incluye Nacional, Regional del departamento y Distrital/Interdistrital con el distrito exacto registrado. Elimina duplicados de institución, tipo y teléfono. No infiere territorios a partir de descripciones. |
| `GET /api/usuarios/{id}/publico` | Perfil del proveedor activo, protegido con JWT. Campos `id`, `username`, `districtId`, `district`, `province`, `departmentId`, `department`, `about`. Excluye dirección privada y teléfono. |
| `DELETE /api/usuarios/me` | JWT, cuerpo `{ "password": "…", "confirmation": "ELIMINAR" }`. Contraseña validada de nuevo; devuelve 204 solo al completar la transacción. |
| `DELETE /api/servicios/{id}` y `DELETE /api/publicaciones/{id}` | Reintentos idempotentes conservando comprobación del propietario del registro original, incluso si ya tiene borrado lógico. |
| `POST /api/sync/operations` | Eliminación de servicios/publicaciones acepta `payload: {}` y el ID original en `entityId`. No exige rellenar otra vez el formulario para borrar. |
| `GET /actuator/health` | Público; estado de salud sin componentes, credenciales ni detalles internos. Los endpoints de negocio siguen protegidos. |

Los DTO de servicios y publicaciones añaden `districtId` desde `Usuarios.IdDistrito`
para distinguir distritos homónimos. Sus identificadores de contenido siguen siendo
las cadenas originales de la base, sin hashes numéricos.

La contraseña incorrecta al eliminar devuelve 403 `ACCOUNT_VERIFICATION_FAILED`;
la sesión JWT válida sigue vigente para que la persona pueda intentarlo otra vez.

La eliminación de cuenta es lógica. Desactiva el usuario y marca sus servicios,
publicaciones, imágenes, emergencias, reseñas, respuestas y favoritos relacionados
en la misma transacción. Conserva las claves foráneas y no ejecuta `DELETE FROM`.
Los JWT emitidos antes de desactivar la cuenta son rechazados al comprobar su
estado actual. No se ha ejecutado esta operación sobre cuentas reales.

Se conservan las relaciones de imágenes y comentarios al eliminar contenido.
Los listados excluyen contenido de propietarios inactivos. Actualizar o crear
con el ID de un servicio/publicación eliminado no lo restaura.

`application.properties` permite `AZURE_SQL_JDBC_URL`, `PORT`, `SERVER_PORT`,
`SERVER_ADDRESS` y `KUSKA_CORS_ALLOWED_ORIGINS`, escucha en `0.0.0.0` por defecto,
y reconoce cabeceras del proxy. Se mantiene la base configurada y
`spring.jpa.hibernate.ddl-auto=none`. `mvnw.cmd` soporta una carpeta `.m2` normal
sin intentar indexar un destino de enlace nulo.

## App Service existente

URL proporcionada por el usuario:
`https://kuska-api-fadc-akd8fkcrfpcwdgdj.eastus2-01.azurewebsites.net`.

Pruebas de solo lectura ejecutadas desde este entorno, también fuera del
sandbox:

- DNS resuelve mediante CNAME de Azure a `20.119.128.19`.
- `curl` conecta TCP 443 en 0,400 s y completa TLS en 0,540 s.
- `GET /api/catalogos/departamentos` no recibe ningún byte HTTP antes del timeout
  de 12,004 s (`http_code=000`, salida curl 28).
- También agotaron timeout las rutas `/`, `/api/health`, `/actuator/health` y
  `/api/usuarios/me`, con límite de 12 s por solicitud.

DNS y negociación TCP/TLS funcionan en esa comprobación. No se obtuvo un código
HTTP, por lo que no hay evidencia de 401, 403, 404, 500 ni de CORS como causa.
El resultado no identifica todavía si el bloqueo está en proxy, enrutamiento o
aplicación. No demuestra que Spring Boot ni Azure SQL estén operativos allí.
No se cambió la infraestructura y no se desplegó el JAR.

Faltan acceso de solo lectura al recurso (suscripción/grupo), configuración de
Java y arranque, configuración de puertos, restricciones de acceso, estado del
App Service, logs de arranque/HTTP y artefacto desplegado. No hay Azure CLI
instalada ni credenciales Azure SQL/JWT en el proceso actual. Las modificaciones
de exposición, red, permisos o despliegue requieren la autorización indicada por
el usuario después de identificar la causa.

## Pruebas y límites

Java disponible: Temurin 21.0.13. Maven Wrapper: 3.10.0. Spring Boot: 4.1.2.

Comandos de verificación (desde esta carpeta; usa tu ruta de caché Maven si el
entorno no resuelve correctamente `user.home`):

```powershell
.\mvnw.cmd test
.\mvnw.cmd package
```

La suite verifica autenticación, revocación de cuentas inactivas, validación de
confirmación, contraseña y propietario, reintentos de borrado, IDs originales,
ausencia de restauración, privacidad del perfil público, filtros de cobertura,
deduplicación y provincias. Incluye MockMvc y un servidor Tomcat local con HTTP
real para salud, catálogos, sesión requerida y preflight CORS de Capacitor.
Los repositorios están simulados en las pruebas HTTP; no son una prueba de
lectura/escritura de Azure SQL. La clase `AzureSqlConnectionVerifierTests` también
usa JDBC simulado, aunque su mensaje de log diga que la conexión fue verificada.

Resultado final: **39 pruebas ejecutadas, 0 fallos, 0 errores, 0 omitidas**;
`package` generó `target/kuska-api-0.0.1-SNAPSHOT.jar`.
`git diff --check -- backend` también pasó. Las pruebas y el JAR corresponden
al código local de esta revisión; el recurso compartido sigue sin desplegarse.

Quedan pendientes: JDBC real con credenciales autorizadas; compatibilidad y
rollback de las consultas de borrado lógico en Azure; CRUD con registros remotos
de prueba autorizados; API pública del App Service; registro/login reales;
persistencia desde Android. La eliminación lógica no es una política de
anonimización o purga de datos personales.

## Archivos

- `mvnw.cmd`: corrección del wrapper en Windows.
- `application.properties`: configuración de red/entorno, salud y CORS local.
- `catalog/CatalogController.java`, `CatalogDtos.java`, `CatalogService.java`:
  provincias y cobertura de ayuda.
- `content/ContentDtos.java`, `ContentRepository.java`, `ContentService.java`:
  distrito estable, reintentos de borrado y filtros de propietarios activos.
- `security/JwtAuthenticationFilter.java`, `SecurityConfiguration.java`:
  rechazo de cuentas desactivadas y ruta de salud.
- `user/AuthService.java`, `UserDtos.java`, `UsuarioController.java`,
  `UsuarioRepository.java`: eliminación propia y transacción de relaciones;
  representaciones de credenciales sin secretos en `toString()`.
- Nuevo `user/AccountVerificationException.java` y ajuste de
  `catalog/ApiExceptionHandler.java`: revalidación de contraseña con 403,
  diferenciada de JWT inválido.
- Nuevo `user/PublicProfileController.java`: perfil público del propietario.
- Nuevos `catalog/CatalogServiceTests.java` y `security/BackendHttpSmokeTests.java`;
  ampliados `ContentServiceTests.java`, `SecurityEndpointsTests.java`,
  `AuthServiceTests.java`: comprobaciones indicadas.
- `AZURE_SQL_PENDING.md` y este archivo: instrucciones actuales y evidencia.
