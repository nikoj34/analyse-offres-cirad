#!/bin/bash
# Démarrage du serveur CIRAD Analyse d'offres
cd "$(dirname "$0")"
echo "🚀 Démarrage du serveur CIRAD Analyse d'offres..."
PORT=${PORT:-3001} node server.js
