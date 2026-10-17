Set-StrictMode -Version Latest

function Get-BuildCacheRepositoryId {
  param([Parameter(Mandatory)][string]$RepositoryRoot)
  $bytes = [Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($RepositoryRoot).ToLowerInvariant())
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $hex = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '') } finally { $sha.Dispose() }
  $hex.Substring(0, 16)
}

function Get-BuildCacheInventoryPath {
  param([Parameter(Mandatory)][string]$RepositoryRoot)
  $key = Get-BuildCacheRepositoryId $RepositoryRoot
  $base = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [IO.Path]::GetTempPath() }
  Join-Path $base "mermaid-bp/build-cache/$key/inventory.json"
}

function Get-BuildCacheInventory {
  param([Parameter(Mandatory)][string]$RepositoryRoot)
  $path = Get-BuildCacheInventoryPath $RepositoryRoot
  if (Test-Path -LiteralPath $path) {
    $inventory = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json -AsHashtable
  } else {
    $inventory = @{ schema = 1; repository = [IO.Path]::GetFullPath($RepositoryRoot); outputs = @(); volumes = @() }
  }
  $inventory
}

function Save-BuildCacheInventory {
  param([Parameter(Mandatory)][string]$RepositoryRoot, [Parameter(Mandatory)][hashtable]$Inventory)
  $path = Get-BuildCacheInventoryPath $RepositoryRoot
  New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
  $Inventory | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding utf8
  Write-Output "Build cache inventory: $path"
}

function Assert-BuildPathInRepository {
  param([Parameter(Mandatory)][string]$RepositoryRoot, [Parameter(Mandatory)][string]$Path)
  $root = [IO.Path]::GetFullPath($RepositoryRoot).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  $full = [IO.Path]::GetFullPath($Path)
  $prefix = $root + [IO.Path]::DirectorySeparatorChar
  if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing build-cache path outside repository: $full"
  }
  $cursor = $root
  $segments = @($full.Substring($prefix.Length) -split '[\\/]')
  foreach ($segment in $segments) {
    $cursor = Join-Path $cursor $segment
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing build-cache path through a reparse point: $cursor"
      }
    }
  }
  $full
}

function Register-BuildOutput {
  param(
    [Parameter(Mandatory)][string]$RepositoryRoot,
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][ValidateSet('regenerable', 'preserved')][string]$Retention,
    [Parameter(Mandatory)][string]$Purpose
  )
  $full = Assert-BuildPathInRepository $RepositoryRoot $Path
  $inventory = Get-BuildCacheInventory $RepositoryRoot
  $relative = $full.Substring([IO.Path]::GetFullPath($RepositoryRoot).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar).Length + 1)
  $inventory.outputs = @($inventory.outputs | Where-Object { $_.path -ne $full })
  $inventory.outputs += @{ path = $full; relativePath = $relative; retention = $Retention; purpose = $Purpose; lastRegisteredUtc = [DateTime]::UtcNow.ToString('o') }
  Save-BuildCacheInventory $RepositoryRoot $inventory
}

function Ensure-BuildDockerVolume {
  param([Parameter(Mandatory)][string]$RepositoryRoot, [Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][string]$Purpose)
  $repoId = Get-BuildCacheRepositoryId $RepositoryRoot
  docker volume inspect $Name *> $null
  $exists = $LASTEXITCODE -eq 0
  $owned = $false
  if (-not $exists) {
    docker volume create --label "com.mermaid-bp.build-cache=true" --label "com.mermaid-bp.repository=$repoId" $Name | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not create Docker volume $Name" }
    $owned = $true
  } else {
    $details = docker volume inspect $Name | ConvertFrom-Json -AsHashtable
    $owned = $details[0].Labels['com.mermaid-bp.build-cache'] -eq 'true' -and $details[0].Labels['com.mermaid-bp.repository'] -eq $repoId
  }
  $inventory = Get-BuildCacheInventory $RepositoryRoot
  $inventory.volumes = @($inventory.volumes | Where-Object { $_.name -ne $Name })
  $inventory.volumes += @{ name = $Name; purpose = $Purpose; ownership = $(if ($owned) { 'task-owned' } else { 'borrowed' }); repositoryId = $repoId; lastRegisteredUtc = [DateTime]::UtcNow.ToString('o') }
  Save-BuildCacheInventory $RepositoryRoot $inventory
}

