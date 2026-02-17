@echo off
REM Démarrage du serveur CIRAD Analyse d'offres
cd /d "%~dp0"
echo Demarrage du serveur CIRAD Analyse d'offres...
set PORT=3001
node server.js
pause
