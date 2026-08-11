# Contrat de connaissance stratégique Warforge

## Source de vérité et cycle de publication

La source est `warforge-pwa/data/strategy/knowledge-base.json`. Son miroir généré est `warforge-pwa/public/data/strategy-knowledge.json` et ne doit jamais être modifié directement. La commande `pnpm --dir warforge-pwa strategy:validate` vérifie le schéma, les liens aux cartes GDM et au catalogue, les références internes et les SHA-256 des archives locales. `pnpm --dir warforge-pwa build` exécute cette validation puis régénère le miroir.

Le document est exclusivement V11 et utilise `schemaVersion: "warforge-strategy-knowledge/v5"`. Sa compatibilité doit épingler `warforge-catalog/v2`, la valeur présente dans `data/units/DataInfo.json`, et les identifiants des packs de mission applicables.

Les identifiants `catalogUnitId` et `catalogDetachmentId` sont des identifiants normalisés (`book-…:unit:n`, `book-…:detachment:n`) de la version de catalogue épinglée, jamais des noms visibles.

## Niveaux de connaissance

| Niveau | Usage | Preuve minimale |
| --- | --- | --- |
| Fait officiel | règles, mission, FAQ, points, catalogue | document officiel versionné et daté |
| Archive de mission approuvée | contexte de mission GDM | archive locale, empreinte et autorité `approved-archive` |
| Observation | résultats de tournois ou mesures de jeu | période, population, méthode, archive et limites |
| Inférence | rôle, synergie, lecture stratégique | sources résolues, préconditions et limites |
| Hypothèse | piste de test | statut `needs-review`; jamais publiée comme conseil |

Une archive GDM est une source `trusted-mission-archive` d’autorité `approved-archive`. Elle est bien prise en compte pour les scénarios, dispositions et layouts, mais n’est pas une source officielle de règle. Une métrique de méta archivée est `tournament-meta-snapshot` d’autorité `observational`; elle décrit une corrélation observée, jamais une causalité.

## Racine et registre de sources

La racine comprend `knowledgeVersion`, `status` (`draft`, `reviewed`, `published`), `updatedAt`, `compatibility`, `catalogProvenanceSourceId`, `sources`, `ruleNodes`, `scenarios`, `forceDispositions`, `layoutContexts`, `unitProfiles`, `detachmentProfiles`, `synergies`, `metaSnapshots`, `recommendations`, `victoryPlans`, `referenceRosters`, `tacticalClaims`, `matchupGuides`, `workedExamples`, `secondaryMissionFrameworks`, `secondaryMissionFamilies`, `secondaryMissionGuides` et `secondaryDecisionExamples`. `catalogProvenanceSourceId` désigne l’unique manifeste de catalogue compatible.

Chaque source comporte au minimum `id`, `kind`, `authority`, `title`, `retrievedAt`, `sha256` et un chemin local vérifiable (`relativePath` ou `archivePath`).

- Les documents `official-rule`, `official-mission`, `official-points` et `official-errata` ont `authority: "official"`, `documentVersion`, `validity` et `publishedAt` ou `documentCreatedAt`.
- Une archive GDM a `kind: "trusted-mission-archive"`, `authority: "approved-archive"` et `archivePath`.
- Une archive méta a `kind: "tournament-meta-snapshot"`, `authority: "observational"`, une `url` et une copie locale.
- Le manifeste du catalogue a `kind: "catalog-manifest"`, `authority: "local-verified"`, `catalogSchema`, `catalogDataVersion`, un `relativePath` vers `warforge-pwa/data/units/DataInfo.json` et son SHA-256. Le validateur vérifie cette empreinte et résout les identifiants contre le catalogue épinglé.
- Pour un PDF paginé, renseigner `pageCount`. Les `sourcePages` d’un profil ou d’une synergie doivent être positives, sans doublon et ne pas dépasser le nombre de pages connu.

## Scénarios et évaluations

Les axes contrôlés sont `primary-scoring`, `secondary-scoring`, `board-control`, `tempo`, `mobility`, `durability`, `damage-projection`, `resource-efficiency`, `denial` et `trading`.

Les notes d’axe sont des entiers de 0 à 4. Elles expriment une contribution contextuelle, ni probabilité de victoire ni mesure de dégâts. Chaque profil garde une base explicite, des limites, une confiance et une date `reviewBy`.

Les scénarios, dispositions et contextes de layout GDM doivent couvrir exactement les cartes archivées. Une carte GDM ne doit pas être réécrite au-delà de la limite de résumé autorisée par son pack.

Un `tacticalClaim` contient une seule conclusion tactique réutilisable, classée comme inférence : camp concerné, scénarios et layouts, affirmation, justification, préconditions, contre-jeu, compromis, effets d’axe, sources, confiance et date de revue. Un `matchupGuide` compose ces claims pour une confrontation non ordonnée de dispositions ; la matrice des cinq dispositions doit produire exactement quinze guides. Un `workedExample` est un registre pédagogique de cinq rounds, plafonné à 15 VP de primaire par round et 45 VP au total. Il n’est ni une simulation probabiliste ni une observation de performance.

Les narrations et guides Markdown sont des projections éditoriales. Ils ne deviennent jamais des sources de règles ou de points. Une liste n’est liée à un guide qu’après validation par `referenceRoster`; toute absence reste visible dans le rapport de couverture.

