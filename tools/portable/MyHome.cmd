@echo off
setlocal DisableDelayedExpansion
title MyHome
"%~dp0runtime\node.exe" "%~dp0app\tools\portable-server.mjs" %*
if errorlevel 1 pause
