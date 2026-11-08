$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$apiBaseUrl = "http://127.0.0.1:18081"
$sqlServer = "sql-kuska-fadc.database.windows.net"
$sqlDatabase = "free-sql-db-8911281"
$parentEnvironmentSnapshot = [System.Collections.Generic.Dictionary[string, string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
)
foreach ($entry in [System.Environment]::GetEnvironmentVariables("Process").GetEnumerator()) {
    $parentEnvironmentSnapshot[[string]$entry.Key] = [string]$entry.Value
}
$testResults = [System.Collections.Generic.List[object]]::new()
$pendingCleanup = [System.Collections.Generic.List[string]]::new()
$javaOutput = [System.Collections.Generic.List[string]]::new()
$javaProcess = $null
$stdoutReadTask = $null
$stderrReadTask = $null
$httpClient = $null
$sqlConnection = $null
$sqlPassword = $null
$testPassword = $null
$primaryToken = $null
$secondaryToken = $null
$primaryUserCreated = $false
$secondaryUserCreated = $false
$resourcesCreated = @{
    Service      = $false
    ServiceImage = $false
    Review       = $false
    Favorite     = $false
    Post         = $false
    PostImage    = $false
    Reply        = $false
    Emergency    = $false
}
$testIds = @{
    RunId        = [Guid]::NewGuid().ToString("N").Substring(0, 10)
    Username     = $null
    Phone        = $null
    Service      = $null
    ServiceImage = $null
    Review       = $null
    Post         = $null
    PostImage    = $null
    Reply        = $null
    Emergency    = $null
}
$rng = $null
$scriptFailed = $false
$currentTest = "Validación inicial"
$primaryTestPassword = $null
$secondaryTestPassword = $null

$plannedTests = @(
    "Azure SQL: conexión, SELECT 1 y verificación de servidor/base",
    "Puerto 18081 libre y arranque aislado de Spring Boot conectado a Azure SQL",
    "Catálogos: departamentos, distritos, categorías, tipos y canales",
    "Registro de la primera cuenta sintética",
    "Rechazo de acceso no autenticado y JWT inválido",
    "Login: credenciales incorrectas y correctas",
    "Perfil propio: lectura y persistencia de actualización",
    "Registro e identidad de una segunda cuenta sintética",
    "Aislamiento: usuario secundario no modifica recursos ajenos",
    "Servicio, imagen, reseña y favorito: escritura y lectura",
    "Publicación, imagen, respuesta y emergencia: escritura y lectura",
    "Sincronización repetida por ID de recurso sin duplicación",
    "Validación de entrada inválida con respuesta HTTP 400",
    "Logout: contrato HTTP; no se prueba ni afirma revocación del JWT",
    "Limpieza lógica de recursos de contenido creados",
    "Detención y confirmación de cierre del proceso Java propio",
    "Entorno del PowerShell padre sin modificaciones"
)

function Add-TestResult {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][ValidateSet("PASS", "FAIL", "SKIP")][string]$Status,
        [Parameter(Mandatory = $true)][string]$Detail
    )
    $script:testResults.Add([pscustomobject]@{
        Name   = $Name
        Status = $Status
        Detail = $Detail
    })
    $color = switch ($Status) {
        "PASS" { "Green" }
        "FAIL" { "Red" }
        default { "Yellow" }
    }
    Write-Host "[$Status] $Name - $Detail" -ForegroundColor $color
}

function Complete-Test {
    param([Parameter(Mandatory = $true)][string]$Detail)
    Add-TestResult -Name $script:currentTest -Status "PASS" -Detail $Detail
}

function Assert-True {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )
    if (-not $Condition) { throw $Message }
}

function Assert-HttpStatus {
    param(
        [Parameter(Mandatory = $true)]$Response,
        [Parameter(Mandatory = $true)][int]$Expected,
        [Parameter(Mandatory = $true)][string]$Operation
    )
    if ($Response.StatusCode -ne $Expected) {
        $bodyText = if ($null -eq $Response.Body) {
            "(vacío)"
        } else {
            ConvertTo-Json -InputObject $Response.Body -Depth 20 -Compress
        }
        foreach ($secret in @(
            $script:sqlPassword,
            $script:primaryTestPassword,
            $script:secondaryTestPassword,
            $script:primaryToken,
            $script:secondaryToken,
            $script:envJwtSecret
        ) | Where-Object { -not [string]::IsNullOrEmpty($_) }) {
            $bodyText = $bodyText.Replace($secret, "[REDACTED]")
        }
        $bodyText = [regex]::Replace(
            $bodyText,
            '(?i)("(?:[^"]*(?:password|token|secret|authorization)[^"]*)"\s*:\s*")[^"]*(")',
            '$1[REDACTED]$2'
        )
        if ($bodyText.Length -gt 4000) {
            $bodyText = $bodyText.Substring(0, 4000) + "...[truncado]"
        }
        throw "$Operation devolvió HTTP $($Response.StatusCode); se esperaba $Expected. Cuerpo: $bodyText"
    }
}

function Invoke-Api {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body,
        [string]$AccessToken = $script:primaryToken
    )

    $request = [System.Net.Http.HttpRequestMessage]::new(
        [System.Net.Http.HttpMethod]::new($Method),
        "$script:apiBaseUrl$Path"
    )
    if ($null -ne $Body) {
        $json = ConvertTo-Json -InputObject $Body -Depth 20 -Compress
        $request.Content = [System.Net.Http.StringContent]::new(
            $json,
            [System.Text.Encoding]::UTF8,
            "application/json"
        )
    }
    if (-not [string]::IsNullOrWhiteSpace($AccessToken)) {
        $request.Headers.Authorization =
            [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $AccessToken)
    }

    try {
        $response = $script:httpClient.SendAsync($request).GetAwaiter().GetResult()
        try {
            $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            $parsed = $null
            if (-not [string]::IsNullOrWhiteSpace($content)) {
                try {
                    $parsed = ConvertFrom-Json -InputObject $content
                } catch {
                    $parsed = $content
                }
            }
            return [pscustomobject]@{
                StatusCode = [int]$response.StatusCode
                Body       = $parsed
            }
        } finally {
            $response.Dispose()
        }
    } finally {
        $request.Dispose()
    }
}

