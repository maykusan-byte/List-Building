# ADR-011 — Relances génériques interrompues dans la sauvegarde V3

- Statut : accepté
- Date : 2026-08-24
- Plan version : 2.3.2

## Contexte

Les captures officielles de `01.05.02 — Relances`, archivées dans le corpus
local le 2026-08-24, définissent une relance optionnelle de certains ou tous
les dés concernés, avant les modificateurs, et limitent chaque dé à une seule
relance. Elles établissent également qu'un dé relancé reste un jet de dé. La
règle `24.38 — [JUMELÉ]` accorde cette option aux jets de blessure de chaque
attaque de cette arme.

Une décision de conserver ou relancer un dé intervient après le résultat
initial et peut donc interrompre une résolution. La persistance V2 ne connaît
pas ce journal. V3, introduit par ADR-010, porte déjà des interruptions de tir
autoritaires, avec les empreintes d'environnement requises au replay.

## Décision

Étendre `SimulationSaveV3`, sans migrer V1 ni V2, aux événements de la fixture
`simulator.fixture-generic-rerolls-v1`. Pour chaque D6 autorisé, l'orchestrateur
ouvre dans l'ordre canonique une `DecisionRequest` `keep`/`reroll`. Seul le
choix `reroll` consomme un nouveau D6 ; la clé du dé est ensuite close. Les
modificateurs sont appliqués après ce choix et le résultat relancé conserve les
déclencheurs critiques normaux.

La provenance du mécanisme provient toujours de `01.05.02`. Une fenêtre
supplémentaire requiert en plus sa règle porteuse : `[JUMELÉ]` joint donc
`01.05.02` et `24.38`. La fixture refuse explicitement les jets additifs,
profils réels M4, multi-profils, caractéristiques aléatoires et cumul avec
les autres interruptions non prévues.

## Conséquences

- V1 et V2 refusent tout événement ou état interrompu de relance ; V3 exporte,
  importe, autosauvegarde et rejoue les états en attente et terminés.
- Les anciens journaux V3 restent lisibles : cette extension ajoute des types
  d'événements sans transformer les événements létaux existants.
- Le moteur ne traite pas toute arme comme relançable : une provenance et une
  fenêtre autoritaires restent exigées avant toute décision ou consommation du
  PRNG.
- La couverture est limitée à la fixture testée. L'intégration d'un équipement
  réel reste soumise à l'approbation de loadout et à la matrice de M4/M6.
