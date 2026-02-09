Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location "web"

if (-not (Test-Path "node_modules")) {
  Write-Host "[web] 安装依赖..."
  npm install
}

Write-Host "[web] 启动 Next.js 开发服务..."
npm run dev
