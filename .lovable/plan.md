

# ProcureAnalyze AI — Plan d'Implémentation

## Vue d'ensemble
Application web d'analyse technique et financière d'appels d'offres publics, reproduisant la logique du modèle CIRAD avec une interface moderne et intuitive.

---

## Phase 1 — Module de Saisie (Page de Garde)

### Données du projet
- Formulaire de saisie : Nom du projet, Référence du marché, Lot analysé, N° de lot, Date d'analyse, Rédacteur
- Validation en temps réel de tous les champs

### Gestion des entreprises (jusqu'à 16)
- Liste dynamique permettant d'ajouter de 1 à 16 entreprises
- Gestion spéciale de l'entreprise n°7 (cellules fusionnées à l'export)
- Possibilité de marquer une entreprise comme "Retenue" ou "Écartée"

### Gestion des lots / PSE / Variantes / Tranches Optionnelles
- 12 lignes avec système en cascade (la ligne N+1 n'apparaît que si N est remplie)
- Sélection du type : PSE, Variante, Tranche Optionnelle
- Chaque type active des calculs spécifiques dans le module Prix

### Pondérations avec contraintes métier
- Saisie des critères (Prix, Valeur technique, Environnemental, Planning)
- **Contrainte stricte** : uniquement des multiples de 5, entre 5% et 70%
- Sous-critères techniques paramétrables
- Échelle de notation : Très bien, Bien, Moyen, Passable, Insuffisant

---

## Phase 2 — Module d'Analyse Technique

### Notation par critère
- Interface de grille : chaque entreprise × chaque critère/sous-critère
- Notation selon le barème défini en Page de Garde
- Calcul automatique de la note technique pondérée

### Nettoyage automatique
- Suppression des espaces inutiles dans les saisies
- Correction orthographique des termes métier (ex : "Insuffisant")

---

## Phase 3 — Module Prix

### Saisie des prix
- Offre de base (DPGF 1 & DPGF 2)
- Lignes PSE, Variantes et Tranches Optionnelles (activées selon la Page de Garde)
- Estimations automatiques : TF, TF+PSE, TF+Variante, TF+TO

### Calcul automatique des notes
- Formule commande publique : Note = (Montant mini / Montant offre) × Pondération
- Écart global par rapport à l'estimation
- Scénarios : Total Général, par DPGF

---

## Phase 4 — Synthèse & Classement

### Tableau récapitulatif
- Note globale finale par entreprise (technique + prix + environnemental + planning)
- Classement automatique
- Distinction entreprises retenues / écartées (avec conservation du rang initial)

### Sélection & Scénarios
- Cocher "Retenu" ou "Écarté" par entreprise et par lot
- Recalcul dynamique du classement en filtrant les entreprises écartées

---

## Phase 5 — Cycles de Négociation (Versioning)

### Gestion des versions
- **V0** : Analyse initiale figée (offres d'origine)
- **V1 & V2** : Duplication de l'analyse précédente pour "Après Négociation"
- Historique consultable de toutes les versions

### Tableau de bord comparatif
- Évolution des prix entre V0 et la dernière version
- Évolution des notes techniques
- Visualisation graphique des écarts

---

## Phase 6 — Export Excel (Fidélité CIRAD)

### Génération .xlsx multi-onglets via ExcelJS
- **Onglet Analyse Technique** : colonnes masquées dynamiquement pour les entreprises non saisies
- **Onglet Prix** : distinction Offre de base / PSE / Variantes / TO
- **Onglet Synthèse** : classement final avec toutes les notes

### Mise en forme fidèle
- Codes couleurs (grisage des lignes masquées)
- Protection des cellules de calcul
- Formatage compatible (largeur colonnes, retour à la ligne)

---

## Phase 7 — Assistant IA

### Aide à la rédaction
- Suggestions de justifications pour chaque note technique
- Garantie d'objectivité et de motivation des commentaires
- Intégration via Lovable AI (pas besoin de clé API externe)

---

## Approche technique
- **Frontend** : React + TypeScript + Tailwind CSS (déjà en place)
- **Données** : localStorage pour commencer, migration vers Supabase possible ensuite
- **Export** : ExcelJS côté navigateur pour la génération fidèle du fichier .xlsx
- **IA** : Lovable AI pour l'assistant de rédaction

