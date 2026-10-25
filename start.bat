@echo off
rem Tribal Feud starter: haalt de nieuwste versie op, installeert alleen als het nodig is, en start de game.
rem
rem Het script draait in drie stappen, omdat git pull dit bestand zelf kan vervangen terwijl het draait:
rem   1. (geen argument) kopieer jezelf naar %TEMP% en start die kopie
rem   2. --pull  : de kopie doet git pull en start daarna de VERSE start.bat uit de repo
rem   3. --run   : installeren als dat nodig is en de game starten (altijd met de nieuwste logica)

if /i "%~1"=="--pull" goto pull
if /i "%~1"=="--run" goto run
copy /y "%~f0" "%TEMP%\tribal-feud-start.bat" >nul
"%TEMP%\tribal-feud-start.bat" --pull "%~dp0"
exit /b

:pull
title Tribal Feud
cd /d "%~2"
echo.
echo === Nieuwste versie ophalen ===
git pull --ff-only
if errorlevel 1 (
  echo.
  echo Ophalen mislukt. Heb je lokaal iets aangepast? Dan start de game met de versie die je nu hebt.
  echo.
  pause
)
"%~2start.bat" --run "%~2"
exit /b

:run
title Tribal Feud
cd /d "%~2"

rem Draait de game al (poort 5173 bezet)? Dan geen tweede server starten: die zou op een andere
rem poort komen, en saves horen bij het adres. De draaiende server laadt nieuwe code zelf in.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 goto checkinstall
fc /b package-lock.json node_modules\.tribal-feud-lock >nul 2>&1
if errorlevel 1 goto runningneedsinstall
echo.
echo === De game draait al. Ik open hem: http://localhost:5173 ===
echo Nieuwe code wordt vanzelf geladen; ververs de pagina als je hem al open had.
start "" http://localhost:5173
timeout /t 5 >nul
exit /b

:runningneedsinstall
echo.
echo De game draait nog in een ander venster, maar deze versie heeft nieuwe packages nodig.
echo Sluit dat venster en start start.bat opnieuw.
echo.
pause
exit /b 1

:checkinstall

rem npm ci alleen als het nodig is: geen vite, of package-lock.json veranderd sinds de vorige install.
rem npm ci (niet npm install) laat package-lock.json ongemoeid, zodat git pull niet vastloopt.
if not exist node_modules\.bin\vite.cmd goto install
if not exist node_modules\.tribal-feud-lock goto install
fc /b package-lock.json node_modules\.tribal-feud-lock >nul 2>&1
if errorlevel 1 goto install
goto start

:install
echo.
echo === Packages installeren ===
echo (Draait de game nog in een ander venster? Sluit dat eerst, anders zitten bestanden op slot.)
if exist node_modules\.tribal-feud-lock del node_modules\.tribal-feud-lock
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
