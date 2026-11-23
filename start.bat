@echo off
title AttendQR — Classroom QR Attendance Server
cd /d "%~dp0"
echo Starting AttendQR server...
start "" "http://localhost:3001"
node server/index.js
pause
