---
name: warforge-secondary-mission-analysis
description: Créer, réviser, auditer ou comparer les analyses des missions secondaires Warhammer 40,000 V11 dans Warforge. Utiliser pour les guides tactiques, familles, claims, capacités, exemples décisionnels, rapport généré ou intégration PWA des secondaires ; ne pas utiliser pour les missions principales, le catalogue d’unités ou les conseils propres à une faction.
---

# Analyse des missions secondaires Warforge

Produire une connaissance stratégique sourcée, atomique et réutilisable. Le fichier `knowledge-base.json`, conforme au schéma V5, est la source canonique ; le rapport et la PWA sont des projections.

## Workflow obligatoire

1. Lire entièrement `references/analysis-contract.md` et le contrat général `../warforge-strategy-intelligence/references/knowledge-contract.md`.
2. Vérifier le framework dans le Compagnon officiel, puis les faits propres à chaque carte dans l’archive locale approuvée. Ne jamais transformer une inférence en règle.
3. Auditer séparément : conservation de la carte active, accomplissement, défausse volontaire de fin de tour, remplacement à 1 PC une fois par bataille et éventuelle clause « Lorsque piochée ».
4. Décomposer l’analyse en claims atomiques. Relier les missions par une famille et des claims transversaux, jamais par des relations mission-à-mission.
5. Créer toute nouvelle connaissance en `draft`. Une demande de « révision » autorise la correction et l’audit, pas la promotion automatique : ne passer à `reviewed` qu’après une validation humaine explicite de la règle, des sources et des inférences.
6. Générer le rapport avec `pnpm strategy:generate-secondary`, puis exécuter `pnpm strategy:validate`, `pnpm test` et `pnpm build` depuis `warforge-pwa/`.

## Limites

- Ne pas éditer directement le rapport généré ni le miroir public.
- Ne pas inventer de score, probabilité, résultat de dés, relation par paire ou compatibilité automatique de liste.
- Ne pas supposer qu’une liste possède une capacité parce qu’un guide la requiert.
- Si une source, une fenêtre ou une cible manque, conserver le contenu en `draft` et signaler la lacune.
- Si la mission n’est pas identifiable, demander son nom ou sa carte avant de créer un objet. Une probabilité n’est admissible qu’avec un jeu de données observationnel défini, sourcé et validé ; sinon rester sur des branches conditionnelles sans valeur chiffrée.
