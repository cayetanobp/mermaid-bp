param(
  [string]$Image = "mermaid-bp-linux-builder:local"
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$target = Join-Path $repo "desktop-app/src-tauri/target/linux-bundle/deb"
docker build -f (Join-Path $repo "desktop-app/linux.Dockerfile") -t $Image $repo
if ($LASTEXITCODE -ne 0) { throw "Linux builder image failed with exit code $LASTEXITCODE" }
docker run --rm --mount "type=bind,source=$repo,target=/workspace" --mount "type=volume,source=mermaid-bp-cargo-target,target=/cargo-target" --mount "type=volume,source=mermaid-bp-cargo-registry,target=/root/.cargo/registry" --mount "type=volume,source=mermaid-bp-cargo-git,target=/root/.cargo/git" -e CARGO_TARGET_DIR=/cargo-target $Image
if ($LASTEXITCODE -ne 0) { throw "Linux Debian build failed with exit code $LASTEXITCODE" }
Write-Output "Debian package output: $target"