function Invoke-BuildCachePreflight {
  param([Parameter(Mandatory)][string]$RepositoryRoot, [Parameter(Mandatory)][string]$TargetPath, [Parameter(Mandatory)][double]$MinimumFreeGB)
  $target = Assert-BuildPathInRepository $RepositoryRoot $TargetPath
  $driveRoot = [IO.Path]::GetPathRoot($target)
  $drive = Get-PSDrive -Name $driveRoot.TrimEnd(':/\') -ErrorAction Stop
  $freeGB = [Math]::Round($drive.Free / 1GB, 1)
  Write-Output ("Build preflight: target={0}; free={1} GB; required={2} GB" -f $target, $freeGB, $MinimumFreeGB)
  if ($freeGB -lt $MinimumFreeGB) { throw "Insufficient free disk space for build. Need at least $MinimumFreeGB GB, found $freeGB GB on $driveRoot." }
}

function Test-BuildPathHasDockerConsumer {
  param([Parameter(Mandatory)][string]$Path)
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $false }
  $containers = @(docker ps -q)
  if ($LASTEXITCODE -ne 0) { throw 'Could not check Docker bind-mount consumers; refusing cleanup.' }
  $candidate = [IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  foreach ($id in $containers) {
    $details = docker inspect $id | ConvertFrom-Json -AsHashtable
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect active Docker container $id; refusing cleanup." }
    foreach ($mount in $details[0].Mounts) {
      if ($mount.Type -ne 'bind') { continue }
      $sourceText = $mount.Source -replace '^/run/desktop/mnt/host/([A-Za-z])/', '$1:/' -replace '^/host_mnt/([A-Za-z])/', '$1:/'
      $sourceText = $sourceText.Replace('/', [IO.Path]::DirectorySeparatorChar)
      $source = [IO.Path]::GetFullPath($sourceText).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
      $separator = [IO.Path]::DirectorySeparatorChar
      if ($candidate.Equals($source, [StringComparison]::OrdinalIgnoreCase) -or
          $candidate.StartsWith($source + $separator, [StringComparison]::OrdinalIgnoreCase) -or
          $source.StartsWith($candidate + $separator, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
  }
  $false
}

function Invoke-BuildCacheCleanup {
  [CmdletBinding(SupportsShouldProcess)]
  param([Parameter(Mandatory)][string]$RepositoryRoot, [switch]$DockerVolumes)
  $inventory = Get-BuildCacheInventory $RepositoryRoot
  $activeBuild = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^(cargo|rustc|node|npm|docker)$' })
  foreach ($entry in @($inventory.outputs | Where-Object { $_.retention -eq 'regenerable' })) {
    $path = Assert-BuildPathInRepository $RepositoryRoot $entry.path
    if (-not $WhatIfPreference) {
      if ($activeBuild.Count) { throw "Refusing cleanup while build-related processes are active: $($activeBuild.ProcessName -join ', ')" }
      if (Test-BuildPathHasDockerConsumer $path) { throw "Refusing cleanup while a running Docker container bind-mounts $path" }
    }
    if (Test-Path -LiteralPath $path) {
      if ($PSCmdlet.ShouldProcess($path, 'Remove inventoried regenerable build output')) { Remove-Item -LiteralPath $path -Recurse -Force }
    }
  }
  if ($DockerVolumes) {
    foreach ($volume in @($inventory.volumes | Where-Object { $_.ownership -eq 'task-owned' })) {
      if (-not $WhatIfPreference) {
        $consumers = @(docker ps -aq --filter "volume=$($volume.name)")
        if ($LASTEXITCODE -ne 0) { throw 'Could not check Docker volume consumers; refusing cleanup.' }
        if ($consumers.Count) { throw "Refusing to remove Docker volume $($volume.name); containers still reference it: $($consumers -join ', ')" }
      }
      if ($PSCmdlet.ShouldProcess("Docker volume $($volume.name)", 'Remove inventoried task-owned volume')) {
        docker volume rm $volume.name | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not remove Docker volume $($volume.name)" }
      }
    }
  }
}
