# État du programme — Simulateur tactique Warforge

Plan : 3.4.0 · Dernière mise à jour : 2026-08-31T16:00:32.871Z

## Avancement global

- Jalons acceptés : 9/12
- Tâches terminées : 43/53
- Critères satisfaits : 49/58
- Validations : 136 réussie(s), 4 échouée(s), 19 périmée(s)
- Santé du workspace : healthy (2026-08-31T15:09:25.217Z)

## Jalons

| ID | Jalon | État | Tâches terminées |
| --- | --- | --- | --- |
| M0 | Gouvernance et politique IA | accepted | 4/4 |
| M1 | Fondations techniques | accepted | 3/3 |
| M2 | Laboratoire spatial | accepted | 3/3 |
| M3 | Vertical slice de tir | accepted | 3/3 |
| M4 | Duel réel pilote Salamanders–Blood Angels | accepted | 8/8 |
| M5 | Tir avancé sur fixtures | accepted | 6/6 |
| M6 | Fondations de partie complète | accepted | 4/4 |
| M7 | Boucle de bataille | accepted | 5/5 |
| M8 | Ressources et objectifs | accepted | 4/4 |
| M9 | POC technique cinq rounds et interface | in_progress | 3/4 |
| M10 | Fidélité commune, réserves, transports et déploiements spéciaux | planned | 0/5 |
| M11 | Relance codex et déploiement progressif du catalogue | planned | 0/4 |

## Capacités produit

| Capacité | État | Portée prouvée |
| --- | --- | --- |
| Laboratoire spatial | available | Géométrie M2 déterministe et verdicts explicables. |
| Duel synthétique de tir | available | M3 jouable, sauvegardable et rejouable. |
| Duel réel mouvement/tir | available | M4 fermé : Salamanders–Blood Angels, 4 unités et 14 figurines. |
| Primitives de tir avancées | available | M5 sur fixtures sourcées ; profils alternatifs réels différés. |
| POC technique cinq rounds | partial | Cible M9 fixture-only : boucle, ressources, objectifs, mission et score couverts ; quatre stratagèmes communs restent explicitement différés avant toute promesse de partie V11 complète. |
| Toute liste du catalogue | planned | Après le POC : base GDM fin août, nouveau Codex Orks, nouveau Codex Space Marines puis armées par lots audités. |

## Reprise

- Tâche courante : SIM-M9-T04 — Playtester et accepter le POC technique (in_progress)
- Profil d'exécution : milestone-audit
- Coût estimé : L
- Tranche atomique : SIM-M9-T04-S01
- Dernier travail : Les gates finales de SIM-M9-T04 sont vertes : pnpm verify, 539 tests, 4 parcours Chromium et build PWA. Le serveur local de playtest est prêt sur le POC technique.
- Prochaine action : Le propriétaire exécute le playtest guidé à http://127.0.0.1:4173/#simulator et signale toute divergence, ou confirme que le parcours, les quatre limites, la sauvegarde, la reprise et le replay sont conformes.
- Fichiers concernés : src/simulator/ui/CorePocTechnicalPage.tsx, tests/browser/simulator.spec.ts, docs/simulator/project-state.json

## Blocages et questions

