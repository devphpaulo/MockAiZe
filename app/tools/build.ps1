$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$venv = Join-Path $root '.venv'
$python = Join-Path $venv 'Scripts\python.exe'
$temp = Join-Path $root '.build-tmp'
$dist = Join-Path $root 'dist'
$release = $null
$build = Join-Path $root 'build'

function Remove-GeneratedDirectory([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return }
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $rootPrefix = $root.TrimEnd('\') + '\'
  if (-not $resolved.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Recusa remover diretório fora do projeto: $resolved"
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $temp | Out-Null
$env:TEMP = $temp
$env:TMP = $temp
$env:PYINSTALLER_CONFIG_DIR = Join-Path $root '.pyinstaller-config'

Push-Location $root
try {
  if (-not (Test-Path -LiteralPath $python)) {
    & py -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw "Falha ao criar o ambiente virtual (código $LASTEXITCODE)." }
  }
  & $python -c "import PyInstaller; from importlib.metadata import version; print(version('pyinstaller'))" *> $null
  if ($LASTEXITCODE -ne 0) {
    & $python -m pip install 'PyInstaller==6.22.3'
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar PyInstaller (código $LASTEXITCODE)." }
  }
  $version = & $python -c "import pathlib,tomllib; print(tomllib.loads(pathlib.Path('pyproject.toml').read_text(encoding='utf-8'))['project']['version'])"
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao ler a versao do projeto.' }
  $release = Join-Path $dist ("MockAíZé-{0}.exe" -f $version.Trim())
  & (Join-Path $PSScriptRoot 'create-app-icon.ps1')
  & $python -m PyInstaller --noconfirm --clean --distpath $dist --workpath $build 'packaging\mockaize.spec'
  if ($LASTEXITCODE -ne 0) { throw "PyInstaller encerrou com código $LASTEXITCODE." }
  if (-not (Test-Path -LiteralPath $release -PathType Leaf)) { throw "Executável de release ausente: $release" }

  $legacyRelease = Join-Path $dist 'MockAíZé.exe'
  if (Test-Path -LiteralPath $legacyRelease -PathType Leaf) {
    Remove-Item -LiteralPath $legacyRelease -Force
  }
  Remove-GeneratedDirectory (Join-Path $dist 'MockAíZé')
  Remove-GeneratedDirectory $build
  Remove-GeneratedDirectory $temp
  foreach ($previousRelease in Get-ChildItem -LiteralPath $dist -Filter 'MockAíZé-*.exe' -File) {
    if ($previousRelease.FullName -eq $release) { continue }
    try { Remove-Item -LiteralPath $previousRelease.FullName -Force -ErrorAction Stop }
    catch { Write-Warning "Versão anterior em uso foi mantida: $($previousRelease.Name). Feche-a pela bandeja para usar a atualização." }
  }
  $unexpected = @(Get-ChildItem -Force -LiteralPath $dist | Where-Object { $_.PSIsContainer -or $_.Extension -ne '.exe' })
  if ($unexpected.Count -gt 0) { throw 'A pasta dist deve conter somente executáveis portáteis, sem arquivos de runtime separados.' }
  Write-Output "Build concluído: $release"
  Write-Output 'Cada release é um executável portátil independente.'

}
catch {
  Write-Error $_
  Write-Error 'Intermediários foram mantidos para diagnóstico.'
  exit 1
}
finally {
  Pop-Location
}
