# ADR-016 — Ressources de Commandement, Ébranlement et effets persistants

- Statut : accepté
- Date : 2026-08-29
- Plan version : 3.0.0
- Tâche : SIM-M8-T01

## Contexte

La boucle M7 savait entrer dans la phase de Commandement, mais ne représentait
ni ses cinq étapes, ni les Points de Commandement, ni l'état Ébranlé. Les
conséquences différées des futures aptitudes et stratagèmes exigeaient aussi un
contrat durable : un simple modificateur calculé à la volée ne peut pas être
sauvegardé, expliqué ou rejoué.

Les règles canoniques sont les sections `01.06`, `01.07` et `08.01` à `08.05`
des règles de base françaises archivées le 28 juillet 2026, ainsi que les
sections `01.02.01`, `01.02.02`, `08.03` et `08.03.01` de la transcription
officielle fournie par le propriétaire le 28 août 2026. Cette dernière date est
la date d'archivage et de revue de la transcription ; elle ne prétend pas
reconstituer une date d'entrée en vigueur absente du document.

Les références M8 conservent le champ historique `effectiveFrom` exigé par les
sauvegardes existantes, mais le qualifient explicitement avec
`dateBasis: retrieved` et `retrievedAt`. L'interface ne doit donc jamais
présenter ces dates d'archive comme des dates d'entrée en vigueur.

## Décision

Ajouter trois contrats purs et versionnés : `CommandPhaseStateV1`,
`BattleResourcesV1` et `TimedEffectV1`.

La phase de Commandement avance explicitement dans l'ordre `start`,
`gain-base-cp`, `battle-shock`, `abilities`, `end`, puis `complete`. La phase
suivante est refusée tant que cette progression n'est pas terminée. À l'étape
`08.02`, chacun des deux joueurs gagne exactement 1 PC ; cette mutation est
journalisée sans consommer le PRNG.

À l'étape `08.03`, le moteur construit une file stable, triée par identifiant,
des unités actives du joueur actif qui sont déjà Ébranlées ou à demi-effectif
ou en dessous. Une unité n'apparaît qu'une fois dans cette file. Chaque test est
une commande explicite afin de conserver la future fenêtre de Courage Insensé
(`15.04`). Le moteur jette 2D6 avec le PRNG versionné, compare le total à la
caractéristique de Commandement et journalise les deux dés, le seuil et l'état
avant/après. Une réussite retire l'état Ébranlé existant ; un échec l'ajoute ou
le conserve.

L'effectif initial est fixé par `UnitState.initialStrength`. Une unité d'une
figurine est évaluée avec ses PV restants ; une unité de plusieurs figurines
avec son nombre de figurines actives. Le pilote fermé ne comporte pas d'unité
attachée : la recomposition d'une telle unité reste une future compilation de
roster, pas une approximation de ce contrat.

Le test exigé après une Fuite Désespérée (`09.07`) devient une continuation
immédiate et bloquante. Il ne s'ouvre que si l'unité n'était pas déjà Ébranlée
et si au moins une de ses figurines a survécu,
ne peut pas être contourné par une autre commande et consomme exactement les
deux tirages du test. Une unité Ébranlée ne peut pas choisir la Retraite en Bon
Ordre.

Un `TimedEffectV1` conserve une identité stable, sa cible, un modificateur
typé et sourcé, son moment d'application et son éventuelle limite exacte. Les
moments utilisent round, tour, phase et frontière `start`/`end`. Les effets dus
expirent automatiquement lors des étapes de Commandement et des transitions de
phase ; les identifiants expirés et leur frontière sont portés par l'événement
qui franchit cette frontière. Les réserves et transports futurs ne supprimeront
pas ces effets : leur continuité est celle de `01.02.02`.

`SimulationSaveV6.environment` publie les versions de ces trois contrats. Les
nouvelles sauvegardes les écrivent toujours ; elles sont obligatoires dès que
le journal contient un événement M8. Un journal V6 antérieur, sans événement
M8 et sans ces champs additifs, reste lisible.

L'algèbre `TimedEffectV1` est une infrastructure pure sans producteur
d'événement dans le flux actuel. Aucune commande UI, aucun événement générique
et aucun replay ne peuvent donc introduire un modificateur durable. Courage
insensé et Contre-offensive n'en produisent pas. Toute aptitude future qui en
aura besoin devra ajouter un producteur typé, une vérification autoritaire, des
tests de falsification et, si le journal public évolue, une nouvelle décision
de versionnement avant d'être annoncée couverte.

## Conséquences

- Les PC, tests, statuts et échéances survivent aux sauvegardes et au replay.
- Un refus ou une étape sans jet ne consomme aucune entropie.
- Les événements recalculent leurs conséquences au replay ; modifier un gain
  de PC, un jet, une file ou une expiration fait échouer la réduction.
- Le Contrôle d'Objectif nul d'une unité Ébranlée sera consommé par M8-T02 ;
  l'interdiction de la cibler avec un stratagème sera consommée par M8-T03.
- Le contrat stocke les modificateurs durables, mais leur application à une
  caractéristique particulière demeure du ressort du résolveur typé qui les a
  créés.
