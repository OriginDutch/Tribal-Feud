@echo off
rem Tribal Feud starter: haalt de nieuwste versie op, installeert alleen als het nodig is, en start de game.
title Tribal Feud
cd /d "%~dp0"

echo.
echo === Nieuwste versie ophalen ===
git pull --ff-only
if errorlevel 1 (
  echo.
  echo Ophalen mislukt. Heb je lokaal iets aangepast? Dan start de game met de versie die je nu hebt.
  echo.
  pause
)

rem npm ci alleen als package-lock.json veranderd is sinds de vorige install.
rem npm ci (niet npm install) laat package-lock.json ongemoeid, zodat git pull niet vastloopt.
if not exist node_modules goto install
if not exist node_modules\.tribal-feud-lock goto install
fc /b package-lock.json node_modules\.tribal-feud-lock >nul 2>&1
if errorlevel 1 goto install
goto start

:install
echo.
echo === Packages installeren ===
echo (Draait de game nog in een ander venster? Sluit dat eerst, anders zitten bestanden op slot.)
call npm ci
rem niet op errorlevel vertrouwen: controleer of vite er echt staat
if not exist node_modules\.bin\vite.cmd goto installfailed
copy /y package-lock.json node_modules\.tribal-feud-lock >nul
goto start

:installfailed
echo.
echo Installeren is mislukt, de game wordt niet gestart.
echo Meestal draait de game nog in een ander venster, of je virusscanner houdt een bestand vast.
echo Sluit andere vensters met de game en probeer start.bat opnieuw.
echo.
pause
exit /b 1

:start
echo.
echo === Game starten, de browser opent vanzelf. Sluit dit venster om te stoppen. ===
call npm run dev -- --open
pause
