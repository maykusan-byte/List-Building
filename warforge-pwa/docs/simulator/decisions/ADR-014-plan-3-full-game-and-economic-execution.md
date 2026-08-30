# ADR-014 — Plan 3, partie complète fermée et exécution économique

- Statut : accepté
- Date : 2026-08-27
- Plan version : 3.0.0
- Policy version : 2.0.0

## Contexte

Après M4, l'extension du tir M5 a montré deux risques. D'une part, une tâche
large pouvait rester longtemps ouverte et rendre la reprise coûteuse. D'autre
part, le plan 2.3.4 exigeait que les capacités avancées de fixture soient
exposées aux rosters M4, alors que leurs profils alternatifs n'étaient ni
approuvés ni couverts. Cette contradiction aurait poussé à développer une UI
jetable ou à annoncer une couverture inexistante.

L'objectif produit prioritaire est désormais une première partie complète
fermée, non l'élargissement immédiat des factions. La consommation Codex doit
être proportionnée : les tâches mécaniques ne nécessitent pas Sol, les
délégations ont un coût de supervision, et la collecte humaine est préférable
pour les captures officielles et les playtests.

## Décision

Adopter le plan 3.0.0 et le tracker `warforge-simulator-project/v2`.

Le tracker porte des tranches atomiques, une classe de coût `S/M/L/XL`, une
alternative manuelle, les sources et ADR, les chemins autorisés, les gates
attendues, les exécutions réelles et la santé du workspace. Les commandes
`brief` et `health` rendent ces informations utilisables sans historique de
conversation. `STATUS.md` affiche aussi les capacités produit réellement
disponibles.

Adopter la politique de routage 2.0.0 : Luna low pour le mécanique et la
transcription sans interprétation, Terra medium pour l'implémentation bornée,
Terra high pour le moteur complexe, Sol high pour architecture, ambiguïtés et
audits. Aucune délégation n'est la valeur par défaut, une seule est autorisée
normalement, et xhigh/max exigent un gain mesuré. Le coordinateur prévient
avant L/XL et obtient l'accord du propriétaire avant XL.

Clore M5 sur ses primitives/fixtures auditées et les régressions M4. Les
profils alternatifs réels restent différés. Réordonner M6 à M9 pour livrer un
pilote fermé de cinq rounds : fondations et Save V6, boucle de bataille,
ressources/objectifs, puis mission/score/UI.

Le pilote candidat comporte trois unités par camp et une mission fixe. Les
données de mission restent draft jusqu'à réception de captures officielles
complètes. Les règles réellement incomplètes sont complétées uniquement par
un arbitrage humain versionné dans un registre dédié.

## Conséquences

- La reprise est plus courte et une dérive hors périmètre devient visible.
- Une tâche L ou XL ne peut plus commencer sans information de coût adaptée.
- L'audit M5 ne demande plus une exposition UI contradictoire des fixtures.
- `SimulationSaveV6` devient l'enveloppe stable de partie complète ; V1–V5
  restent lisibles et ne sont pas migrées implicitement en sessions V6.
- La mission M9 est bloquée par ses sources officielles, mais ce blocage
  n'empêche pas de construire les contrats et la boucle génériques M6–M8.
- Aucun travail anti-contournement hostile n'est planifié ; les validations
  protègent la correction normale, les versions et les invariants.
