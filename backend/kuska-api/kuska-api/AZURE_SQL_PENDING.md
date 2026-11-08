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
$env:AZURE_SQL_PASSWORD = Read-Host "Azure SQL password"
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

Antes de iniciar, define las credenciales de Azure y una contraseña distinta
para la cuenta HTTP de Spring en la misma terminal:

```powershell
$env:AZURE_SQL_USERNAME = "administrador"
$env:AZURE_SQL_PASSWORD = Read-Host "Contraseña Azure SQL"
$env:KUSKA_SECURITY_USERNAME = "kuska-admin"
$env:KUSKA_SECURITY_PASSWORD = Read-Host "Contraseña HTTP Kuska API"
```

Verifica únicamente su disponibilidad:

```powershell
@("AZURE_SQL_USERNAME", "AZURE_SQL_PASSWORD",
  "KUSKA_SECURITY_USERNAME", "KUSKA_SECURITY_PASSWORD") |
  ForEach-Object {
    if ([Environment]::GetEnvironmentVariable($_, "Process")) {
      "$_ disponible"
    } else {
      "$_ NO disponible"
    }
  }
```

No se iniciara una instancia que no haya obtenido las cuatro variables ni que
no haya comprobado mediante JDBC la base y el servidor configurados.
