$desktop = [System.IO.Path]::Combine($env:USERPROFILE, 'Desktop')
$shortcutPath = Join-Path $desktop "Budget App.lnk"
$targetPath = "C:\Users\sinco\.gemini\antigravity\scratch\budget-app\Launch_Budget_App.bat"
$workDir = "C:\Users\sinco\.gemini\antigravity\scratch\budget-app"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $workDir
$shortcut.Save()

Write-Host "Shortcut created at $shortcutPath"
