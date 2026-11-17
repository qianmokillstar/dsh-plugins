# One-click publish: commit this folder, point origin at your repo, push.
# ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 without BOM.

$ErrorActionPreference = 'Stop'
$repo = Read-Host 'Repo URL (https://github.com/you/dsh-plugins)'
$repo = $repo.Trim().TrimEnd('/')
$repo = $repo -replace '\.git$', ''
if (-not $repo) { Write-Host '[error] repo URL is required'; exit 1 }

$user = ($repo -split '/')[-2]
if (-not $user) { Write-Host '[error] cannot read the owner from that URL'; exit 1 }

$git = 'E:\tools\PortableGit\cmd\git.exe'
if (-not (Test-Path $git)) { $git = 'git' }
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host "[1/4] identity: $user"
& $git config user.name $user
& $git config user.email "$user@users.noreply.github.com"

Write-Host '[2/4] staging'
& $git add -A

Write-Host '[3/4] commit'
& $git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host '      nothing new to commit'
} else {
  & $git commit -m 'init: DSH plugin site' | Out-Null
}

Write-Host "[4/4] push to $repo"
& $git remote remove origin 2>$null
& $git remote add origin "$repo.git"
& $git push -u origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '[error] push failed. Make sure the repository exists, is empty, and you signed in when the browser opened.'
  exit 1
}

Write-Host ''
Write-Host '[ok] pushed. Two manual steps left in the browser:'
Write-Host '     1) Settings -> Actions -> General -> Workflow permissions: Read and write'
Write-Host '     2) Settings -> Pages -> Source: GitHub Actions'
