[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$owner = 'cayetanobp'
$ownerId = 197016816
$repositoryNames = @('mermaid-bp', 'mermaid-bp-plugins')

function Invoke-GitHubJson {
    param([string]$Endpoint, [string]$Method = 'GET', [object]$Body)
    if ($null -ne $Body) {
        $response = $Body | ConvertTo-Json -Depth 20 -Compress | & gh api --method $Method $Endpoint --input -
    } else {
        $response = & gh api --method $Method $Endpoint
    }
    if ($LASTEXITCODE -ne 0) { throw "GitHub failed: $Method $Endpoint" }
    if ($response) { return (($response -join "`n") | ConvertFrom-Json) }
}

# This script never changes repository visibility or starts a workflow.
# The owner publishes both repositories separately before running this script.
foreach ($repositoryName in $repositoryNames) {
    $repository = Invoke-GitHubJson "repos/$owner/$repositoryName"
    if ($repository.private) { throw "$repositoryName is still private. No public gates were applied." }
}

foreach ($repositoryName in $repositoryNames) {
    $endpoint = "repos/$owner/$repositoryName"
    Invoke-GitHubJson "$endpoint/actions/permissions/fork-pr-contributor-approval" 'PUT' @{
        approval_policy = 'all_external_contributors'
    } | Out-Null

    Invoke-GitHubJson "$endpoint/environments/release-signing" 'PUT' @{
        prevent_self_review = $false
        reviewers = @(@{type = 'User'; id = $ownerId})
        deployment_branch_policy = @{protected_branches = $false; custom_branch_policies = $true}
    } | Out-Null

    $policies = Invoke-GitHubJson "$endpoint/environments/release-signing/deployment-branch-policies"
    $unexpected = @($policies.branch_policies | Where-Object { $_.name -ne 'main' -or $_.type -ne 'branch' })
    if ($unexpected.Count) { throw "Unexpected deployment policies in $repositoryName; review them before continuing." }
    if (-not @($policies.branch_policies | Where-Object { $_.name -eq 'main' -and $_.type -eq 'branch' }).Count) {
        Invoke-GitHubJson "$endpoint/environments/release-signing/deployment-branch-policies" 'POST' @{
            name = 'main'; type = 'branch'
        } | Out-Null
    }

    $environment = Invoke-GitHubJson "$endpoint/environments/release-signing"
    $reviewRule = @($environment.protection_rules | Where-Object { $_.type -eq 'required_reviewers' })
    if ($reviewRule.Count -ne 1 -or $reviewRule[0].prevent_self_review -or
        @($reviewRule[0].reviewers).Count -ne 1 -or $reviewRule[0].reviewers[0].reviewer.id -ne $ownerId) {
        throw "Reviewer protection did not match the agreement in $repositoryName."
    }
    $verifiedPolicies = Invoke-GitHubJson "$endpoint/environments/release-signing/deployment-branch-policies"
    if (@($verifiedPolicies.branch_policies).Count -ne 1 -or
        $verifiedPolicies.branch_policies[0].name -ne 'main' -or
        $verifiedPolicies.branch_policies[0].type -ne 'branch') {
        throw "The release environment is not restricted to main in $repositoryName."
    }
    $approval = Invoke-GitHubJson "$endpoint/actions/permissions/fork-pr-contributor-approval"
    if ($approval.approval_policy -ne 'all_external_contributors') {
        throw "External workflow approval did not match in $repositoryName."
    }

    Invoke-GitHubJson $endpoint 'PATCH' @{
        security_and_analysis = @{
            secret_scanning = @{status = 'enabled'}
            secret_scanning_push_protection = @{status = 'enabled'}
        }
    } | Out-Null
    Invoke-GitHubJson "$endpoint/private-vulnerability-reporting" 'PUT' | Out-Null
    Write-Output "$repositoryName`: external CI authorization and release reviewer/main gates verified."
}

Write-Output 'No secrets were moved. Install the reviewed workflow/CODEOWNERS patch before migrating the signing key.'
