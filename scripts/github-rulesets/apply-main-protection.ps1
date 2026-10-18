[CmdletBinding()]
param(
    [ValidateSet('Plan', 'Apply', 'Verify')]
    [string]$Mode = 'Plan',

    [ValidateSet('core', 'plugins')]
    [string[]]$Repository = @('core', 'plugins')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryMap = @{
    core = @{
        FullName = 'cayetanobp/mermaid-bp'
        Payload = Join-Path $PSScriptRoot 'core-main.json'
    }
    plugins = @{
        FullName = 'cayetanobp/mermaid-bp-plugins'
        Payload = Join-Path $PSScriptRoot 'plugins-main.json'
    }
}

function Invoke-GhText {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $output = & gh @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "gh $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
    }
    return ($output -join [Environment]::NewLine)
}

function Invoke-GhJson {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $text = Invoke-GhText -Arguments $Arguments
    return ConvertFrom-Json -InputObject $text -AsHashtable -Depth 100
}

function Get-RuleByType {
    param(
        [Parameter(Mandatory)][object[]]$Rules,
        [Parameter(Mandatory)][string]$Type,
        [Parameter(Mandatory)][int]$RulesetId
    )

    return @($Rules | Where-Object { $_.type -eq $Type -and $_.ruleset_id -eq $RulesetId })
}

function Assert-EffectiveProtection {
    param(
        [Parameter(Mandatory)][string]$FullName,
        [Parameter(Mandatory)][object]$Payload,
        [Parameter(Mandatory)][int]$RulesetId
    )

    $detail = Invoke-GhJson -Arguments @('api', "repos/$FullName/rulesets/$RulesetId")
    if ($detail.enforcement -ne 'active') { throw "$FullName ruleset is not active." }
    if (@($detail.bypass_actors).Count -ne 0) { throw "$FullName ruleset has bypass actors." }
    if (@($detail.conditions.ref_name.include) -notcontains 'refs/heads/main') {
        throw "$FullName ruleset does not target refs/heads/main."
    }

    $effectiveRules = @(Invoke-GhJson -Arguments @('api', "repos/$FullName/rules/branches/main"))
    $statusRule = @(Get-RuleByType -Rules $effectiveRules -Type 'required_status_checks' -RulesetId $RulesetId)
    if ($statusRule.Count -ne 1) { throw "$FullName required status checks are not effective on main." }
    $expectedContexts = @($Payload.rules | Where-Object type -eq 'required_status_checks' |
        ForEach-Object { $_.parameters.required_status_checks.context } | Sort-Object -Unique)
    $actualContexts = @($statusRule[0].parameters.required_status_checks | ForEach-Object { $_.context } | Sort-Object -Unique)
    $contextDifference = @(Compare-Object -ReferenceObject $expectedContexts -DifferenceObject $actualContexts)
    if ($contextDifference.Count -ne 0) {
        throw "$FullName effective required check contexts differ from the reviewed payload."
    }
    if (@($statusRule[0].parameters.required_status_checks | Where-Object { $_.integration_id -ne 15368 }).Count -ne 0) {
        throw "$FullName has a required status check not pinned to GitHub Actions integration 15368."
    }
    if (-not $statusRule[0].parameters.strict_required_status_checks_policy) {
        throw "$FullName required status checks do not require the latest target branch."
    }

    $pullRequestRule = @(Get-RuleByType -Rules $effectiveRules -Type 'pull_request' -RulesetId $RulesetId)
    if ($pullRequestRule.Count -ne 1) { throw "$FullName pull request requirement is not effective on main." }
    if ($pullRequestRule[0].parameters.required_approving_review_count -ne 0) {
        throw "$FullName requires an approval before the owner can merge their own PR."
    }
    if (@($pullRequestRule[0].parameters.required_reviewers).Count -ne 0 -or
        $pullRequestRule[0].parameters.require_code_owner_review -or
        $pullRequestRule[0].parameters.require_last_push_approval) {
        throw "$FullName has a reviewer requirement that may prevent an owner from merging their own PR."
    }

    foreach ($requiredRule in @('deletion', 'non_fast_forward')) {
        if (@(Get-RuleByType -Rules $effectiveRules -Type $requiredRule -RulesetId $RulesetId).Count -ne 1) {
            throw "$FullName $requiredRule protection is not effective on main."
        }
    }

    return [pscustomobject]@{
        repository = $FullName
        visibility = (Invoke-GhText -Arguments @('api', "repos/$FullName", '--jq', '.visibility'))
        branch = 'main'
        enforcement = $detail.enforcement
        bypassActors = @($detail.bypass_actors).Count
        requiredChecks = $actualContexts
        requiredApprovals = $pullRequestRule[0].parameters.required_approving_review_count
        pullRequestRequired = $true
        latestBaseRequired = $statusRule[0].parameters.strict_required_status_checks_policy
        deletionBlocked = $true
        forcePushBlocked = $true
    }
}

foreach ($repositoryKey in $Repository) {
    $configuration = $repositoryMap[$repositoryKey]
    $fullName = $configuration.FullName
    $payload = Get-Content -LiteralPath $configuration.Payload -Raw | ConvertFrom-Json -AsHashtable -Depth 100

    if ($Mode -eq 'Plan') {
        [pscustomobject]@{
            repository = $fullName
            operation = 'Plan only; no GitHub settings changed'
            payload = $payload
        }
        continue
    }

    $rulesets = @(Invoke-GhJson -Arguments @('api', "repos/$fullName/rulesets?includes_parents=false"))
    $matches = @($rulesets | Where-Object name -eq $payload.name)
    if ($matches.Count -gt 1) { throw "$fullName has multiple rulesets named '$($payload.name)'; resolve the duplicate first." }
    if ($Mode -eq 'Verify' -and $matches.Count -ne 1) {
        throw "$fullName has no repository ruleset named '$($payload.name)' to verify."
    }

    if ($matches.Count -eq 1) {
        $existing = Invoke-GhJson -Arguments @('api', "repos/$fullName/rulesets/$($matches[0].id)")
        if ($existing.target -ne 'branch' -or
            @($existing.conditions.ref_name.include) -notcontains 'refs/heads/main') {
            throw "$fullName has a same-name ruleset outside main-branch scope; leaving it unchanged."
        }
    }

    if ($Mode -eq 'Apply') {
        $repositoryInfo = Invoke-GhJson -Arguments @('api', "repos/$fullName")
        if ($repositoryInfo.default_branch -ne 'main') {
            throw "$fullName default branch is '$($repositoryInfo.default_branch)', not main."
        }
        if ($repositoryInfo.visibility -ne 'public') {
            throw "$fullName is '$($repositoryInfo.visibility)'. Publish only after the final integration review, then rerun with -Mode Apply."
        }

        $payloadPath = (Resolve-Path -LiteralPath $configuration.Payload).Path
        if ($matches.Count -eq 0) {
            Invoke-GhText -Arguments @('api', "repos/$fullName/rulesets", '--method', 'POST', '--input', $payloadPath) | Out-Null
        } else {
            Write-Output "$fullName already has '$($payload.name)'; verifying it without overwriting it."
        }

        $rulesets = @(Invoke-GhJson -Arguments @('api', "repos/$fullName/rulesets?includes_parents=false"))
        $matches = @($rulesets | Where-Object name -eq $payload.name)
        if ($matches.Count -ne 1) { throw "$fullName ruleset was not created as expected." }
    }

    Assert-EffectiveProtection -FullName $fullName -Payload $payload -RulesetId ([int]$matches[0].id)
}
