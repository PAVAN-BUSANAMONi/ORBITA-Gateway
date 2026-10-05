Set shell = CreateObject("WScript.Shell")
nodePath = "C:\Program Files\nodejs\node.exe"
scriptPath = "C:\Projects\ORBITA-Gateway\src\server.js"
cmd = Chr(34) & nodePath & Chr(34) & " " & Chr(34) & scriptPath & Chr(34)
WScript.Quit shell.Run(cmd, 0, True)
