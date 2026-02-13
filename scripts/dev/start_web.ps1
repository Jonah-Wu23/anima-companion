param(
  [int]$Port = 3000,
  [string]$ApiBaseUrl = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$webDir = Join-Path $repoRoot "web"

if (-not (Test-Path $webDir)) {
  throw "web 目录不存在: $webDir"
}

$listeningConn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($null -ne $listeningConn) {
  $ownerProcess = Get-Process -Id $listeningConn.OwningProcess -ErrorAction SilentlyContinue
  $ownerText = if ($null -eq $ownerProcess) {
    "PID=$($listeningConn.OwningProcess)"
  } else {
    "PID=$($ownerProcess.Id), Name=$($ownerProcess.ProcessName)"
  }
  throw @"
端口 $Port 已被占用（$ownerText）。
可选处理：
1) 结束占用进程：Stop-Process -Id <PID>
2) 改用其他端口：pwsh .\scripts\dev\start_web.ps1 -Port 3001
"@
}

Set-Location $webDir

if ($ApiBaseUrl -and $ApiBaseUrl.Trim()) {
  $env:NEXT_PUBLIC_API_BASE_URL = $ApiBaseUrl.Trim()
  Write-Host "[web] 使用 NEXT_PUBLIC_API_BASE_URL=$($env:NEXT_PUBLIC_API_BASE_URL)"
}

if (-not (Test-Path "node_modules")) {
  Write-Host "[web] 安装依赖..."
  npm install
}

Write-Host "[web] 启动 Next.js 开发服务 (port=$Port)..."
npx next dev -p $Port
