# ADR-009 — Règles minimales M4 avant l'interface de duel

- Statut : accepté
- Date : 2026-08-21
- Plan version : 2.3.0

## Contexte

`SIM-M4-T04` assemble les deux rosters réels approuvés et leur matrice de
compatibilité. Cette matrice est exhaustive et, à juste titre, incompatible :
le moteur ne sait pas encore exécuter Oath of Moment, la convention de ligne
de vue M4, le garde du mot-clé [PISTOL], le couvert et les restrictions de
mouvement correspondantes. L'ordre initial plaçait pourtant le parcours UI
avant cette intégration. Une UI ne peut rendre jouable une session que le
moteur doit refuser.

## Décision

Ajouter `SIM-M4-T08` entre T04 et T05. Cette tâche livre, pour le seul scénario
`real-roster-shooting-duel-v1`, les contrats autoritaires, sources, golden
tests, sauvegarde et replay nécessaires à :

- Oath of Moment dans sa variante Salamanders et Blood Angels formalisée ;
- la convention `m4-sampled-cylinder-los-v1` d'ADR-008 ;
- le garde [PISTOL] et l'interdiction de finir le mouvement dans l'Engagement
  Range du scénario ;
- le prédicat de couvert explicitement requis par le terrain M4.

La tâche ne généralise pas ces capacités à tout le catalogue. M5 conserve le
mandat d'industrialiser les modificateurs, relances, mots-clés et décisions de
tir au-delà de ce pilote. T05 dépend désormais de T08.

## Conséquences

- La matrice de T04 reste négative tant que T08 n'a pas fourni les preuves
  exécutables correspondantes ; aucun parcours UI ne contourne ce refus.
- Les règles M4 restent liées à leurs sources locales versionnées et toute
  approximation non couverte est refusée avant consommation du PRNG.
- La promesse produit de M4 ne change pas : elle demeure un duel réel fermé,
  pas un support global des Space Marines, Salamanders ou Blood Angels.
