Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[dev] 启动顺序（Web MVP）:"
Write-Host "1) pwsh ./scripts/dev/start_gpt_sovits_api.ps1"
Write-Host "2) cd server"
Write-Host "   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
Write-Host "3) pwsh ./scripts/dev/start_web.ps1"
