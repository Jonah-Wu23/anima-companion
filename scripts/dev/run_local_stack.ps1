Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

Write-Host "[dev] 启动顺序（Web MVP）:"
Write-Host "1) 启动 SenseVoice ASR（需暴露 POST /api/v1/asr，默认 127.0.0.1:50000）"
Write-Host "   Test-NetConnection -ComputerName 127.0.0.1 -Port 50000 | Select-Object TcpTestSucceeded"
Write-Host ("2) pwsh `"{0}\scripts\dev\start_gpt_sovits_api.ps1`"" -f $repoRoot)
Write-Host ("3) （可选）pwsh `"{0}\scripts\dev\set_gpt_sovits_weights.ps1`"" -f $repoRoot)
Write-Host ("4) pwsh `"{0}\scripts\dev\start_server.ps1`"" -f $repoRoot)
Write-Host ("5) pwsh `"{0}\scripts\dev\start_web.ps1`"" -f $repoRoot)
Write-Host "[dev] 建议就绪检查："
Write-Host "   Invoke-WebRequest http://127.0.0.1:8000/healthz | Select-Object -ExpandProperty Content"
Write-Host "[dev] 文档："
Write-Host ("   本地启动顺序 -> {0}\docs\runbooks\local\web_mvp_local_startup.md" -f $repoRoot)
Write-Host ("   Smoke 清单    -> {0}\docs\runbooks\release\smoke_checklist.md" -f $repoRoot)
