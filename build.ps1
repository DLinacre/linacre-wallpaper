<#
.SYNOPSIS
Builds Linacre Wallpaper for Lively Wallpaper distribution
#>

param(
    [string]$OutputDir = "dist",
    [string]$Version = "1.0.0"
)

Write-Host "Building Linacre Wallpaper v$Version..." -ForegroundColor Cyan

# Clean output
if (Test-Path $OutputDir) {
    Remove-Item $OutputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

# Copy frontend
Write-Host "Copying frontend..." -ForegroundColor Green
Copy-Item "frontend\" -Destination "$OutputDir\frontend" -Recurse -Force

# Copy backend
Write-Host "Copying backend..." -ForegroundColor Green
Copy-Item "backend\" -Destination "$OutputDir\backend" -Recurse -Force
# Remove unnecessary files
Remove-Item "$OutputDir\backend\__pycache__" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$OutputDir\backend\.venv" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$OutputDir\backend\.env" -Force -ErrorAction SilentlyContinue

# Copy README
Copy-Item "README.md" -Destination "$OutputDir/README.md" -Force

# Create Lively Wallpaper package (.zip)
Write-Host "Creating Lively Wallpaper package..." -ForegroundColor Green
$zipPath = "$OutputDir/linacre-wallpaper-v$Version.lively.zip"
Compress-Archive -Path "$OutputDir/frontend/*" -DestinationPath $zipPath -Force

# Create installer script
Write-Host "Creating installer..." -ForegroundColor Green
@"
@echo off
title Linacre Wallpaper Installer
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║           Linacre System Monitor Wallpaper v$Version           ║
echo ║                    Installer for Windows                      ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

set INSTALL_DIR=%LOCALAPPDATA%\linacre-wallpaper
echo Installing to: %INSTALL_DIR%
echo.

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo Copying backend...
xcopy /E /I /Y backend "%INSTALL_DIR%\backend\"

echo.
echo Setting up Python virtual environment...
cd /d "%INSTALL_DIR%\backend"
python -m venv .venv
call .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt

echo Creating runner script...
echo @echo off > "%INSTALL_DIR%\backend\run_backend.cmd"
echo cd /d "%INSTALL_DIR%\backend" >> "%INSTALL_DIR%\backend\run_backend.cmd"
echo call .venv\Scripts\activate >> "%INSTALL_DIR%\backend\run_backend.cmd"
echo python -m main >> "%INSTALL_DIR%\backend\run_backend.cmd"

echo.
echo Creating startup shortcut...
powershell -NoProfile -Command "
  `$ws = New-Object -ComObject WScript.Shell
  `$s = `$ws.CreateShortcut('%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LinacreWallpaperBackend.lnk')
  `$s.TargetPath = '%INSTALL_DIR%\backend\run_backend.cmd'
  `$s.WorkingDirectory = '%INSTALL_DIR%\backend'
  `$s.WindowStyle = 7
  `$s.Save()
"

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║  Backend installed! Next steps:                              ║
echo ║                                                              ║
echo ║  1. Start backend:                                           ║
echo ║     cd %INSTALL_DIR%\backend                                 ║
echo ║     .venv\Scripts\activate                                   ║
echo ║     python -m main                                           ║
echo ║                                                              ║
echo ║  2. Install wallpaper in Lively Wallpaper:                   ║
echo ║     Open Lively Wallpaper → + → Import Wallpaper             ║
echo ║     Select: $zipPath                    ║
echo ║                                                              ║
echo ║  3. Configure WS Host: 127.0.0.1, Port: 8765                 ║
echo ║                                                              ║
echo ║  4. Apply to your dual monitors!                             ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
pause
"@ | Out-File -Encoding UTF8 "$OutputDir/install.bat"

Write-Host "`nBuild complete!" -ForegroundColor Cyan
Write-Host "Output: $OutputDir" -ForegroundColor Yellow
Write-Host "Lively package: $zipPath" -ForegroundColor Yellow
Write-Host "Installer: $OutputDir\install.bat" -ForegroundColor Yellow