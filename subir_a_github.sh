#!/bin/bash
# LiraLoud - Subir a GitHub (Git Bash)

echo ""
echo "  =========================================="
echo "   LiraLoud - Publicar en GitHub"
echo "  =========================================="
echo ""

# Pedir el token sin mostrarlo en pantalla
echo -n "  Pega tu GitHub Personal Access Token: "
read -s GH_TOKEN
echo ""

if [ -z "$GH_TOKEN" ]; then
    echo "  ERROR: No ingresaste ningun token. Cancelado."
    exit 1
fi

echo ""
echo "  Preparando archivos..."
git add .

# Verificar si hay cambios
if git diff --cached --quiet; then
    echo "  INFO: No hay cambios nuevos. Haciendo push directo..."
else
    echo ""
    echo -n "  Mensaje del commit (o ENTER para automatico): "
    read MSG
    if [ -z "$MSG" ]; then
        MSG="update: Actualizacion LiraLoud $(date '+%d/%m/%Y %H:%M')"
    fi
    git commit -m "$MSG"
fi

echo ""
echo "  Subiendo a GitHub..."

git push https://jpgm25342-hub:${GH_TOKEN}@github.com/jpgm25342-hub/LiraLoud.git master

if [ $? -eq 0 ]; then
    echo ""
    echo "  =========================================="
    echo "   OK: Subido exitosamente a GitHub!"
    echo "   https://github.com/jpgm25342-hub/LiraLoud"
    echo "  =========================================="
else
    echo ""
    echo "  ERROR: El push fallo. Posibles causas:"
    echo "    1. El token no tiene permisos 'repo'"
    echo "    2. Token expirado o revocado"
fi

# Limpiar el token de la memoria
unset GH_TOKEN
echo ""
read -p "  Presiona ENTER para cerrar..."
