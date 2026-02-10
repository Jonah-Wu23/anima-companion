param(
  [switch]$InstallDependencies,
  [switch]$SkipOnInstallFailure
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$rootNodeModules = Join-Path $repoRoot "node_modules"
$webDir = Join-Path $repoRoot "web"
$webNodeModules = Join-Path $webDir "node_modules"
$rootPackageJson = Join-Path $repoRoot "package.json"

if (-not (Test-Path $webDir)) {
  throw "web 目录不存在: $webDir"
}

if (-not (Test-Path $rootPackageJson)) {
  Write-Host "[typecheck:web] 未找到根目录 package.json，跳过 web typecheck。"
  exit 0
}

try {
  $rootPackage = Get-Content -Raw $rootPackageJson | ConvertFrom-Json
  if (-not $rootPackage.scripts.'typecheck:web') {
    Write-Host "[typecheck:web] 未定义 npm script(typecheck:web)，跳过。"
    exit 0
  }
}
catch {
  Write-Warning "[typecheck:web] 读取 package.json 失败，跳过 web typecheck。"
  exit 0
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "[typecheck:web] 未检测到 npm，跳过 web typecheck。"
  exit 0
}

Push-Location $repoRoot
try {
  $dependenciesInstalled = (Test-Path $webNodeModules) -or (Test-Path $rootNodeModules)

  if ($InstallDependencies -and -not $dependenciesInstalled) {
    Write-Host "[typecheck:web] 安装 web 依赖（npm install）..."
    npm install
    if ($LASTEXITCODE -ne 0) {
      if ($SkipOnInstallFailure) {
        Write-Warning "[typecheck:web] npm install 失败，按可选策略跳过 typecheck。"
        exit 0
      }

      throw "npm install 失败，退出码: $LASTEXITCODE"
    }

    $dependenciesInstalled = (Test-Path $webNodeModules) -or (Test-Path $rootNodeModules)
  }

  if (-not $dependenciesInstalled) {
    Write-Host "[typecheck:web] 未安装 web 依赖（web/node_modules 与 node_modules 均不存在），跳过。"
    exit 0
  }

  Write-Host "[typecheck:web] 运行类型检查..."
  npm run typecheck:web
  if ($LASTEXITCODE -ne 0) {
    throw "web typecheck 失败，退出码: $LASTEXITCODE"
  }

  Write-Host "[typecheck:web] 检查通过。"
}
finally {
  Pop-Location
}
