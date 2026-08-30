# ADR-013 — Déclarations de tir avancé et sauvegarde V5

- Statut : accepté
- Date : 2026-08-26
- Plan version : 2.3.4

## Contexte

`SIM-M5-T05` introduit un plan de tir où une instance physique d'arme est
déclarée avec sa cible et un ordre de résolution. Cette déclaration est
différente du tir mono-cible de M3/M4 et des continuations V3/V4 : elle doit
rester visible au replay avec les preuves de portée et de ligne de vue de
chaque instance.

Les règles locales `04.01` à `04.03` (pp. 16–17) permettent de choisir une ou
plusieurs armes de tir pour chaque figurine, une cible ennemie unique pour
chaque arme, puis l'ordre de résolution des unités ciblées. `04.03.01` et
`04.03.03` précisent respectivement les groupes d'attaques identiques et le
reciblage lorsqu'une cible initialement éligible ne l'est plus.

Un événement de déclaration multi-cible est nouveau pour les lecteurs V4.
L'ajouter sans version de sauvegarde rendrait un journal apparemment V4
ininterprétable par une version précédente, même lorsqu'il est résolu de façon
atomique et sans décision en attente.

## Décision

Créer `SimulationSaveV5` pour les événements issus d'une déclaration de tir
avancé. Les versions V1 à V4 restent importables selon leurs contrats, mais
refusent explicitement un journal qui contient une telle déclaration ou une
continuation de décision T05.

Le premier contrat V5 de split fire est une fixture bornée : il déclare des
instances physiques stables `modelId:weaponProfileId:instanceIndex`, chacune
vers une cible initiale unique. Toutes les instances, cibles, distances et
visibilités sont validées par l'orchestrateur avant le premier dé. Toute
déclaration invalide laisse l'état et le PRNG inchangés. L'événement conserve
le plan, l'ordre, les résultats par cible et les états PRNG avant/après ; son
replay reconstruit la commande et vérifie à nouveau toutes les preuves.

V5 est également le seul format qui pourra porter les fenêtres de décision
T05 (ordre de résolution, reciblage et occurrences d'aptitudes dupliquées),
une fois leurs contrats sourcés et testés. La disponibilité de V5 ne promeut
ni les profils alternatifs d'une même arme ni un loadout réel M4.

## Conséquences

- Toute exportation, importation, autosauvegarde et vérification de replay
  d'un journal T05 utilise V5 ; les anciens formats gardent leur lecture
  rétrocompatible sans migration implicite.
- Le tir multi-cible ne généralise pas les interactions T03/T04 : une
  combinaison non couverte est refusée avant PRNG.
- Les profils d'arme multiples restent bloqués jusqu'à l'archivage de leur
  référence officielle complète, et les nouvelles options réelles exigent
  ensuite une approbation humaine versionnée.
