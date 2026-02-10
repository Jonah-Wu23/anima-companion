Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$personaCardPath = Join-Path $repoRoot "Phainon_actor_card.json"
$configsRoot = Join-Path $repoRoot "configs"
$canParseYaml = $null -ne (Get-Command ConvertFrom-Yaml -ErrorAction SilentlyContinue)

if (-not $canParseYaml) {
  Write-Warning "[validate] 当前环境缺少 ConvertFrom-Yaml，YAML 仅做可读性与非空检查。"
}

Write-Host "[validate] 校验人物卡 JSON..."
Get-Content -Raw $personaCardPath | ConvertFrom-Json > $null

Write-Host "[validate] 校验配置 YAML..."
$yamlFiles = Get-ChildItem -Path $configsRoot -Recurse -File |
  Where-Object { $_.Extension -in @(".yaml", ".yml") }

foreach ($yamlFile in $yamlFiles) {
  Write-Host ("[validate] -> {0}" -f $yamlFile.FullName)
  $rawContent = Get-Content -Raw $yamlFile.FullName
  if ([string]::IsNullOrWhiteSpace($rawContent)) {
    throw "YAML 文件为空: $($yamlFile.FullName)"
  }

  if ($canParseYaml) {
    $rawContent | ConvertFrom-Yaml > $null
  }
}

Write-Host "[validate] 配置校验通过。"
