@echo off
chcp 65001 > nul
title تصفير وإعادة ضبط نظام موبيكس (Mobix)

echo ==================================================
echo 🛑 جاري إغلاق التطبيق في الخلفية إن كان يعمل...
taskkill /f /im "موبيكس - Mobix.exe" >nul 2>&1
taskkill /f /im "mobix-pos-system.exe" >nul 2>&1
taskkill /f /im "الجوكر فون - JOKER PHONE.exe" >nul 2>&1
taskkill /f /im "joker-phone-pos-system.exe" >nul 2>&1
taskkill /f /im electron.exe >nul 2>&1

timeout /t 1 > nul

echo 🔄 جاري تصفير وحذف ملفات قاعدة البيانات...
node "%~dp0reset-db.js"

echo.
echo ==================================================
echo اضغط أي مفتاح للإغلاق...
pause > nul
