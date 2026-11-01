@echo off
chcp 65001 >nul
echo ============================================
echo    تصفير قاعدة بيانات نظام موبيكس (Mobix)
echo ============================================
echo.

set "DB_DIR=%APPDATA%\mobix-pos-system"
set "DB_FILE=%DB_DIR%\cosmetics_pos.db"
set "DB_WAL=%DB_DIR%\cosmetics_pos.db-wal"
set "DB_SHM=%DB_DIR%\cosmetics_pos.db-shm"

if exist "%DB_FILE%" del /f /q "%DB_FILE%" 2>nul
if exist "%DB_WAL%" del /f /q "%DB_WAL%" 2>nul
if exist "%DB_SHM%" del /f /q "%DB_SHM%" 2>nul

set "OLD_DIR=%APPDATA%\joker-phone-pos-system"
if exist "%OLD_DIR%\cosmetics_pos.db" del /f /q "%OLD_DIR%\cosmetics_pos.db" 2>nul
if exist "%OLD_DIR%\cosmetics_pos.db-wal" del /f /q "%OLD_DIR%\cosmetics_pos.db-wal" 2>nul
if exist "%OLD_DIR%\cosmetics_pos.db-shm" del /f /q "%OLD_DIR%\cosmetics_pos.db-shm" 2>nul
echo [OK] تم تصفير وحذف قواعد البيانات القديمة والجديدة.

echo.
echo ============================================
echo    تم تصفير قاعدة البيانات بنجاح!
echo    افتح التطبيق وسجل من جديد.
echo ============================================
echo.
pause
