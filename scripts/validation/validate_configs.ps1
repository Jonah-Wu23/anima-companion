Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[validate] 校验人物卡 JSON..."
Get-Content -Raw ".\\Phainon_actor_card.json" | ConvertFrom-Json > $null

Write-Host "[validate] 基础校验通过。"
