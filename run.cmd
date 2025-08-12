@echo off
set FILE=E:\Parking_app\parkomesta.html
set EDGE="C:\Program Files\Microsoft\Edge\Application\msedge.exe"
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist %EDGE%   start "" %EDGE%   --user-data-dir="E:\Parking_app\.edge"   --allow-file-access-from-files "%FILE%" & exit /b
if exist %CHROME% start "" %CHROME% --user-data-dir="E:\Parking_app\.chrome" --allow-file-access-from-files "%FILE%" & exit /b
echo Пусни ръчно с флага --allow-file-access-from-files
pause
