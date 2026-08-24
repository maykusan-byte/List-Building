# État du programme — Simulateur tactique Warforge

Plan : 2.3.3 · Dernière mise à jour : 2026-08-24T12:34:33.210Z

## Avancement global

- Jalons acceptés : 5/12
- Tâches terminées : 24/52
- Critères satisfaits : 26/54
- Validations : 52 réussie(s), 1 échouée(s), 10 périmée(s)

## Jalons

| ID | Jalon | État | Tâches terminées |
| --- | --- | --- | --- |
| M0 | Gouvernance et politique IA | accepted | 4/4 |
| M1 | Fondations techniques | accepted | 3/3 |
| M2 | Laboratoire spatial | accepted | 3/3 |
| M3 | Vertical slice de tir | accepted | 3/3 |
| M4 | Duel réel pilote Salamanders–Blood Angels | accepted | 8/8 |
| M5 | Tir étendu fiable | in_progress | 3/6 |
| M6 | Extension des forces pilotes | planned | 0/4 |
| M7 | Charge et Combat | planned | 0/5 |
| M8 | Commandement, statuts et objectifs | planned | 0/4 |
| M9 | Missions et score | planned | 0/4 |
| M10 | Réserves, transports et déploiements spéciaux | planned | 0/4 |
| M11 | Déploiement progressif du catalogue | planned | 0/4 |

## Reprise

- Tâche courante : SIM-M5-T04 — Couvrir sauvegardes et dégâts étendus (in_progress)
- Profil d'exécution : implementation-complex
- Dernier travail : ADR-012 ouvre SimulationSaveV4 ; la revue indépendante de formalisation confirme les sources de T04, l’implémentation fixture-only est en cours.
- Prochaine action : Revalider SIM-M5-T04 avant toute clôture.
- Fichiers concernés : docs/simulator/decisions/ADR-012-extended-damage-and-save-v4.md, docs/simulator/m5-shooting-capability-matrix.md, src/simulator/domain/types.ts, src/simulator/domain/reducer.ts, src/simulator/domain/serialization.ts, src/simulator/rules/shooting.ts, src/simulator/orchestration/shooting.ts, src/simulator/persistence/autosave.ts

## Blocages et questions

