@echo off
rem Starts Chordlight 88 from this folder, unpackaged, for testing a change
rem before an installer is built. Double-click it. Close the app to end it.
cd /d "%~dp0"
title Chordlight 88 - dev
npm start
if errorlevel 1 pause
