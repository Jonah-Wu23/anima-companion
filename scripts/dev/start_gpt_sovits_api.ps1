param(
  [string]$Root = "E:\\AI\\GPT-SoVITS-v4-20250422fix",
  [string]$Bind = "127.0.0.1",
  [int]$Port = 9880,
  [string]$Config = "GPT_SoVITS/configs/tts_infer.yaml"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path $Root)) {
  throw "GPT-SoVITS 目录不存在: $Root"
}

$pythonExe = Join-Path $Root "runtime\\python.exe"
if (-not (Test-Path $pythonExe)) {
  throw "未找到运行时 Python: $pythonExe"
}

Set-Location $Root
$ffmpegBin = Join-Path $Root "runtime\\ffmpeg\\bin"
if (Test-Path $ffmpegBin) {
  $env:PATH = "$ffmpegBin;$env:PATH"
}

Write-Host "[gpt-sovits] 启动 API: $Bind`:$Port"
& $pythonExe "api_v2.py" -a $Bind -p $Port -c $Config
