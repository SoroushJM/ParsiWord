# Preview: pwsh -File scripts/clean-local-artifacts.ps1
# Apply:   pwsh -File scripts/clean-local-artifacts.ps1 -Apply
[CmdletBinding(SupportsShouldProcess = $true)]
param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskPackage = Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json
if ($taskPackage.name -ne 'parsiword-workspace') { throw 'Unexpected project root.' }
$taskArtifacts = Join-Path $taskRoot 'artifacts'
if (-not (Test-Path -LiteralPath $taskArtifacts)) { return }

# Only disposable research/checkouts and integration-test profiles are listed.
# Keep runtime assets, source archives, dependencies, signing files, attachments,
# current VSIX, and top-level test reports/screenshots/export witnesses.
$taskDirectories = @(
    'xetex-research', 'tikz-prototype', 'diff-probe',
    'windows-xetex-before', 'windows-xetex-after', 'xetex-invalid',
    'ci-native-failure', 'tikz-ci-failure',
    'github-extension-job-121656743808', 'github-extension-job-121684615356'
)
$taskTargets = @($taskDirectories | ForEach-Object { Join-Path $taskArtifacts $_ } | Where-Object { Test-Path -LiteralPath $_ })
$taskProfiles = Join-Path $taskArtifacts 'vscode-test'
if (Test-Path -LiteralPath $taskProfiles) {
    $taskTargets += @(Get-ChildItem -LiteralPath $taskProfiles -Directory -Force |
        Where-Object { $_.Name -match '^run-\d+$' -or $_.Name -in @('profile', 'extensions', 'workspace') } |
        ForEach-Object FullName)
}
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskRoot 'apps/vscode/package.json') -Raw | ConvertFrom-Json).version
$taskTargets += @(Get-ChildItem -LiteralPath $taskArtifacts -File -Force |
    Where-Object {
        ($_.Name -like 'parsiword-vscode-*.vsix' -and $_.Name -ne "parsiword-vscode-$taskVersion.vsix") -or
        $_.Name -like 'formula-debug-*.svg' -or $_.Name -like 'github-extension-job-*.zip'
    } | ForEach-Object FullName)

if ($Apply) {
    $taskProcesses = @(Get-CimInstance Win32_Process | Where-Object {
        $_.Name -in @('Code.exe', 'node.exe') -and $_.CommandLine -like '*artifacts*vscode-test*'
    })
    if ($taskProcesses.Count) { throw 'Close the disposable VS Code test windows before applying cleanup.' }
}
$taskReport = foreach ($taskTarget in $taskTargets) {
    $taskResolved = (Resolve-Path -LiteralPath $taskTarget).Path
    if (-not $taskResolved.StartsWith($taskArtifacts + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Target escaped the project artifacts directory: $taskResolved"
    }
    $taskRelative = [IO.Path]::GetRelativePath($taskRoot, $taskResolved)
    git -C $taskRoot check-ignore --quiet -- $taskRelative
    if ($LASTEXITCODE -ne 0) { throw "Target is not an ignored generated artifact: $taskRelative" }
    $taskItem = Get-Item -LiteralPath $taskResolved -Force
    $taskChildren = if ($taskItem.PSIsContainer) { @(Get-ChildItem -LiteralPath $taskResolved -Recurse -Force) } else { @() }
    if (@(@($taskItem) + $taskChildren | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) {
        throw "Refusing linked cleanup target: $taskRelative"
    }
    $taskFiles = @(@($taskItem) + $taskChildren | Where-Object { -not $_.PSIsContainer })
    $taskBytes = [long]($taskFiles | Measure-Object -Property Length -Sum).Sum
    $taskRemoved = $false
    if ($Apply -and $PSCmdlet.ShouldProcess($taskResolved, 'Remove disposable local artifacts')) {
        Remove-Item -LiteralPath $taskResolved -Recurse -Force
        $taskRemoved = -not (Test-Path -LiteralPath $taskResolved)
    }
    [pscustomobject]@{ path = $taskRelative; files = $taskFiles.Count; bytes = $taskBytes; removed = $taskRemoved }
}
$taskReport | ConvertTo-Json -Depth 3
