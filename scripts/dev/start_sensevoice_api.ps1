param(
  [string]$Root = "E:\AI\VTT\SenseVoice",
  [string]$Device = "cuda:0",
  [string]$BindHost = "127.0.0.1",
  [int]$Port = 50000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path $Root)) {
  throw "SenseVoice 目录不存在: $Root"
}

Write-Host "[SenseVoice] 启动 API 服务: $BindHost`:$Port (Device: $Device)"

$env:SENSEVOICE_DEVICE = $Device

Push-Location $Root
try {
  python -m uvicorn api:app --host $BindHost --port $Port
}
finally {
  Pop-Location
}
