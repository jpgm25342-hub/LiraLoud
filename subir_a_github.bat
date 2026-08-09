@echo off
title LiraLoud - Subir a GitHub

echo.
echo  ==========================================
echo   LiraLoud - Publicar en GitHub
echo  ==========================================
echo.

git --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Git no esta instalado.
    echo  Descargalo en: https://git-scm.com/downloads
    pause
    exit /b 1
)

echo  Pega tu GitHub Personal Access Token y presiona ENTER:
echo  (El token NO se guardara en ningun archivo)
echo.
set /p "GH_TOKEN=  Token: "

if "%GH_TOKEN%"=="" (
    echo.
    echo  ERROR: No ingresaste ningun token. Cancelado.
    pause
    exit /b 1
)

echo.
echo  Preparando archivos...

git add .

git diff --cached --quiet
if not errorlevel 1 (
    echo  INFO: No hay cambios nuevos. Haciendo push directo...
    goto :push_only
)

echo.
set /p "MSG=  Mensaje del commit (o ENTER para automatico): "
if "%MSG%"=="" set "MSG=update: Actualizacion LiraLoud"

git commit -m "%MSG%"
if errorlevel 1 (
    echo.
    echo  ERROR: El commit fallo.
    set GH_TOKEN=
    pause
    exit /b 1
)

:push_only
echo.
echo  Subiendo a GitHub...

git push https://jpgm25342-hub:%GH_TOKEN%@github.com/jpgm25342-hub/LiraLoud.git master

if errorlevel 1 (
    echo.
    echo  ERROR: El push fallo. Posibles causas:
    echo    1. El token no tiene permisos "repo"
    echo    2. El repositorio no existe en GitHub
    echo    3. Token expirado o revocado
    echo.
) else (
    echo.
    echo  ==========================================
    echo   OK: Subido exitosamente a GitHub!
    echo   https://github.com/jpgm25342-hub/LiraLoud
    echo  ==========================================
    echo.
)

set GH_TOKEN=
pause
