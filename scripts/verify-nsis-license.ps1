param(
  [Parameter(Mandatory = $true)][string]$Installer
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$installerPath = [System.IO.Path]::GetFullPath($Installer)
$sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
if (-not $sevenZip) { $sevenZip = Get-Command 'C:\Program Files\7-Zip\7z.exe' -ErrorAction SilentlyContinue }
if (-not $sevenZip) { throw '7-Zip no está disponible para extraer el instalador NSIS.' }

$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$extracted = [System.IO.Path]::GetFullPath((Join-Path $temporaryRoot ('mermaid-bp-nsis-' + [guid]::NewGuid().ToString('N'))))
if (-not $extracted.StartsWith(($temporaryRoot.TrimEnd('\') + '\'), [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Directorio temporal fuera de la ubicación prevista.'
}
New-Item -ItemType Directory -Path $extracted | Out-Null
try {
  & $sevenZip.Source x '-y' "-o$extracted" $installerPath | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "7-Zip no pudo extraer el instalador: $installerPath" }
  $expected = @{
    'LICENSE' = (Join-Path $root 'LICENSE')
    'NOTICE.md' = (Join-Path $root 'NOTICE.md')
    'THIRD_PARTY_NOTICES.md' = (Join-Path $root 'desktop-app/dist/THIRD_PARTY_NOTICES.md')
    'THIRD_PARTY_RUST_NOTICES.md' = (Join-Path $root 'THIRD_PARTY_RUST_NOTICES.md')
  }
  foreach ($name in $expected.Keys) {
    $included = Join-Path $extracted $name
    if (-not (Test-Path -LiteralPath $included -PathType Leaf)) { throw "Falta $name en NSIS." }
    $foundHash = (Get-FileHash -LiteralPath $included -Algorithm SHA256).Hash
    $expectedHash = (Get-FileHash -LiteralPath $expected[$name] -Algorithm SHA256).Hash
    if ($foundHash -ne $expectedHash) { throw "$name difiere del archivo fuente." }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $extracted 'mermaid-bp-desktop.exe') -PathType Leaf)) {
    throw 'Falta el ejecutable de escritorio en NSIS.'
  }
  Write-Output 'NSIS contiene el ejecutable y los cuatro archivos legales correctos.'
} finally {
  Remove-Item -LiteralPath $extracted -Recurse -Force
}
