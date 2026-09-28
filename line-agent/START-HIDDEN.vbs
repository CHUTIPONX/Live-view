Set shell = CreateObject("WScript.Shell")
root = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
bat = root & "\LineTrackingAgent\app\START.bat"
shell.Run Chr(34) & bat & Chr(34), 0, False
