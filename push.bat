@echo off
setlocal enabledelayedexpansion
cls
echo 1. Push now with "update"
echo 2. Push with custom message
echo.
set /p choice=Enter your choice (1 or 2):  

if "%choice%"=="1" (
    git add .
    git commit -m "update"
    git push
) else if "%choice%"=="2" (
    set /p msg=Enter your commit message: 
    git add .
    git commit -m "!msg!"
    git push
) else (
    echo Invalid choice.
)
pause