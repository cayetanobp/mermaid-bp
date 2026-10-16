$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$lock = Get-Content -LiteralPath (Join-Path $root 'desktop-app/package-lock.json') -Raw | ConvertFrom-Json -AsHashtable
$cliVersion = $lock.packages['node_modules/@tauri-apps/cli'].version
if (-not $cliVersion) { throw 'No se encontró @tauri-apps/cli en el lockfile de escritorio.' }

docker info --format '{{.OSType}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker no está disponible.' }

Push-Location $root
try {
  npm --prefix desktop-app run build:frontend
  if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación del frontend de escritorio.' }

  docker build --quiet -f docker/license-audit.Dockerfile --build-arg "TAURI_CLI_VERSION=$cliVersion" -t mermaid-bp:license-audit .
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la imagen de auditoría.' }

  $containerScript = @'
set -eu
node /work/scripts/check-rust-third-party-notices.mjs
cargo xwin build --locked --release --target x86_64-pc-windows-msvc --features tauri/custom-protocol
node /opt/tauri/node_modules/@tauri-apps/cli/tauri.js bundle --bundles nsis --target x86_64-pc-windows-msvc --ci --no-sign
installer="$(find /work/desktop-app/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis -maxdepth 1 -name '*-setup.exe' -print -quit)"
test -n "$installer"
mkdir -p /tmp/mermaid-bp-nsis
7z x -y -o/tmp/mermaid-bp-nsis "$installer" >/dev/null
cmp /tmp/mermaid-bp-nsis/LICENSE /work/LICENSE
cmp /tmp/mermaid-bp-nsis/NOTICE.md /work/NOTICE.md
cmp /tmp/mermaid-bp-nsis/THIRD_PARTY_NOTICES.md /work/desktop-app/dist/THIRD_PARTY_NOTICES.md
cmp /tmp/mermaid-bp-nsis/THIRD_PARTY_RUST_NOTICES.md /work/THIRD_PARTY_RUST_NOTICES.md
test -s /tmp/mermaid-bp-nsis/mermaid-bp-desktop.exe
echo "NSIS y cuatro archivos legales verificados: $installer"
'@
  docker run --rm --mount "type=bind,source=$root,target=/work" --mount 'type=volume,source=mermaid-bp-cargo-cache,target=/usr/local/cargo/registry' --mount 'type=volume,source=mermaid-bp-xwin-cache,target=/xwin-cache' -e XWIN_CACHE_DIR=/xwin-cache -w /work/desktop-app/src-tauri mermaid-bp:license-audit /bin/sh -ec $containerScript
  if ($LASTEXITCODE -ne 0) { throw 'Falló la auditoría Docker del instalador.' }
} finally {
  Pop-Location
}
