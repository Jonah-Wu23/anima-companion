Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[dev] 推荐先启动 GPT-SoVITS API:"
Write-Host "       pwsh ./scripts/dev/start_gpt_sovits_api.ps1"
Write-Host "[dev] 然后启动服务端:"
Write-Host "       cd server"
Write-Host "       python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
