# ADR-007 — Ligne de vue sur hitboxes continues

- Statut : remplacé par ADR-008
- Date : 2026-08-21
- Plan version : 2.1.0

> Cette décision reste l'historique de l'exigence initiale. La convention de
> rayons représentatifs approuvée ensuite est définie par ADR-008.

## Contexte

Le propriétaire du projet a précisé que la ligne de vue doit pouvoir partir de
et arriver à n'importe quel point des hitboxes des figurines. Le mécanisme M3
teste seulement un produit fini de `visibilityPoints` : il reste valable pour
le duel synthétique historique, mais il ne représente pas cette exigence pour
le pilote M4.

## Décision

Pour les profils M4, une figurine est une hitbox cylindrique verticale fermée :
son disque de socle, extrudé de `z = 0` jusqu'à sa hauteur conventionnelle.
Une ligne de vue est visible si et seulement s'il existe deux points, l'un dans
la hitbox source et l'autre dans la hitbox cible, dont le segment ne traverse
aucun volume d'occlusion applicable. Un ensemble fini de rayons ne peut pas
décider ce verdict.

Le solveur de ce prédicat sera livré par `SIM-M4-T07`, avant l'assemblage de la
session M4. Il devra être déterministe, exact au sens géométrique, versionné et
produire un témoin canonique sérialisable ou une preuve d'occlusion. Aucun
maillage, échantillonnage, epsilon observable ou rayon d'affichage ne pourra
servir de verdict autoritaire.

## Conséquences

- Les `visibilityPoints` sont retirés du brouillon M4 ; `shape + height`
  définissent le domaine des extrémités de ligne de vue.
- Les valeurs M3, ses replays et ses preuves restent inchangés : ils utilisent
  l'ancien mécanisme de rayons normalisés uniquement dans leur périmètre fermé.
- `SIM-M4-T07` devient une tâche critique `implementation-complex`; M4-T04 en
  dépend.
- La politique de contact de ligne, la largeur de ligne réglementaire, les
  tangences, les trous de terrain et l'occlusion par d'autres figurines sont
  des cas obligatoires de T07. Si un cas n'est pas couvert, M4 le refuse au
  lieu de l'ignorer.
- Les diamètres et hauteurs M4 demeurent des conventions locales séparées,
  revues humainement le 2026-08-21 ; cette ADR ne les définit pas.
