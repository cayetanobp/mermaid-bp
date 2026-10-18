[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$Image = "mermaid-bp-linux-builder:local",
  [double]$MinimumFreeGB = 25,
  [switch]$CleanupUnused,
  [switch]$CleanupDockerVolumes
)
$ErrorActionPreference = "Stop"
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
. (Join-Path $PSScriptRoot 'build-cache.ps1')

if ($CleanupUnused) {
  Invoke-BuildCacheCleanup -RepositoryRoot $repo -DockerVolumes:$CleanupDockerVolumes -WhatIf:$WhatIfPreference
  return
}

$target = Join-Path $repo "desktop-app/src-tauri/target/linux-bundle/deb"
Invoke-BuildCachePreflight -RepositoryRoot $repo -TargetPath $target -MinimumFreeGB $MinimumFreeGB
docker info --format '{{.OSType}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker is unavailable; no build was started.' }
Register-BuildOutput -RepositoryRoot $repo -Path $target -Retention preserved -Purpose 'Linux Debian package; retain for review and distribution'
Ensure-BuildDockerVolume -RepositoryRoot $repo -Name 'mermaid-bp-cargo-target' -Purpose 'Linux Cargo target cache'
Ensure-BuildDockerVolume -RepositoryRoot $repo -Name 'mermaid-bp-cargo-registry' -Purpose 'Linux Cargo registry cache'
Ensure-BuildDockerVolume -RepositoryRoot $repo -Name 'mermaid-bp-cargo-git' -Purpose 'Linux Cargo Git cache'

docker build -f (Join-Path $repo "desktop-app/linux.Dockerfile") -t $Image $repo
if ($LASTEXITCODE -ne 0) { throw "Linux builder image failed with exit code $LASTEXITCODE" }
docker run --rm --mount "type=bind,source=$repo,target=/workspace" --mount "type=volume,source=mermaid-bp-cargo-target,target=/cargo-target" --mount "type=volume,source=mermaid-bp-cargo-registry,target=/root/.cargo/registry" --mount "type=volume,source=mermaid-bp-cargo-git,target=/root/.cargo/git" -e CARGO_TARGET_DIR=/cargo-target $Image
if ($LASTEXITCODE -ne 0) { throw "Linux Debian build failed with exit code $LASTEXITCODE" }
Write-Output "Debian package output: $target"
Write-Output "Use -CleanupUnused -WhatIf to review registered intermediates; add -CleanupDockerVolumes to remove task-owned unused Docker caches."
