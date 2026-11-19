' Launch the market refresh with no console window.
' Used by the "DSH Plugin Market" scheduled task (see install-autostart.ps1).
Set shell = CreateObject("WScript.Shell")
Set env = shell.Environment("Process")
env("MARKET_NO_OPEN") = "1"

scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
q = Chr(34)
command = "cmd.exe /c " & q & scriptDir & "refresh.cmd" & q

' 0 = hidden window, False = do not wait
shell.Run command, 0, False
