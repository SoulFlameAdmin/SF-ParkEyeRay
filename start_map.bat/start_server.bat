@echo off
cd /d E:\Parking_app

:: Стартиране на локален сървър с Python
start cmd /k "python -m http.server 8000"

:: Изчакване 2 секунди и отваряне на localhost в браузъра
timeout /t 2 >nul
start http://localhost:8000
