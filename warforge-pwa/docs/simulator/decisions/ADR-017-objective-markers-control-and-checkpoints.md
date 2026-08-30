# ADR-017 — Pions d’objectif, contrôle et checkpoints déterministes

- Statut : accepté
- Date : 2026-08-29
- Plan version : 3.0.0
- Tâche : SIM-M8-T02

## Contexte

La session V6 connaissait les identifiants d’objectifs, sans géométrie ni
preuve permettant de calculer leur contrôle. La section `14.02` impose pourtant
un calcul à la fin de chaque phase et de chaque tour, à partir du CO de chaque
figurine à portée. La transcription officielle `14.01.01` définit le cas où
l’objectif n’est pas une zone de terrain : pion plat circulaire de 40 mm,
portée horizontale de 3 pouces et verticale de 5 pouces.

Les règles de base françaises et la transcription propriétaire ont été
archivées respectivement les 28 juillet et 28 août 2026. Ces dates restent
qualifiées `dateBasis: retrieved` ; elles ne sont pas présentées comme des
dates d’entrée en vigueur.

La disposition officielle du pilote M9 n’est pas encore archivée. M8-T02 doit
donc fournir un prédicat générique testable sans inventer ses positions, ses
zones de terrain ou son barème de score.

## Décision

Ajouter `ObjectiveMarkerV1` à la preuve de session complète. Un marqueur est
un cercle plat de 400 unités internes, avec une portée horizontale de 762 et
verticale de 1 270. Sa position, son élévation et ses sources font partie des
empreintes de compatibilité V6. Les anciennes sessions V6 peuvent omettre ce
champ additif et conservent alors une liste de géométries vide.

La présence est calculée entre le cercle du marqueur et l’empreinte autoritaire
de la figurine — cercle, capsule ou polygone convexe orienté — puis entre le
plan du marqueur et le volume vertical de la hitbox. Une tangence aux limites
est à portée. Les coordonnées d’entrée restent entières ; une distance
euclidienne calculée peut être fractionnaire et demeure une preuve explicite.

À chaque checkpoint, le moteur :

1. énumère uniquement les figurines actives des unités déployées ;
2. résout leur CO effectif, avec CO nul si l’unité est Ébranlée et application
   des modificateurs persistants source-backed ;
3. additionne le CO de chaque figurine à portée par joueur ;
4. attribue l’objectif au total strictement supérieur, ou à personne en cas
   d’égalité ;
5. identifie les unités qui contrôlent effectivement l’objectif ;
6. journalise distances, CO, totaux, égalité et contrôleur.

L’orchestration produit un événement `objective-control-resolved` avant chaque
`battle-phase-advanced`. La fin de Combat produit deux checkpoints ordonnés,
`phase-end` puis `turn-end`. Le reducer vérifie les identités, totaux et
conséquences ; le replay avec environnement physique recalcule en plus chaque
distance et refuse une preuve falsifiée.

## Limites explicites

- Les objectifs constitués d’une zone de terrain (`14.01`) attendent la
  disposition officielle M9 et un lien terrain–mission compilé.
- Les objectifs sécurisés (`14.03`) attendent une aptitude ou règle de mission
  source-backed ; M8-T02 n’invente aucune persistance du contrôle.
- Le score, les primaires, les secondaires et les règles de mission restent M9.
- Toutes les figurines du pilote sont au sol ; l’élévation du marqueur est
  néanmoins versionnée pour préserver le contrat vertical futur.

## Conséquences

- Le contrôle ne dépend d’aucun booléen ou total fourni par l’interface.
- Les égalités et le CO nul des unités Ébranlées sont sauvegardables,
  explicables et rejouables.
- Une géométrie d’objectif modifiée change les empreintes de session et ne peut
  pas être importée silencieusement dans une autre partie.
- Le nœud `coverage.terrain-objectives` reste `partial` jusqu’à M9.