function Invoke-CheckedApi {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body,
        [int]$ExpectedStatus = 200,
        [string]$AccessToken = $script:primaryToken
    )
    $response = Invoke-Api -Method $Method -Path $Path -Body $Body -AccessToken $AccessToken
    Assert-HttpStatus -Response $response -Expected $ExpectedStatus -Operation "$Method $Path"
    return $response.Body
}

function Normalize-SqlDataSource {
    param([string]$DataSource)
    $normalized = $DataSource -replace '^(?i:tcp):', ''
    return $normalized -replace '(?i)(,1433|:1433)$', ''
}

function Test-ExpectedAzureServer {
    param([string]$DataSource)
    $normalizedDataSource = Normalize-SqlDataSource -DataSource $DataSource
    return [string]::Equals(
        $normalizedDataSource,
        $script:sqlServer,
        [System.StringComparison]::OrdinalIgnoreCase
    )
}

function Read-JavaOutput {
    param([switch]$WaitForPendingRead)

    if (-not $script:javaProcess) { return }
    foreach ($stream in @("stdout", "stderr")) {
        $taskVariable = if ($stream -eq "stdout") { "stdoutReadTask" } else { "stderrReadTask" }
        $reader = if ($stream -eq "stdout") {
            $script:javaProcess.StandardOutput
        } else {
            $script:javaProcess.StandardError
        }
        while ($null -ne (Get-Variable -Name $taskVariable -Scope Script).Value `
                -and (Get-Variable -Name $taskVariable -Scope Script).Value.IsCompleted) {
            $readTask = (Get-Variable -Name $taskVariable -Scope Script).Value
            try {
                $line = $readTask.GetAwaiter().GetResult()
                if ($null -eq $line) {
                    Set-Variable -Name $taskVariable -Scope Script -Value $null
                    break
                }
                $script:javaOutput.Add($line)
                Set-Variable -Name $taskVariable -Scope Script -Value $reader.ReadLineAsync()
            } catch {
                Set-Variable -Name $taskVariable -Scope Script -Value $null
                break
            }
        }
    }
    if ($WaitForPendingRead -and -not $script:javaProcess.HasExited) {
        Start-Sleep -Milliseconds 50
        Read-JavaOutput
    }
}

function Get-SanitizedJavaOutput {
    $secretValues = @(
        $script:sqlPassword,
        $script:primaryTestPassword,
        $script:secondaryTestPassword,
        $script:primaryToken,
        $script:secondaryToken,
        $script:envJwtSecret
    ) | Where-Object { -not [string]::IsNullOrEmpty($_) } | Sort-Object Length -Descending
    $safeLines = foreach ($line in $script:javaOutput | Select-Object -Last 25) {
        $safeLine = [string]$line
        foreach ($secret in $secretValues) {
            $safeLine = $safeLine.Replace($secret, "[REDACTED]")
        }
        $safeLine
    }
    return ($safeLines -join [Environment]::NewLine)
}

function Start-IsolatedApi {
    $java = Get-Command java -ErrorAction SilentlyContinue
    $maven = Get-Command mvn -ErrorAction SilentlyContinue
    if (-not $java) { throw "No se encontró Java en PATH." }
    if (-not $maven) { throw "No se encontró Maven (mvn) en PATH." }

    $modulePath = Join-Path $PSScriptRoot "backend\kuska-api\kuska-api"
    $pomPath = Join-Path $modulePath "pom.xml"
    if (-not (Test-Path -LiteralPath $pomPath)) {
        throw "No se encontró el proyecto Maven: $pomPath"
    }

    Push-Location $modulePath
    try {
        Write-Host "Ejecutando mvn -q package antes de iniciar la instancia aislada..."
        & $maven.Source -q package
        if ($LASTEXITCODE -ne 0) {
            throw "mvn package falló con código $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }

    $jarPath = Join-Path $modulePath "target\kuska-api-0.0.1-SNAPSHOT.jar"
    if (-not (Test-Path -LiteralPath $jarPath)) {
        throw "Maven terminó sin generar el JAR esperado."
    }

    $connectionUrl = "jdbc:sqlserver://$($script:sqlServer):1433;databaseName=$($script:sqlDatabase);encrypt=true;trustServerCertificate=false;loginTimeout=30;"
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $java.Source
    $quote = [string][char]34
    $startInfo.Arguments = "-jar $quote$jarPath$quote --server.port=18081"
    $startInfo.WorkingDirectory = $modulePath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.EnvironmentVariables["AZURE_SQL_USERNAME"] = $script:sqlUsername
    $startInfo.EnvironmentVariables["AZURE_SQL_PASSWORD"] = $script:sqlPassword
    $startInfo.EnvironmentVariables["SPRING_DATASOURCE_USERNAME"] = $script:sqlUsername
    $startInfo.EnvironmentVariables["SPRING_DATASOURCE_PASSWORD"] = $script:sqlPassword
    $startInfo.EnvironmentVariables["SPRING_DATASOURCE_URL"] = $connectionUrl
    $startInfo.EnvironmentVariables["JWT_SECRET"] = $script:envJwtSecret

    $script:javaProcess = [System.Diagnostics.Process]::new()
    $script:javaProcess.StartInfo = $startInfo
    $portReservation = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Any,
        18081
    )
    try {
        try {
            $portReservation.Start()
        } catch {
            throw "El puerto TCP 18081 ya está ocupado o no se puede reservar. No se detuvo ningún proceso ajeno. Detén el servicio que lo usa o libera el puerto y vuelve a ejecutar."
        }
        $portReservation.Stop()
        if (-not $script:javaProcess.Start()) {
            throw "Windows no pudo iniciar el proceso Java de prueba."
        }
    } finally {
        $portReservation.Stop()
    }
    $script:stdoutReadTask = $script:javaProcess.StandardOutput.ReadLineAsync()
    $script:stderrReadTask = $script:javaProcess.StandardError.ReadLineAsync()

    $deadline = (Get-Date).AddSeconds(120)
    $startupReported = $false
    $databaseReported = $false
    $catalogReady = $false
    while ((Get-Date) -lt $deadline) {
        Read-JavaOutput
        if ($script:javaProcess.HasExited) {
            Read-JavaOutput -WaitForPendingRead
            throw "La instancia Java terminó antes de estar lista. Salida: $(Get-SanitizedJavaOutput)"
        }

        $combinedOutput = $script:javaOutput -join "`n"
        $startupReported = $combinedOutput -match "Started KuskaApiApplication"
        $jdbcIdentityPattern = "(?m)Conexion JDBC con Azure SQL verificada: base=$([regex]::Escape($script:sqlDatabase)), servidor=.+\r?$"
        $databaseReported = $combinedOutput -match $jdbcIdentityPattern

        if ($startupReported -and $databaseReported) {
            try {
                $catalogResponse = Invoke-Api -Method "GET" -Path "/api/catalogos/departamentos" -AccessToken ""
                if ($catalogResponse.StatusCode -eq 200 -and @($catalogResponse.Body).Count -gt 0) {
                    $catalogReady = $true
                    break
                }
            } catch {
                # The owned process is still starting its HTTP listener.
            }
        }
        Start-Sleep -Milliseconds 500
    }

    Read-JavaOutput
    if (-not ($startupReported -and $databaseReported -and $catalogReady)) {
        throw "No se confirmó conjuntamente el arranque de Spring Boot, su conexión a la base/servidor esperados y la lectura del catálogo en 120 segundos. Salida: $(Get-SanitizedJavaOutput)"
    }
}

function Remove-CreatedResource {
    param(
        [Parameter(Mandatory = $true)][bool]$WasCreated,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label
    )
    if (-not $WasCreated) { return }
    try {
        $response = Invoke-Api -Method "DELETE" -Path $Path -AccessToken $script:primaryToken
        if ($response.StatusCode -notin @(200, 204)) {
            $script:pendingCleanup.Add("$Label (ID: $Path; HTTP $($response.StatusCode))")
        }
    } catch {
        $script:pendingCleanup.Add("$Label (ID: $Path; error de solicitud)")
    }
}

try {
    $currentTest = "Azure SQL: conexión, SELECT 1 y verificación de servidor/base"
    Add-Type -AssemblyName System.Data
    Add-Type -AssemblyName System.Net.Http
    $httpClient = [System.Net.Http.HttpClient]::new()
    $httpClient.Timeout = [TimeSpan]::FromSeconds(10)

    $script:sqlUsername = [string](Read-Host "Usuario de Azure SQL")
    if ([string]::IsNullOrWhiteSpace($script:sqlUsername)) {
        throw "El usuario de Azure SQL no puede estar vacío."
    }
    $secureSqlPassword = Read-Host "Contraseña de Azure SQL" -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSqlPassword)
    try {
        $script:sqlPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
        $secureSqlPassword.Dispose()
    }

    $connectionString = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
    $connectionString["Data Source"] = [string]"tcp:$($script:sqlServer),1433"
    $connectionString["Initial Catalog"] = [string]$script:sqlDatabase
    $connectionString["User ID"] = [string]$script:sqlUsername
    $connectionString["Password"] = [string]$script:sqlPassword
    $connectionString["Encrypt"] = [bool]$true
    $connectionString["TrustServerCertificate"] = [bool]$false
    $connectionString["Connect Timeout"] = [int]20
    $connectionStringText = [string]$connectionString.ConnectionString
    $sqlConnection = [System.Data.SqlClient.SqlConnection]::new($connectionStringText)
    $sqlConnection.Open()
    $sqlCommand = $sqlConnection.CreateCommand()
    $sqlCommand.CommandText = "SELECT 1, DB_NAME(), CONVERT(nvarchar(128), SERVERPROPERTY('ServerName'))"
    $sqlCommand.CommandTimeout = 20
    $sqlReader = $sqlCommand.ExecuteReader()
    try {
        if (-not $sqlReader.Read()) { throw "Azure SQL no devolvió la identidad de la conexión." }
        $directSelectResult = $sqlReader.GetInt32(0)
        $actualDatabase = $sqlReader.GetString(1)
        $actualServer = $sqlReader.GetString(2)
        $configuredDataSource = $sqlConnection.DataSource
        $configuredInitialCatalog = $connectionString.InitialCatalog
    } finally {
        $sqlReader.Dispose()
        $sqlCommand.Dispose()
        $sqlConnection.Close()
        $sqlConnection.Dispose()
        $sqlConnection = $null
    }
    Assert-True -Condition ($directSelectResult -eq 1) `
        -Message "La consulta directa a Azure SQL no devolvió SELECT 1 = 1."
    Assert-True -Condition (Test-ExpectedAzureServer $configuredDataSource) `
        -Message "SqlConnection.DataSource devolvió un servidor inesperado."
    Assert-True -Condition ([string]::Equals(
        $configuredInitialCatalog,
        $script:sqlDatabase,
        [System.StringComparison]::Ordinal
    )) `
        -Message "SqlConnection.Database no corresponde exactamente a '$script:sqlDatabase'."
    Assert-True -Condition ([string]::Equals(
        $actualDatabase,
        $script:sqlDatabase,
        [System.StringComparison]::Ordinal
    )) `
        -Message "DB_NAME() devolvió '$actualDatabase'; se esperaba exactamente '$script:sqlDatabase'."
    Complete-Test "SELECT 1, servidor configurado=$configuredDataSource, base configurada=$configuredInitialCatalog y DB_NAME()=$actualDatabase; SERVERPROPERTY('ServerName') informativo=$actualServer."

    $currentTest = "Puerto 18081 libre y arranque aislado de Spring Boot conectado a Azure SQL"
    $randomSecret = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($randomSecret)
    $script:envJwtSecret = [Convert]::ToBase64String($randomSecret)
    [Array]::Clear($randomSecret, 0, $randomSecret.Length)
    Start-IsolatedApi
    Complete-Test "Instancia propia PID $($javaProcess.Id), puerto 18081; variables SPRING_DATASOURCE_* señalan el servidor/base esperados y el verificador de arranque confirmó Azure SQL."

    $currentTest = "Catálogos: departamentos, distritos, categorías, tipos y canales"
    $departments = @(Invoke-CheckedApi -Method "GET" -Path "/api/catalogos/departamentos" -AccessToken "")
    $districts = @(Invoke-CheckedApi -Method "GET" -Path "/api/catalogos/distritos" -AccessToken "")
    $categories = @(Invoke-CheckedApi -Method "GET" -Path "/api/catalogos/categorias-servicio" -AccessToken "")
    $postTypes = @(Invoke-CheckedApi -Method "GET" -Path "/api/catalogos/tipos-publicacion" -AccessToken "")
    $channels = @(Invoke-CheckedApi -Method "GET" -Path "/api/catalogos/canales-ayuda" -AccessToken "")
    Assert-True ($departments.Count -gt 0 -and $districts.Count -gt 0 `
        -and $categories.Count -gt 0 -and $postTypes.Count -gt 0) `
        "Uno o más catálogos obligatorios están vacíos."
    Assert-True ($null -ne $departments[0].id -and $null -ne $districts[0].nombre `
        -and $null -ne $categories[0].nombre) "Un catálogo devolvió campos inesperados."
    $district = $districts[0]
    $category = $categories[0]
    $emergencyType = $postTypes | Where-Object { $_.nombre -eq "Emergencia" } | Select-Object -First 1
    Assert-True ($null -ne $emergencyType) "No está disponible el tipo de publicación Emergencia."
    Complete-Test "HTTP 200 y contenido válido; departamentos=$($departments.Count), distritos=$($districts.Count), categorías=$($categories.Count), tipos=$($postTypes.Count), canales=$($channels.Count)."

    $testIds.Username = "kuska" + $testIds.RunId
    $testIds.Phone = "9" + (Get-Random -Minimum 10000000 -Maximum 99999999).ToString()
    $script:primaryTestPassword = "Kk9!" + [Guid]::NewGuid().ToString("N").Substring(0, 20)
    $testAddress = "Dirección de prueba $($testIds.RunId)"
    $testAbout = "Cuenta de integración Kuska $($testIds.RunId)"

    $currentTest = "Registro de la primera cuenta sintética"
    $registerPrimary = Invoke-Api -Method "POST" -Path "/api/auth/register" -AccessToken "" -Body @{
        username = $testIds.Username
        password = $script:primaryTestPassword
        phone = $testIds.Phone
        address = $testAddress
        districtId = [int]$district.id
        about = $testAbout
    }
    Assert-HttpStatus $registerPrimary 201 "Registro de cuenta primaria"
    $primaryUserCreated = $true
    $primaryToken = [string]$registerPrimary.Body.accessToken
    $primaryUserId = [string]$registerPrimary.Body.user.id
    Assert-True (-not [string]::IsNullOrWhiteSpace($primaryToken) `
        -and -not [string]::IsNullOrWhiteSpace($primaryUserId)) `
        "El registro no devolvió ID de usuario y JWT."
    Assert-True ($registerPrimary.Body.user.username -eq $testIds.Username `
        -and $registerPrimary.Body.tokenType -eq "Bearer") `
        "La respuesta de registro no coincide con la cuenta de prueba."
    Complete-Test "HTTP 201; cuenta sintética $($testIds.Username), ID devuelto y JWT Bearer presentes (sin imprimir el token)."

    $currentTest = "Rechazo de acceso no autenticado y JWT inválido"
    $unauthorized = Invoke-Api -Method "GET" -Path "/api/usuarios/me" -AccessToken ""
    Assert-HttpStatus $unauthorized 401 "Perfil sin autenticación"
    $invalidTokenResponse = Invoke-Api -Method "GET" -Path "/api/usuarios/me" -AccessToken "invalid.integration.token"
    Assert-HttpStatus $invalidTokenResponse 401 "Perfil con JWT inválido"
    Complete-Test "El endpoint privado devolvió HTTP 401 con credenciales ausentes y con JWT inválido."

    $currentTest = "Login: credenciales incorrectas y correctas"
    $badLogin = Invoke-Api -Method "POST" -Path "/api/auth/login" -AccessToken "" -Body @{
        username = $testIds.Username
        password = "incorrecta-123"
    }
    Assert-HttpStatus $badLogin 401 "Login con contraseña incorrecta"
    Assert-True ($badLogin.Body.error -eq "INVALID_CREDENTIALS") `
        "La respuesta de login incorrecto no devolvió INVALID_CREDENTIALS."
    $login = Invoke-Api -Method "POST" -Path "/api/auth/login" -AccessToken "" -Body @{
        username = $testIds.Username
        password = $script:primaryTestPassword
    }
    Assert-HttpStatus $login 200 "Login válido"
    Assert-True ($login.Body.user.id -eq $primaryUserId `
        -and -not [string]::IsNullOrWhiteSpace([string]$login.Body.accessToken)) `
        "El login no devolvió la identidad y el token esperados."
    $script:primaryToken = [string]$login.Body.accessToken
    Complete-Test "Credencial incorrecta rechazada con HTTP 401; login válido HTTP 200 para la identidad primaria."

    $currentTest = "Perfil propio: lectura y persistencia de actualización"
    $profile = Invoke-CheckedApi -Method "GET" -Path "/api/usuarios/me"
    Assert-True ($profile.id -eq $primaryUserId -and $profile.username -eq $testIds.Username) `
        "El endpoint /me no devolvió el perfil del usuario autenticado."
    $aboutUpdated = "$testAbout actualizado"
    $profileUpdate = Invoke-CheckedApi -Method "PUT" -Path "/api/usuarios/me" -Body @{
        username = $testIds.Username
        phone = $testIds.Phone
        address = $testAddress
        districtId = [int]$district.id
        about = $aboutUpdated
    }
    Assert-True ($profileUpdate.id -eq $primaryUserId -and $profileUpdate.about -eq $aboutUpdated) `
        "La respuesta de actualización no refleja el perfil de prueba."
    $profileReadback = Invoke-CheckedApi -Method "GET" -Path "/api/usuarios/me"
    Assert-True ($profileReadback.about -eq $aboutUpdated) `
        "La lectura posterior no confirmó la persistencia del perfil."
    Complete-Test "HTTP 200; identidad propia verificada y campo de perfil actualizado confirmado al leer de nuevo."

    $currentTest = "Registro e identidad de una segunda cuenta sintética"
    $secondaryUsername = "kuska" + [Guid]::NewGuid().ToString("N").Substring(0, 10)
    $secondaryPhone = "9" + (Get-Random -Minimum 10000000 -Maximum 99999999).ToString()
    $script:secondaryTestPassword = "Kk9!" + [Guid]::NewGuid().ToString("N").Substring(0, 20)
    $secondaryRegister = Invoke-Api -Method "POST" -Path "/api/auth/register" -AccessToken "" -Body @{
        username = $secondaryUsername
        password = $script:secondaryTestPassword
        phone = $secondaryPhone
        address = "Segunda cuenta de prueba $($testIds.RunId)"
        districtId = [int]$district.id
        about = "Cuenta secundaria de integración $($testIds.RunId)"
    }
    Assert-HttpStatus $secondaryRegister 201 "Registro de cuenta secundaria"
    $secondaryUserCreated = $true
    $secondaryUserId = [string]$secondaryRegister.Body.user.id
    $secondaryToken = [string]$secondaryRegister.Body.accessToken
    Assert-True ($secondaryRegister.Body.user.username -eq $secondaryUsername `
        -and $secondaryUserId -ne $primaryUserId `
        -and -not [string]::IsNullOrWhiteSpace($secondaryToken)) `
        "La segunda cuenta no devolvió otra identidad y un JWT."
    $secondaryProfile = Invoke-CheckedApi -Method "GET" -Path "/api/usuarios/me" -AccessToken $secondaryToken
    Assert-True ($secondaryProfile.id -eq $secondaryUserId `
        -and $secondaryProfile.username -eq $secondaryUsername) `
        "El token secundario no está aislado al perfil secundario."
    Complete-Test "HTTP 201; la segunda identidad tiene JWT propio y /me solo devolvió su propio perfil."

    $testIds.Service = "it-svc-$($testIds.RunId)"
    $testIds.ServiceImage = "it-simg-$($testIds.RunId)"
    $testIds.Review = "it-rev-$($testIds.RunId)"
    $serviceTitle = "Servicio integración $($testIds.RunId)"
    $serviceBody = @{
        id = $testIds.Service
        categoryId = [int]$category.id
        title = $serviceTitle
        description = "Registro temporal de prueba automatizada."
        priceMin = 10.00
        priceMax = 20.00
        location = "Prueba Kuska"
        latitude = $null
        longitude = $null
        coverageRadiusMeters = 1000
        images = @()
    }

    $currentTest = "Servicio, imagen, reseña y favorito: escritura y lectura"
    $serviceResponse = Invoke-Api -Method "POST" -Path "/api/servicios" -Body $serviceBody
    Assert-HttpStatus $serviceResponse 201 "Crear servicio de prueba"
    $resourcesCreated.Service = $true
    Assert-True ($serviceResponse.Body.id -eq $testIds.Service `
        -and $serviceResponse.Body.ownerId -eq $primaryUserId `
        -and $serviceResponse.Body.title -eq $serviceTitle) `
        "La respuesta del servicio no contiene el ID, propietario o título esperado."

    $serviceImageResponse = Invoke-Api -Method "POST" `
        -Path "/api/servicios/$($testIds.Service)/imagenes" `
        -Body @{ id = $testIds.ServiceImage; url = "https://example.invalid/$($testIds.ServiceImage).jpg"; order = 0 }
    Assert-HttpStatus $serviceImageResponse 201 "Crear imagen remota de servicio"
    $resourcesCreated.ServiceImage = $true
    Assert-True ($serviceImageResponse.Body.id -eq $testIds.ServiceImage `
        -and $serviceImageResponse.Body.url -eq "https://example.invalid/$($testIds.ServiceImage).jpg") `
        "La respuesta de imagen no coincide con el registro de prueba."

    $reviewResponse = Invoke-Api -Method "PUT" `
        -Path "/api/servicios/$($testIds.Service)/resenas" `
        -Body @{ id = $testIds.Review; rating = 5; comment = "Reseña de integración $($testIds.RunId)" }
    Assert-HttpStatus $reviewResponse 200 "Crear reseña"
    $resourcesCreated.Review = $true
    Assert-True ($reviewResponse.Body.id -eq $testIds.Review `
        -and $reviewResponse.Body.userId -eq $primaryUserId `
        -and $reviewResponse.Body.rating -eq 5) `
        "La reseña no quedó asociada a la identidad autenticada."

    $favoriteResponse = Invoke-Api -Method "POST" `
        -Path "/api/servicios/$($testIds.Service)/favorito"
    Assert-HttpStatus $favoriteResponse 204 "Guardar favorito"
    $resourcesCreated.Favorite = $true
    $serviceReadback = Invoke-CheckedApi -Method "GET" -Path "/api/servicios/$($testIds.Service)"
    Assert-True ($serviceReadback.id -eq $testIds.Service `
        -and $serviceReadback.images.Count -eq 1 `
        -and $serviceReadback.images[0].id -eq $testIds.ServiceImage `
        -and $serviceReadback.reviews.Count -eq 1 `
        -and $serviceReadback.reviews[0].id -eq $testIds.Review) `
        "La lectura del servicio no confirmó imagen y reseña."
    $favorites = @(Invoke-CheckedApi -Method "GET" -Path "/api/usuarios/me/favoritos")
    Assert-True (@($favorites | Where-Object { $_.id -eq $testIds.Service }).Count -eq 1) `
        "El favorito no aparece exactamente una vez en la lista."
    Complete-Test "HTTP y campos de respuesta validados; servicio, imagen, reseña y favorito se leyeron desde la API."

    $currentTest = "Aislamiento: usuario secundario no modifica recursos ajenos"
    $foreignServiceBody = $serviceBody.Clone()
    $foreignServiceBody.title = "Intento ajeno $($testIds.RunId)"
    $foreignUpdate = Invoke-Api -Method "PUT" -Path "/api/servicios/$($testIds.Service)" `
        -AccessToken $secondaryToken -Body $foreignServiceBody
    Assert-HttpStatus $foreignUpdate 403 "Actualización de servicio de otro usuario"
    $foreignDelete = Invoke-Api -Method "DELETE" `
        -Path "/api/servicios/$($testIds.Service)" -AccessToken $secondaryToken
    Assert-HttpStatus $foreignDelete 403 "Borrado de servicio de otro usuario"
    $afterForeignAttempt = Invoke-CheckedApi -Method "GET" -Path "/api/servicios/$($testIds.Service)"
    Assert-True ($afterForeignAttempt.title -eq $serviceTitle `
        -and $afterForeignAttempt.ownerId -eq $primaryUserId) `
        "El intento secundario alteró el contenido o propietario del servicio."
    Complete-Test "El token secundario recibió HTTP 403 para PUT y DELETE; el recurso primario permaneció intacto."

    $testIds.Post = "it-post-$($testIds.RunId)"
    $testIds.PostImage = "it-pimg-$($testIds.RunId)"
    $testIds.Reply = "it-reply-$($testIds.RunId)"
    $testIds.Emergency = $null
    $postBody = @{
        id = $testIds.Post
        typeId = [int]$emergencyType.id
        title = "Emergencia integración $($testIds.RunId)"
        description = "Publicación temporal de prueba automatizada."
        location = "Prueba Kuska"
        latitude = $null
        longitude = $null
        approximateRadiusMeters = 1000
        images = @()
    }

    $currentTest = "Publicación, imagen, respuesta y emergencia: escritura y lectura"
    $postResponse = Invoke-Api -Method "POST" -Path "/api/publicaciones" -Body $postBody
    Assert-HttpStatus $postResponse 201 "Crear publicación de emergencia"
    $resourcesCreated.Post = $true
    Assert-True ($postResponse.Body.id -eq $testIds.Post `
        -and $postResponse.Body.ownerId -eq $primaryUserId) `
        "La publicación no pertenece a la identidad de prueba."
    if ($null -ne $postResponse.Body.emergency) {
        $testIds.Emergency = [string]$postResponse.Body.emergency.id
        $resourcesCreated.Emergency = $true
    } else {
        $testIds.Emergency = "it-emg-$($testIds.RunId)"
    }
    $postImageResponse = Invoke-Api -Method "POST" `
        -Path "/api/publicaciones/$($testIds.Post)/imagenes" `
        -Body @{ id = $testIds.PostImage; url = "https://example.invalid/$($testIds.PostImage).jpg"; order = 0 }
    Assert-HttpStatus $postImageResponse 201 "Crear imagen remota de publicación"
    $resourcesCreated.PostImage = $true
    Assert-True ($postImageResponse.Body.id -eq $testIds.PostImage) `
        "La API devolvió un identificador de imagen inesperado."
    $replyResponse = Invoke-Api -Method "POST" `
        -Path "/api/publicaciones/$($testIds.Post)/respuestas" `
        -Body @{ id = $testIds.Reply; message = "Respuesta de integración $($testIds.RunId)" }
    Assert-HttpStatus $replyResponse 201 "Crear respuesta"
    $resourcesCreated.Reply = $true
    Assert-True ($replyResponse.Body.id -eq $testIds.Reply `
        -and $replyResponse.Body.userId -eq $primaryUserId) `
        "La respuesta no pertenece al usuario de prueba."
    $emergencyResponse = Invoke-Api -Method "POST" -Path "/api/emergencias" -Body @{
        id = $testIds.Emergency
        postId = $testIds.Post
        status = "reportada"
        priority = "media"
        followUp = "Seguimiento de prueba $($testIds.RunId)"
    }
    Assert-HttpStatus $emergencyResponse 201 "Crear reporte de emergencia"
    $resourcesCreated.Emergency = $true
    Assert-True ($emergencyResponse.Body.id -eq $testIds.Emergency `
        -and $emergencyResponse.Body.postId -eq $testIds.Post `
        -and $emergencyResponse.Body.status -eq "reportada") `
        "La emergencia no devolvió los datos esperados."
    $postReadback = Invoke-CheckedApi -Method "GET" -Path "/api/publicaciones/$($testIds.Post)"
    Assert-True ($postReadback.id -eq $testIds.Post `
        -and $postReadback.images.Count -eq 1 `
        -and $postReadback.images[0].id -eq $testIds.PostImage `
        -and $postReadback.replies.Count -eq 1 `
        -and $postReadback.replies[0].id -eq $testIds.Reply `
        -and $postReadback.emergency.id -eq $testIds.Emergency) `
        "La lectura no confirmó publicación, imagen, respuesta y emergencia."
    Complete-Test "HTTP 201 y lectura posterior verificaron publicación, imagen, respuesta y emergencia."

    $currentTest = "Sincronización repetida por ID de recurso sin duplicación"
    $syncRequest = @(@{
        operationId = "it-op-$($testIds.RunId)"
        entity = "Servicios"
        operation = "crear"
        entityId = $testIds.Service
        payload = $serviceBody
    })
    $syncFirst = @(Invoke-CheckedApi -Method "POST" -Path "/api/sync/operations" -Body $syncRequest)
    $syncAgain = @(Invoke-CheckedApi -Method "POST" -Path "/api/sync/operations" -Body $syncRequest)
    Assert-True (@($syncFirst).Count -eq 1 -and @($syncAgain).Count -eq 1 `
        -and $syncFirst[0].operationId -eq $syncRequest[0].operationId `
        -and $syncAgain[0].operationId -eq $syncRequest[0].operationId `
        -and $syncFirst[0].synchronizedOperation -and $syncAgain[0].synchronizedOperation) `
        "La API no confirmó correctamente las dos solicitudes de sincronización."
    $matchingServices = @(Invoke-CheckedApi -Method "GET" -Path "/api/servicios" |
        Where-Object { $_.id -eq $testIds.Service })
    Assert-True ($matchingServices.Count -eq 1) `
        "Repetir la sincronización creó más de un recurso con el mismo ID."
    Complete-Test "Dos envíos de sync con igual ID de recurso fueron aceptados y la lista contiene un único servicio. No implica idempotencia persistente de operationId."

    $currentTest = "Validación de entrada inválida con respuesta HTTP 400"
    $invalidInput = Invoke-Api -Method "POST" -Path "/api/servicios" -Body @{
        id = ""
        categoryId = [int]$category.id
        title = ""
        description = ""
        images = @()
    }
    Assert-HttpStatus $invalidInput 400 "Servicio con campos inválidos"
    Assert-True ($invalidInput.Body.error -in @("VALIDATION_ERROR", "BAD_REQUEST")) `
        "La respuesta de validación no contiene un código de error esperado."
    Complete-Test "El payload incompleto fue rechazado con HTTP 400 y respuesta de error."

    $currentTest = "Logout: contrato HTTP; no se prueba ni afirma revocación del JWT"
    $logout = Invoke-Api -Method "POST" -Path "/api/auth/logout"
    Assert-HttpStatus $logout 204 "Logout"
    $afterLogout = Invoke-Api -Method "GET" -Path "/api/usuarios/me"
    Assert-HttpStatus $afterLogout 200 "Perfil tras logout stateless"
    Assert-True ($afterLogout.Body.id -eq $primaryUserId) `
        "Se esperaba que el JWT siguiera siendo aceptado: el servidor no implementa revocación."
    Complete-Test "POST logout respondió 204. El JWT siguió válido, confirmando que el endpoint no implementa revocación."

} catch {
    $scriptFailed = $true
    $failureLine = $_.InvocationInfo.ScriptLineNumber
    if ($failureLine -le 0) { $failureLine = $MyInvocation.ScriptLineNumber }
    $failureDetail = "Etapa '$currentTest', línea $failureLine`: $($_.Exception.Message)"
    foreach ($secret in @(
        $sqlPassword,
        $primaryTestPassword,
        $secondaryTestPassword,
        $primaryToken,
        $secondaryToken,
        $envJwtSecret
    ) | Where-Object { -not [string]::IsNullOrEmpty($_) }) {
        $failureDetail = $failureDetail.Replace($secret, "[REDACTED]")
    }
    Add-TestResult -Name $currentTest -Status "FAIL" -Detail $failureDetail
} finally {
    $currentTest = "Limpieza lógica de recursos de contenido creados"
    if ($primaryToken -and $javaProcess -and -not $javaProcess.HasExited) {
        Remove-CreatedResource -WasCreated $resourcesCreated.Favorite `
            -Path "/api/servicios/$($testIds.Service)/favorito" -Label "favorito"
        Remove-CreatedResource -WasCreated $resourcesCreated.Review `
            -Path "/api/resenas-servicio/$($testIds.Review)" -Label "reseña"
        Remove-CreatedResource -WasCreated $resourcesCreated.ServiceImage `
            -Path "/api/imagenes-servicio/$($testIds.ServiceImage)" -Label "imagen de servicio"
        Remove-CreatedResource -WasCreated $resourcesCreated.Service `
            -Path "/api/servicios/$($testIds.Service)" -Label "servicio"
        Remove-CreatedResource -WasCreated $resourcesCreated.PostImage `
            -Path "/api/imagenes-publicacion/$($testIds.PostImage)" -Label "imagen de publicación"
        Remove-CreatedResource -WasCreated $resourcesCreated.Reply `
            -Path "/api/respuestas-publicacion/$($testIds.Reply)" -Label "respuesta"
        Remove-CreatedResource -WasCreated $resourcesCreated.Emergency `
            -Path "/api/emergencias/$($testIds.Emergency)" -Label "emergencia"
        Remove-CreatedResource -WasCreated $resourcesCreated.Post `
            -Path "/api/publicaciones/$($testIds.Post)" -Label "publicación"
    } else {
        foreach ($resource in @(
            @{ Flag = "Favorite"; Id = $testIds.Service; Label = "favorito" },
            @{ Flag = "Review"; Id = $testIds.Review; Label = "reseña" },
            @{ Flag = "ServiceImage"; Id = $testIds.ServiceImage; Label = "imagen de servicio" },
            @{ Flag = "Service"; Id = $testIds.Service; Label = "servicio" },
            @{ Flag = "PostImage"; Id = $testIds.PostImage; Label = "imagen de publicación" },
            @{ Flag = "Reply"; Id = $testIds.Reply; Label = "respuesta" },
            @{ Flag = "Emergency"; Id = $testIds.Emergency; Label = "emergencia" },
            @{ Flag = "Post"; Id = $testIds.Post; Label = "publicación" }
        )) {
            if ($resourcesCreated[$resource.Flag]) {
                $pendingCleanup.Add("$($resource.Label) (ID: $($resource.Id); API inaccesible para limpiar)")
            }
        }
    }

    if ($pendingCleanup.Count -eq 0) {
        Add-TestResult -Name $currentTest -Status "PASS" `
            -Detail "No quedan recursos de contenido creados pendientes de limpieza."
    } else {
        $scriptFailed = $true
        Add-TestResult -Name $currentTest -Status "FAIL" `
            -Detail "Recursos pendientes: $($pendingCleanup -join '; ')."
    }

    $currentTest = "Detención y confirmación de cierre del proceso Java propio"
    if ($javaProcess -and $javaProcess.Id -gt 0) {
        try {
            if (-not $javaProcess.HasExited) {
                $javaProcess.Kill()
            }
            if (-not $javaProcess.WaitForExit(15000)) {
                throw "El proceso Java propio PID $($javaProcess.Id) sigue activo tras solicitar su detención."
            }
            Read-JavaOutput -WaitForPendingRead
            Complete-Test "El proceso Java iniciado por este script (PID $($javaProcess.Id)) terminó; no se señaló ni detuvo ningún proceso ajeno."
        } catch {
            $scriptFailed = $true
            Add-TestResult -Name $currentTest -Status "FAIL" -Detail $_.Exception.Message
        }
    } else {
        Complete-Test "No se inició un proceso Java, por lo que no quedó proceso propio que detener."
    }

    if ($sqlConnection) {
        try { $sqlConnection.Dispose() } catch { }
    }
    if ($httpClient) {
        $httpClient.Dispose()
    }
    if ($rng) {
        $rng.Dispose()
    }
    $sqlPassword = $null
    $primaryTestPassword = $null
    $secondaryTestPassword = $null
    $primaryToken = $null
    $secondaryToken = $null
    $envJwtSecret = $null
    if ($javaProcess) {
        $javaProcess.Dispose()
    }

    $currentProcessEnvironment = [System.Environment]::GetEnvironmentVariables("Process")
    $environmentChanges = [System.Collections.Generic.List[string]]::new()
    foreach ($name in $parentEnvironmentSnapshot.Keys) {
        if (-not $currentProcessEnvironment.Contains($name) `
                -or -not [string]::Equals(
                    $parentEnvironmentSnapshot[$name],
                    [string]$currentProcessEnvironment[$name],
                    [System.StringComparison]::Ordinal
                )) {
            $environmentChanges.Add($name)
        }
    }
    foreach ($name in $currentProcessEnvironment.Keys) {
        if (-not $parentEnvironmentSnapshot.ContainsKey([string]$name)) {
            $environmentChanges.Add([string]$name)
        }
    }
    $currentTest = "Entorno del PowerShell padre sin modificaciones"
    if ($environmentChanges.Count -eq 0) {
        Complete-Test "El entorno del proceso PowerShell coincide con la instantánea inicial; las variables de conexión de Spring se asignaron en ProcessStartInfo del Java hijo."
    } else {
        $scriptFailed = $true
        Add-TestResult -Name $currentTest -Status "FAIL" `
            -Detail "Cambios detectados en variables del proceso PowerShell: $($environmentChanges -join ', ')."
    }
}

foreach ($testName in $plannedTests) {
    if (-not ($testResults | Where-Object { $_.Name -eq $testName })) {
        Add-TestResult -Name $testName -Status "SKIP" `
            -Detail "Omitida porque una etapa anterior falló o impidió ejecutarla."
    }
}

$passedCount = @($testResults | Where-Object { $_.Status -eq "PASS" }).Count
$failedCount = @($testResults | Where-Object { $_.Status -eq "FAIL" }).Count
$skippedCount = @($testResults | Where-Object { $_.Status -eq "SKIP" }).Count
Write-Host ""
Write-Host "Resumen: aprobadas=$passedCount; fallidas=$failedCount; omitidas=$skippedCount."
if ($primaryUserCreated) {
    Write-Host "Cuenta sintética primaria conservada: $($testIds.Username)."
}
if ($secondaryUserCreated) {
    Write-Host "Cuenta sintética secundaria conservada: $secondaryUsername."
}
if ($pendingCleanup.Count -gt 0) {
    Write-Host "Recursos de contenido pendientes: $($pendingCleanup -join '; ')." -ForegroundColor Red
}
Write-Host "Logout es stateless; este script no atribuye revocación al endpoint."

if ($scriptFailed -or $failedCount -gt 0) {
    exit 1
}
