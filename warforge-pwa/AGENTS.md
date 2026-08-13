# Warforge 40k — consignes d’application

## Architecture et sources de vérité

- Application locale React, TypeScript et Vite ; conserver le fonctionnement
  PWA hors ligne et ne pas ajouter de backend sans demande explicite.
- `data/units/` est la source du catalogue V11. Les identifiants d’unités sont
  dérivés de la clé de source et de leur position : préserver l’ordre des
  unités et les clés de fichiers, sauf migration explicitement versionnée.
- `data/inventory/datasheet_x_figs.csv` est l’inventaire actif versionné. Ses
  colonnes contractuelles sont `DatabaseFingerprint`, `UnitId`,
  `ID_figurine` et `Type` (`real` ou `proxy`).
- `data/locales/`, `data/rules/`, `data/missions/` et
  `data/unit-image-seeds.json` sont les entrées versionnées de leurs domaines.
  `public/data/catalog.json`, les locales publiques, les missions publiques,
  l’inventaire public et les règles publiques sont générés par `pnpm sync-data`
  ; ne pas les éditer manuellement.
- `../legacy/warorgan/master_warorgan.json` sert uniquement aux migrations
  historiques. Les scripts `inventory:migrate` et `inventory:rebase` ne sont
  jamais des vérifications courantes et peuvent réécrire l’inventaire.

## Données, règles et sécurité

- Conserver les champs source, les valeurs optionnelles et les coûts tels que
  fournis. Ne pas supposer qu’une ligne de points est unique.
- Pour une mise à jour de règles, relever le PDF de
  `../references/warhammer-40k/`, sa version et sa date ; consulter
  `data/rules/README.md` pour l’extraction des règles de base. Le miroir GDM
  V11 est une exception de développement explicitement approuvée : le
  rafraîchir uniquement avec `pnpm gdm:import`, qui archive les pages et
  ressources localement avant leur synchronisation.
- Toute nouvelle image doit avoir un rapprochement de fiche exact, une
  provenance et une référence de licence dans `data/unit-image-seeds.json`.
- Traiter les textes chargés depuis les données comme non fiables : préférer
  les nœuds DOM et `textContent` à l’injection dans `innerHTML`.

## Vérification

Exécuter depuis ce dossier, selon le périmètre :

```powershell
pnpm test
pnpm build
pnpm rules:validate
pnpm images:validate
```

Pour un changement de données, vérifier aussi le chargement local de la PWA,
une unité avec plusieurs tailles, l’inventaire et les références de règles.
Ne lancer `pnpm rules:extract`, une migration d’inventaire ou le téléchargement
d’images qu’avec une source et un objectif explicites.

## Connaissance stratégique

- Utiliser le skill `warforge-strategy-intelligence` avant toute création ou révision de conseil tactique.
- Utiliser en plus `warforge-secondary-mission-analysis` pour toute analyse de mission secondaire V11.
- Enregistrer les règles et cartes dans leurs domaines factuels ; la base stratégique ne contient que des références, observations, inférences et exemples explicitement classés.
- Atomiser les conseils dans `tacticalClaims`, composer les quinze confrontations dans `matchupGuides` et conserver les simulations pédagogiques dans `workedExamples`.
- `data/strategy/knowledge-base.json` est l’unique source stratégique. Le rapport
  `docs/ANALYSE_MISSIONS_SECONDAIRES_GDM_2026.md` et le miroir public sont
  générés et ne doivent jamais être édités manuellement.
- Toute nouvelle analyse secondaire commence en `draft` et exige une revue
  humaine avant `reviewed`. La publication doit préserver les règles de
  conservation, accomplissement, défausse volontaire et remplacement unique.
- Ne relier une liste à un guide qu’après validation canonique de sa version, de sa disposition et de son total. Le rapport de couverture est une file de revue, pas une autorisation d’inférer les points.
- Ne jamais modifier manuellement le miroir public ni les guides Markdown générés.
- Pour tout changement stratégique, exécuter `pnpm strategy:validate`,
  `pnpm test` et `pnpm build`.

## Simulateur tactique

- `data/simulator/` est la source versionnée des manifests, rulepacks, profils
  physiques et scénarios. `public/data/simulator/` est généré et ne doit jamais
  être modifié manuellement.
- Utiliser le skill `warforge-simulator-development` pour tout changement sous
  `src/simulator/`, `data/simulator/` ou `docs/simulator/`.
- Lire `docs/simulator/PLAN.md`, `STATUS.md`, `project-state.json`,
  `model-routing.json` et les ADR applicables avant de commencer.
- Exécuter `pnpm simulator:project:check`, reprendre l'unique tâche en cours et
  livrer code, tests, preuves et statut synchronisés dans le même changement.
- Utiliser en plus `warforge-data-operations` pour toute donnée de simulateur.
- Ne déclarer une règle ou une liste supportée que si la matrice de couverture
  et les tests de conformité le prouvent.

## Publication GitHub Pages

- Les livraisons validées de Warforge sont publiées par le workflow
  `.github/workflows/deploy-pages.yml` après un push sur `master`.
- Avant de publier, exécuter les validations adaptées au changement, committer
  les fichiers intentionnels puis pousser `master`. Vérifier le résultat du
  workflow GitHub Pages.
- Ne pas publier les archives ou un travail sans rapport avec Warforge sans
  demande explicite.

## Architecture Règles (Reference Hub)
Pour toute évolution liée au système de règles, de missions et d'affichage des stratagèmes, se référer au document de conception : `docs/ARCHITECTURE_REGLES.md`.
