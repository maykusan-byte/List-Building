# Méthodologie du rapport de détachements

Version : `warforge-detachment-inventory-methodology/v1.0.0`  
Snapshot : 2026-08-11  
Catalogue : 1.2.13.0  
Moteur statistique : warforge-statistics/v1.1.0

## Nature des résultats

Les règles, coûts, missions et caractéristiques du catalogue sont des faits versionnés. Les dégâts, durabilités, distances et probabilités proviennent du moteur exact Warforge. Les scores de détachement, noyaux et alternatives sont des **inférences préliminaires** : ils ne constituent ni un taux de victoire, ni la certification qu’une condition de jeu sera satisfaite.

## Score sur 100

- 20 % missions principales ;
- 25 % portefeuille de 18 missions secondaires ;
- 20 % adéquation de l’inventaire ;
- 20 % règle et stratagèmes ;
- 10 % optimisations ;
- 5 % flexibilité et redondance.

Les portefeuilles de missions utilisent `0,60 × moyenne + 0,40 × P25`. Les combinaisons sont recalculées sur leur union réelle. Les égalités sont départagées par couverture, flexibilité, coût en DP puis identifiant stable.

## Capacités secondaires

- `action-capacity`
- `concentrated-damage`
- `distributed-damage`
- `durable-presence`
- `independent-units`
- `objective-control`
- `screening`
- `target-access`
- `territorial-projection`
- `unit-redundancy`

Chaque besoin de capacité provient des guides secondaires revus. Il ne certifie pas qu’une liste complète satisfait la mission. Les profils d’unités sont comparés au sein de l’inventaire de la faction ; les percentiles sont donc contextuels.

## Distances et mots-clés

Les courbes utilisent 0, 9, 12, 18, 24 et 36 pouces contre la cible Infanterie versionnée. À 0 pouce, Pistol et mêlée restent séparés. Hors engagement, Pistol et autres armes de tir sont exclusifs pour l’infanterie. Rapid Fire et Melta s’activent à demi-portée inclusive conformément aux hypothèses du moteur warforge-statistics/v1.1.0.

## Couverture et limites

Une règle reliée à un nœud stratégique revu est supportée. Une condition reconnue par les champs structurés du catalogue est partielle. Un texte sans traduction analytique contrôlée est non supporté et abaisse la couverture ; il n’est jamais appliqué silencieusement. Aucun PC, terrain, placement, ligne de vue, portée, cible, phase ou résultat de dé n’est supposé acquis.

## Calibration du portefeuille

Une capacité de portefeuille combine 55 % de la moyenne des trois meilleures unités, 25 % de la médiane de l’inventaire et 20 % de la profondeur au-dessus du 60e percentile. Cette calibration empêche trois valeurs extrêmes de produire seules un 100/100.