Les secondaires suivent le contrat détaillé du skill `warforge-secondary-mission-analysis`. Le framework porte les règles officielles du portefeuille Tactique ; les quatre familles partitionnent exactement les 18 cartes ; chaque guide compose les huit types de claims requis et au moins un exemple décisionnel à deux branches. Toute création commence en `draft` et exige une revue humaine explicite avant `reviewed`.

## Graphe de règles, profils, synergies et méta

Un `ruleNode` est un fait sourcé, et non une conclusion tactique. Il possède `kind` (`army-rule`, `detachment-rule`, `stratagem`, `enhancement`, `datasheet-ability` ou `mission-rule`), un `owner` `{ type: "unit" | "detachment", catalogId }`, des `requiresParticipants` optionnels pour les prérequis de composition, `fact`, `timing`, `target`, `activation`, `effectTags`, `sourceIds`, `sourcePages`, des `limitations` et `reviewBy`. Un nœud `selected-enhancement` doit aussi porter le nom exact `catalogEnhancementName` présent dans le catalogue épinglé. Son sélecteur cible peut restreindre la faction, les identifiants d’unité et les mots-clés requis ou exclus.

Le résolveur de graphe est volontairement limité à la composition de liste : propriétaire sélectionné, unité présente, mots-clés du catalogue et amélioration effectivement sélectionnée. Une règle ainsi résolue est **applicable à la composition**, mais elle n’est pas automatiquement active pendant la partie. Les PC, phases, distances, cibles, actions, états cachés, jets et conditions de score restent des préconditions textuelles et ne doivent jamais être présentés comme satisfaits.

Un profil d’unité ou de détachement contient `catalogDataVersion`, `catalogUnitId` ou `catalogDetachmentId`, `faction`, `title`, `roles`, `rationale`, `preconditions`, `limitations`, `axisRatings`, `sourcePages`, `sourceIds`, `sourceTier`, `confidence`, `status` et `reviewBy`. Un profil d’unité possède en plus `detachmentProfileIds` non vide : chaque identifiant doit résoudre vers un profil de détachement de même faction et de même version de catalogue ; un profil d’unité `reviewed` ne peut cibler que des détachements `reviewed`.

Une synergie est une arête d’inférence entre au moins deux participants `{ type: "unit" | "detachment", catalogId }` et une ou plusieurs règles factuelles `ruleIds`. Elle ajoute `relationKind` (`enables`, `amplifies`, `protects`, `repositions`, `denies`, `scores` ou `coordinates`), puis `claim`, `timing`, `preconditions`, `counterplay`, `tradeoffs`, `limitations`, `axisEffects`, `evidenceKind`, les éléments de preuve et `reviewBy`. Les `ruleIds` sont uniques, résolvent vers des nœuds existants et, pour une arête `reviewed`, uniquement vers des nœuds `reviewed`; les sources de l’arête doivent recouper celles de ses nœuds. `rules-supported` cite au moins une source officielle; `tested` exigerait une source de test/résultats compatible; `hypothesis` reste `needs-review`.

Un `metaSnapshot` possède une fenêtre (`id`, `coverageThrough`, nombre d’événements et de parties), des métriques de factions, des limitations et des sources `tournament-meta-snapshot`. Ne pas extrapoler au-delà de la population mesurée.

Un `victoryPlan` est une inférence expliquée liée à une seule mission principale, un profil de détachement, au moins une règle et une synergie. Il explicite ses axes prioritaires, prérequis, contre-jeux, compromis et limites. Ses `operationalStages` ordonnent des séquences conditionnelles : objectif, exécution, seuil de décision, condition d’abandon et références à des règles ou synergies déjà portées par le plan. Ses `decisionBranches` associent un signal observable, une ligne conseillée, un repli plus sûr et des garde-fous à ces mêmes références. Ces objets ne peuvent pas supposer une position, des PC, une cible, un timing ou un score acquis. Un `referenceRoster` est une liste d’exemple liée à un `victoryPlan` : son catalogue, son format, sa disposition, sa mission principale, ses détachements, ses unités, ses options et son total doivent être validables. Elle est toujours chargée dans l’application comme une copie éditable.

## Recommandations futures

Une recommandation, même vide aujourd’hui, suit ce contrat :

```json
{
  "id": "identifiant-stable",
  "title": "Conclusion conditionnelle",
  "kind": "list-construction | play-pattern | matchup-plan",
  "statement": "Conseil contextualisé, sans promesse de victoire.",
  "sourceTier": "inference | hypothesis",
  "sourceIds": ["source-resolue"],
  "confidence": "low | medium | high",
  "status": "draft | needs-review | reviewed | published",
  "scope": {
    "scenarioIds": ["optionnel"],
    "synergyIds": ["optionnel"],
    "metaSnapshotIds": ["optionnel"],
    "detachmentProfileIds": ["optionnel"]
  },
  "tradeoffs": ["coût ou contrepartie"],
  "limitations": ["condition ou incertitude"],
  "reviewBy": "YYYY-MM-DD"
}
```

Au moins une liste de `scope` doit être non vide et tous ses identifiants doivent résoudre. Une hypothèse est `needs-review`. Une recommandation `published` est une `inference`, cite une source officielle, est ancrée dans un scénario ou une synergie, et ne peut pas dépendre d’une synergie hypothétique.

## Porte de publication

Avant tout affichage ou conseil : valider la base, vérifier la version et la date des sources, relire le contexte/les limites/les contre-jeux, puis exécuter tests, lint et build de la PWA. La validation automatique assure la cohérence structurelle; la revue humaine confirme la fidélité des règles et l’utilité tactique.
