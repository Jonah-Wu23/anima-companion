param(
  [string]$BaseUrl = "http://127.0.0.1:9880",
  [string]$GptWeights = "GPT_weights_v4/白厄3.3-e15.ckpt",
  [string]$SovitsWeights = "SoVITS_weights_v4/白厄3.3_e12_s18300_l32.pth"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-GptSovitsGet {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Value
  )
  $escaped = [System.Uri]::EscapeDataString($Value)
  $uri = "{0}/{1}?weights_path={2}" -f $BaseUrl.TrimEnd('/'), $Path.TrimStart('/'), $escaped
  Write-Host "[gpt-sovits] GET $uri"
  Invoke-RestMethod -Method Get -Uri $uri | Out-Null
}

if ([string]::IsNullOrWhiteSpace($GptWeights)) {
  throw "GptWeights 不能为空"
}
if ([string]::IsNullOrWhiteSpace($SovitsWeights)) {
  throw "SovitsWeights 不能为空"
}

Invoke-GptSovitsGet -Path "set_gpt_weights" -Value $GptWeights
Invoke-GptSovitsGet -Path "set_sovits_weights" -Value $SovitsWeights

Write-Host "[gpt-sovits] 模型切换完成"
