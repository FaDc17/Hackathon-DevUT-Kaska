param(
    [string]$BaseUrl = "https://kuska-api-fadc-akd8fkcrfpcwdgdj.eastus2-01.azurewebsites.net",
    [ValidateRange(1, 60)][int]$TimeoutSeconds = 20,
    [string]$OutputPath
)
$ErrorActionPreference = "Stop"
$base = [Uri]$BaseUrl
if ($base.Scheme -ne "https" -and -not ($base.Scheme -eq "http" -and $base.IsLoopback)) {
    throw "Usa HTTPS o un servidor local de loopback."
}
Add-Type -AssemblyName System.Net.Http
$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds($TimeoutSeconds)
$results = [System.Collections.Generic.List[object]]::new()
try {
    $dns = try { @([System.Net.Dns]::GetHostAddresses($base.DnsSafeHost) | ForEach-Object IPAddressToString) } catch { @() }
    $checks = @(
        @{ Path = "/actuator/health"; Token = $false },
        @{ Path = "/actuator/health"; Token = $true },
        @{ Path = "/api/catalogos/departamentos"; Token = $false },
        @{ Path = "/api/catalogos/distritos"; Token = $false },
        @{ Path = "/api/catalogos/categorias-servicio"; Token = $false },
        @{ Path = "/api/usuarios/me"; Token = $false },
        @{ Path = "/api/servicios"; Token = $false },
        @{ Path = "/actuator/env"; Token = $false },
        @{ Path = "/actuator/health/db"; Token = $false }
    )
    foreach ($check in $checks) {
        $watch = [Diagnostics.Stopwatch]::StartNew()
        $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $BaseUrl.TrimEnd('/') + $check.Path)
        if ($check.Token) { $request.Headers.TryAddWithoutValidation("Authorization", "Bearer invalid-verification-token") | Out-Null }
        $response = $null
        try {
            $response = $client.SendAsync($request).GetAwaiter().GetResult()
            $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            $json = try { $body | ConvertFrom-Json } catch { $null }
            $entry = [pscustomobject]@{
                path = $check.Path
                invalidBearer = $check.Token
                httpStatus = [int]$response.StatusCode
                elapsedMs = $watch.ElapsedMilliseconds
                contentType = [string]$response.Content.Headers.ContentType
                healthStatus = if ($check.Path -eq '/actuator/health' -and $json -and $json.status -is [string]) { [string]$json.status } else { $null }
                jsonKeys = @(if ($json -and $json -isnot [Array]) { $json.PSObject.Properties.Name })
                rowCount = if ($json -is [Array]) { $json.Count } else { $null }
                kuskaUnauthorizedBody = [bool]($json -and $json.error -eq 'UNAUTHORIZED' -and $json.status -eq 401)
                transportError = $false
            }
        } catch {
            $entry = [pscustomobject]@{path=$check.Path;invalidBearer=$check.Token;httpStatus=0;elapsedMs=$watch.ElapsedMilliseconds;transportError=$true}
        } finally {
            if ($response) { $response.Dispose() }
            $request.Dispose()
        }
        $results.Add($entry)
        Write-Output ($entry | ConvertTo-Json -Compress)
    }
    $report = [pscustomobject]@{
        checkedAtUtc = [DateTime]::UtcNow.ToString("o")
        baseUrl = $BaseUrl.TrimEnd('/')
        resolvedAddresses = $dns
        checks = $results.ToArray()
        readOnly = $true
    }
    if ($OutputPath) {
        $absolute = [IO.Path]::GetFullPath($OutputPath)
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($absolute)) | Out-Null
        [IO.File]::WriteAllText($absolute, ($report | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
    }
} finally { $client.Dispose() }
