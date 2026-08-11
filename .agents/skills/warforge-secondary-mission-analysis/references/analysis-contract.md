# Contrat d’analyse des missions secondaires V11

## Sources et responsabilités

- Le Compagnon officiel porte le framework Tactique : deux cartes piochées à chaque phase de Commandement, conservation des cartes non accomplies/non défaussées, résolution et défausse des cartes accomplies, défausse volontaire de fin de tour, remplacement unique à 1 PC et plafonds de PdV.
- L’archive GDM approuvée non officielle porte les conditions, fenêtres, valeurs tactiques et clauses « Lorsque piochée » propres aux cartes.
- `data/strategy/knowledge-base.json` porte les inférences stratégiques. Le Markdown et l’interface n’en sont que des projections.

## Composition V5

Chaque guide secondaire français en mode `tactical` référence exactement une mission et une famille. Il contient au moins un claim revu de chacun des types suivants :

- `scoring-model`
- `list-construction`
- `advantage`
- `pitfall`
- `counterplay`
- `play-pattern`
- `tradeoff`
- `decision-rule`

Les familles partitionnent exactement les 18 missions : destruction ciblée, contrôle d’objectifs, projection territoriale, actions et opérations. Les claims transversaux peuvent porter plusieurs `scenarioIds` d’une même famille. Aucune relation par paire n’est créée.

## Capacités contrôlées

`action-capacity`, `concentrated-damage`, `distributed-damage`, `durable-presence`, `independent-units`, `objective-control`, `screening`, `target-access`, `territorial-projection`, `unit-redundancy`.

Une exigence de capacité décrit un besoin ; elle ne certifie jamais qu’une liste le satisfait.

## Exemples décisionnels

Chaque exemple comprend `setup`, `assumptions`, `decisionPoint`, au moins deux branches conditionnelles et `lessonClaimIds`. Il ne contient aucun jet de dés simulé, probabilité ou score prédit. Les branches doivent distinguer au besoin :

1. accomplir maintenant ou conserver avec un horizon explicite ;
2. défausser volontairement en fin de son propre tour pour 1 PC ;
3. consommer le remplacement immédiat à 1 PC, disponible une fois par bataille ;
4. appliquer une clause particulière « Lorsque piochée » si la carte en possède une.

## Porte de revue

Avant `reviewed`, confirmer : source et empreinte résolues, mode Tactique uniquement, fenêtre et plafond exacts, huit types de claims, opportunité, menace, besoin de liste, séquence de pilotage, exemple à deux branches, compatibilité des `scenarioIds`, et absence de prédiction ou d’invention. Une modification du pack ou de l’archive invalide la revue.
