#!/bin/bash
# Script de démarrage de l'API Model 3

echo "🚀 Démarrage API Datacenter Model 3"
echo "=================================="

# Vérifier les modèles
if [ ! -f "model3_realistic_final.pkl" ]; then
    echo "❌ Erreur: model3_realistic_final.pkl manquant"
    exit 1
fi

if [ ! -f "model3_realistic_scaler.pkl" ]; then
    echo "❌ Erreur: model3_realistic_scaler.pkl manquant"
    exit 1
fi

# Installer les dépendances
echo "📦 Installation des dépendances..."
pip install -r requirements.txt

# Démarrer l'API
echo "🌐 Démarrage du serveur sur http://localhost:8000"
echo "📖 Documentation: http://localhost:8000/docs"
echo "❤️ Santé: http://localhost:8000/health"
echo ""
echo "Appuyez sur Ctrl+C pour arrêter"

python model3_api.py
