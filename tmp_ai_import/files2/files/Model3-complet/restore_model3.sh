#!/bin/bash
# Script de restauration Model 3 API

echo "🔄 RESTAURATION MODEL 3 API"
echo "==========================="

# Vérifier l'archive
if [ ! -f "datacenter_ai_model3_20260411_172025.zip" ]; then
    echo "❌ Archive datacenter_ai_model3_20260411_172025.zip non trouvée"
    echo "Téléchargez l'archive depuis Google Drive ou votre ordinateur"
    exit 1
fi

# Extraire
echo "📁 Extraction de l'archive..."
unzip -o datacenter_ai_model3_20260411_172025.zip

# Vérifier les fichiers
echo "🔍 Vérification des fichiers..."
required_files=("model3_api.py" "requirements.txt" "model3_realistic_final.pkl" "model3_realistic_scaler.pkl")

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file manquant"
        exit 1
    fi
done

# Installer dépendances
echo "📦 Installation des dépendances..."
pip install -r requirements.txt

# Permissions
chmod +x start_api.sh

echo "✅ Restauration terminée!"
echo "🚀 Démarrer avec: ./start_api.sh"
