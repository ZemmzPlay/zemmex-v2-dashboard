@echo off
rem Starts web and worker on Windows, even when Node was just installed and
rem is not yet on this shell's PATH.
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0.."
npm run dev
