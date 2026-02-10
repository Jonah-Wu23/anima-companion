param(
  [string]$BindHost = "0.0.0.0",
  [int]$Port = 8000,
  [bool]$Reload = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$serverDir = Join-Path $repoRoot "server"

if (-not (Test-Path $serverDir)) {
  throw "server 目录不存在: $serverDir"
}

Push-Location $serverDir
try {
  $reloadArg = @()
  if ($Reload) {
    $reloadArg += "--reload"
  }

  Write-Host "[server] 启动 FastAPI: $BindHost`:$Port"
  python -m uvicorn app.main:app --host $BindHost --port $Port @reloadArg
}
finally {
  Pop-Location
}
