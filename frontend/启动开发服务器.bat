@echo off
chcp 65001 > nul
title OpenStudy Frontend - 启动器

echo.
echo  ========================================
echo    OpenStudy Frontend - 启动器
echo  ========================================
echo.
echo  当前目录: %~dp0
echo.

:: 检查 PowerShell 是否可用
where powershell > nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 PowerShell，请升级 Windows！
    pause
    exit /b 1
)

:: 调用 PowerShell 脚本，-NoExit 运行后保持窗口（方便查看日志）
powershell -ExecutionPolicy Bypass -NoExit -Command "cd '%~dp0'; & '%~dp0setup.ps1'"

pause
