# Install / uninstall the daily auto-refresh scheduled task (current user, no admin).
#
#   install-autostart.ps1            install or update
#   install-autostart.ps1 -Uninstall remove
#
# Triggers: 1 minute after logon, plus daily at 09:30 (missed runs are caught up).
# Each run: harvest npm data -> write today's snapshot -> rebuild index and site ->
#           draft the weekly report -> make sure the local server is running.
# Runs hidden (launched through wscript), never opens a browser.
#
# This file is ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 without BOM.

param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$taskName = 'DSH Plugin Market'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $scriptDir 'refresh-hidden.vbs'

if ($Uninstall) {
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "[ok] removed scheduled task: $taskName"
  } else {
    Write-Host "[skip] scheduled task not found: $taskName"
  }
  return
}

if (-not (Test-Path $vbs)) { throw "missing launcher: $vbs" }

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""

$logon = New-ScheduledTaskTrigger -AtLogOn
$logon.Delay = 'PT1M'

$daily = New-ScheduledTaskTrigger -Daily -At '09:30'

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
  -MultipleInstances IgnoreNew `
  -Hidden

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger @($logon, $daily) `
  -Settings $settings `
  -Principal $principal `
  -Description 'Refresh the DSH plugin market on E: harvest data, snapshot, rebuild index and site, start the local server (hidden).' `
  -Force | Out-Null

$task = Get-ScheduledTask -TaskName $taskName
Write-Host "[ok] installed scheduled task: $($task.TaskName)"
Write-Host "     triggers: logon + 1 min, daily 09:30 (catch up when missed)"
Write-Host "     action:   wscript.exe `"$vbs`""
Write-Host "     run now:  Start-ScheduledTask -TaskName '$taskName'"
Write-Host "     remove:   install-autostart.ps1 -Uninstall"
