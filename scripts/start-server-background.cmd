@echo off
set "ROOT=%~dp0.."
cd /d "%ROOT%"
if not exist work mkdir work
start "brand-contents" /min cmd.exe /c "node server.js > work\server.out.log 2> work\server.err.log"
