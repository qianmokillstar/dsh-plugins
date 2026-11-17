' Start the market server with no console, so no Ctrl+C from any parent console can reach it.
' Called by start-market.cmd; also safe to run directly (double-click).
' Optional argument: port (default 51888).

Set shell = CreateObject("WScript.Shell")
Set env = shell.Environment("Process")

port = "51888"
If WScript.Arguments.Count > 0 Then port = WScript.Arguments(0)

node = env("DSH_NODE_EXECUTABLE")
If node = "" Then node = "node"

scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
server = scriptDir & "..\server\serve.mjs"
q = Chr(34)

command = q & node & q & " " & q & server & q & " " & port
' 0 = hidden window, False = do not wait for it
shell.Run command, 0, False
