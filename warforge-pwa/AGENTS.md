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
