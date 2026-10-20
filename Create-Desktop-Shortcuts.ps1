# Creates Windows Desktop shortcuts for Just Spuds POS Till and Admin Management Portal
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Just Spuds POS Till Shortcut
$PosShortcutPath = Join-Path $DesktopPath "Just Spuds POS Till.lnk"
$PosShortcut = $WshShell.CreateShortcut($PosShortcutPath)
$PosShortcut.TargetPath = Join-Path $RootDir "Launch-Store-POS.bat"
$PosShortcut.WorkingDirectory = $RootDir
$PosShortcut.Description = "Open Just Spuds Food Counter Till & EPOS Software"
$Favicon = Join-Path $RootDir "public\favicon.ico"
if (Test-Path $Favicon) {
    $PosShortcut.IconLocation = "$Favicon, 0"
}
$PosShortcut.Save()
Write-Host "✅ Created POS Desktop Shortcut: $PosShortcutPath" -ForegroundColor Green

# 2. Just Spuds Admin Console Shortcut
$AdminShortcutPath = Join-Path $DesktopPath "Just Spuds Admin Portal.lnk"
$AdminShortcut = $WshShell.CreateShortcut($AdminShortcutPath)
$AdminShortcut.TargetPath = Join-Path $RootDir "Launch-Admin-Portal.bat"
$AdminShortcut.WorkingDirectory = $RootDir
$AdminShortcut.Description = "Open Just Spuds Store Management & Financial Console"
if (Test-Path $Favicon) {
    $AdminShortcut.IconLocation = "$Favicon, 0"
}
$AdminShortcut.Save()
Write-Host "✅ Created Admin Desktop Shortcut: $AdminShortcutPath" -ForegroundColor Green

Write-Host "`nAll software shortcuts have been placed directly on your Windows Desktop!" -ForegroundColor Cyan
