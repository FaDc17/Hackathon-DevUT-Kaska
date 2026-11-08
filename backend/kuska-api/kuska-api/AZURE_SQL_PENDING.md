# Conexion Azure SQL

La API Kuska mantiene las credenciales fuera del codigo mediante variables de entorno.

La base configurada actualmente es `free-sql-db-8911281`:

```properties
spring.datasource.url=jdbc:sqlserver://sql-kuska-fadc.database.windows.net:1433;databaseName=free-sql-db-8911281;encrypt=true;trustServerCertificate=false;loginTimeout=30;
spring.datasource.username=${AZURE_SQL_USERNAME}
spring.datasource.password=${AZURE_SQL_PASSWORD}
spring.datasource.driver-class-name=com.microsoft.sqlserver.jdbc.SQLServerDriver
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.initialization-fail-timeout=30000
spring.jpa.hibernate.ddl-auto=none
```

No almacenar usuarios ni contrasenas reales en archivos del proyecto.

## Carga segura de variables en PowerShell

```powershell
$env:AZURE_SQL_USERNAME = "administrador"
$env:AZURE_SQL_PASSWORD = Read-Host "Azure SQL password" -MaskInput
```

No imprimas la variable de contraseña. Para comprobar que ambas estan
disponibles:

```powershell
if ($env:AZURE_SQL_USERNAME) { "AZURE_SQL_USERNAME disponible" }
if ($env:AZURE_SQL_PASSWORD) { "AZURE_SQL_PASSWORD disponible" }
```

## Arranque con conexion real

Desde la carpeta del proyecto backend:

```powershell
mvn clean test
mvn clean package
mvn spring-boot:run
```

Para compilar el artefacto:

```powershell
mvn clean test
mvn clean package
java -jar target\kuska-api-0.0.1-SNAPSHOT.jar
```

Una conexion correcta debe permitir consultar:

```sql
SELECT DB_NAME(), ORIGINAL_LOGIN(), @@SERVERNAME;
```

El resultado esperado incluye `free-sql-db-8911281`, `administrador` y
`sql-kuska-fadc`.

## Variables obligatorias

Antes de iniciar, define las credenciales de Azure y el secreto JWT en la misma
terminal. La autenticación HTTP utiliza JWT; las antiguas variables de Basic
Auth `KUSKA_SECURITY_USERNAME` y `KUSKA_SECURITY_PASSWORD` ya no se utilizan.

```powershell
$env:AZURE_SQL_USERNAME = "administrador"
$env:AZURE_SQL_PASSWORD = Read-Host "Contraseña Azure SQL" -MaskInput
$env:JWT_SECRET = Read-Host "Secreto JWT Base64 de al menos 32 bytes aleatorios" -MaskInput
```

Verifica únicamente su disponibilidad:

```powershell
@("AZURE_SQL_USERNAME", "AZURE_SQL_PASSWORD",
  "JWT_SECRET") |
  ForEach-Object {
    if ([Environment]::GetEnvironmentVariable($_, "Process")) {
      "$_ disponible"
    } else {
      "$_ NO disponible"
    }
  }
```

No se iniciara una instancia que no haya obtenido las tres variables ni que
no haya comprobado mediante JDBC la base y el servidor configurados.

`Read-Host -MaskInput` requiere PowerShell 7. En Windows PowerShell 5.1, configura
los secretos con el gestor de variables del entorno o App Service. No los
escribas como argumentos de comandos ni los guardes en el repositorio.

Para el diagnóstico del App Service existente, contratos HTTP nuevos y las
limitaciones verificadas, consulta [BACKEND_VERIFICATION.md](BACKEND_VERIFICATION.md).
