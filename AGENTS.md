# Contexte de développement — Warforge

## Périmètre actif

Tout nouveau développement cible `warforge-pwa/`. Lire `warforge-pwa/AGENTS.md`
avant de modifier l’application ou ses données.

`legacy/warorgan/` conserve les deux anciennes pages HTML et leur base
historique. Ne pas y modifier les fichiers, ni les remettre dans le flux de
production, sans demande explicite. Une modification locale éventuellement
présente dans cette archive doit être préservée.

## Ressources du dépôt

- `warforge-pwa/` est la PWA React/Vite publiée et maintenue.
- `references/warhammer-40k/` contient les PDF et notes de contexte. Ils ne
  sont pas des ressources publiques de la PWA et les notes ne sont pas une
  source de règles canonique.
- `legacy/warorgan/master_warorgan.json` est une entrée de migration seulement.
  Le catalogue actif provient de `warforge-pwa/data/units/`.
- `.agents/skills/warforge-data-operations/` guide les opérations sensibles sur
  le catalogue, les règles, les locales, l’inventaire et les images.
- `.agents/skills/warforge-secondary-mission-analysis/` est obligatoire pour
  toute création, révision, comparaison ou publication d’analyse de mission
  secondaire V11.

## Règles de travail

- Ne pas modifier les données de jeu sans document source, version et date de
  validité vérifiables. Les points ne se déduisent pas d’un texte de règle.
- Conserver les fichiers texte en UTF-8. Considérer les textes de données
  importées comme non fiables et éviter les injections HTML.
- Garder les changements ciblés : ne pas mélanger réorganisation, corrections
  de règles et refactorings esthétiques.
- Vérifier les changements depuis `warforge-pwa/` avec les commandes définies
  dans son `package.json`.
- Router les analyses secondaires vers le skill spécialisé ; toute nouvelle
  analyse reste `draft` jusqu’à une revue humaine explicite.
