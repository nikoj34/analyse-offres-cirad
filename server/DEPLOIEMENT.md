# Déploiement CIRAD Analyse d'offres — Serveur Intranet

## Structure du dossier de déploiement

```
cirad-analyse/
├── server.js          # Serveur Node.js
├── package.json       # Dépendances serveur
├── analyses.db        # Base SQLite (créée automatiquement)
├── start.sh           # Script de démarrage Linux
├── start.bat          # Script de démarrage Windows
└── public/            # Frontend compilé (copier ici le contenu de dist/)
    ├── index.html
    ├── assets/
    └── ...
```

## Installation (une seule fois)

### Prérequis
- **Node.js 18+** installé sur le serveur (pas besoin d'accès Internet après installation)

### Étapes

1. **Builder le frontend** (sur une machine avec accès Internet) :
   ```bash
   # Dans le dossier du projet Lovable
   npm run build
   ```

2. **Préparer le dossier serveur** :
   ```bash
   # Copier le dossier server/
   cp -r server/ /chemin/vers/cirad-analyse/
   
   # Copier le build frontend dans public/
   cp -r dist/* /chemin/vers/cirad-analyse/public/
   ```

3. **Installer les dépendances serveur** (une seule fois, nécessite npm) :
   ```bash
   cd /chemin/vers/cirad-analyse/
   npm install --production
   ```

4. **Transférer le dossier complet** sur le serveur Intranet.

## Lancement

### Linux / macOS
```bash
cd /chemin/vers/cirad-analyse/
chmod +x start.sh
./start.sh
```

### Windows
```cmd
cd C:\chemin\vers\cirad-analyse
start.bat
```

### Avec systemd (production Linux)
```ini
[Unit]
Description=CIRAD Analyse d'offres
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/cirad-analyse
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

## Configuration

| Variable d'environnement | Défaut | Description |
|--------------------------|--------|-------------|
| `PORT` | `3001` | Port d'écoute du serveur |

## Intégration Alfresco

Ajoutez un lien ou iframe dans Alfresco pointant vers :
```
http://votre-serveur:3001
```

### Headers pour iframe
Si vous devez autoriser l'intégration en iframe, le serveur ne définit pas de `X-Frame-Options` restrictif.

## Sauvegarde

La base de données est un fichier unique : `analyses.db`

Pour sauvegarder :
```bash
cp analyses.db analyses.db.backup-$(date +%Y%m%d)
```

## Multi-utilisateurs

- Chaque navigateur reçoit un identifiant de session unique
- Quand un utilisateur ouvre un projet, il est **verrouillé** pour les autres (badge rouge)
- Les verrous expirent automatiquement après **30 minutes** d'inactivité
- Un heartbeat (toutes les 5 min) maintient le verrou actif tant que l'utilisateur travaille

## Zéro accès Internet

✅ Aucune ressource externe n'est chargée  
✅ Toutes les polices, icônes et scripts sont embarqués  
✅ La base SQLite est un fichier local  
✅ Le serveur fonctionne en isolation réseau totale
