# Architecture & Plan d'Amélioration du Module Règles (Reference Hub)

## 1. État de l'Existant
Actuellement, l'application propose les règles sous deux formes isolées :
- `src/rules/RulesPage.tsx` : Affichage séquentiel du *Core Rulebook* (Livre de Règles de Base).
- `src/learning/` : Module de quiz pour les missions, sans page de référence passive.
- `public/data/catalog.json` : Contient toute la richesse des Factions (Règles d'armée, Détachements, Stratagèmes, Améliorations), mais aucune interface ne les exploite purement comme un "Codex" numérique.

## 2. Objectifs du Reference Hub (L'Encyclopédie Warforge)
Créer une bibliothèque unifiée, ergonomique et exhaustive du jeu Warhammer 40k v11, agissant comme un outil de référence hors ligne "Zero-Click" (rapide) pour le joueur en pleine partie ou en préparation.

### Navigation Structurée
- `/reference/core` : Règles de base (moteur de jeu).
- `/reference/factions` : Liste des armées.
  - `/reference/factions/:id` : Règle d'armée, liste des Détachements.
  - `/reference/factions/:id/detachment/:detId` : Stratagèmes et Améliorations du détachement.
- `/reference/missions` : Cartes de missions primaires, secondaires, déploiements, et règles de Sceau Capitulaire / Pariah Nexus.
- `/reference/search` : Omnisearch (Recherche globale textuelle sur tout le corpus).

## 3. Design System & Composants à Implémenter
En tant qu'expert React/Vite/Tailwind, nous devons concevoir des composants atomiques réutilisables, qui reflètent la sémiotique visuelle du jeu :

- `StratagemCard` : Header avec couleur de Faction, coût en CP (Point de Commandement), Phase (icône), Type (Tactique de Bataille, Acte Épique, etc.), Cible, Effet, et Restrictions.
- `EnhancementCard` : Nom, Coût en points, Effet.
- `MissionCard` : Layout reprenant la structure "deck" (When, Trigger, Points).
- `RuleTooltip` : Un composant d'UI permettant de survoler un Mot-Clé (ex: *Létal*, *Frapper en Profondeur*) pour lire sa définition sans quitter la page active.
- Intégration des *FAQ / Errata* directement dans les composants concernés (via un badge ou un callout d'information).

## 4. Modélisation et Flux de Données
Toutes les données sont déjà majoritairement consolidées dans :
- `catalog.json` & `locales/fr/catalog.json` pour le contenu des codex.
- `missions.json` & `locales/fr/missions.json` pour les missions.
- `core-rules-fr.json` pour les règles.

La logique de chargement (Data Access Layer) devra extraire dynamiquement ces ressources (idéalement via le Worker existant ou des hooks optimisés) pour instancier les vues `/reference/`.

## 5. Étapes de Réalisation (Milestones)
1. **Refactoring Structurel** : Création du dossier `src/reference/` et déplacement progressif de `RulesPage` en tant que `src/reference/core/`.
2. **Implémentation des UI Atomiques** : `StratagemCard`, `EnhancementCard`.
3. **Vues Codex** : Page Index Faction -> Page Faction -> Page Détachement.
4. **Vue Missions** : Affichage en "Grille" des cartes de mission (Primaires / Secondaires), avec filtre et tri (Sceau Capitulaire).
5. **Moteur Omnisearch** : Création d'un index global fusionné pour la recherche unifiée.
