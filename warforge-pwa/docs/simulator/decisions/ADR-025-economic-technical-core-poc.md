# ADR-025 — POC technique économique et limites des stratagèmes communs

- Statut : accepté
- Date : 2026-08-31
- Décideur : project-owner
- Plan version : 3.4.0
- Tâche : SIM-M9-T03

## Contexte

Le moteur M8 couvre Courage Insensé (15.04) et Contre-offensive (15.12).
Quatre autres stratagèmes de base sont atteignables avec les fixtures M9 mais
nécessitent des extensions multi-couches importantes : Relance de Commandement
(15.02), Défi Épique (15.03), Tir en État d'Alerte/Tir Réflexe (15.08–15.09)
et Intervention Héroïque (15.11).

Les implémenter avant de tester l'assemblage de la boucle de cinq rounds, du
score, de l'interface et de la sauvegarde ferait passer SIM-M9-T03 de L à XL.
Le propriétaire a choisi explicitement le 2026-08-31 un POC technique
économique afin de valider d'abord cette intégration.

## Décision

M9 livre un **POC technique**, et non une démonstration fidèle de toutes les
règles communes atteignables. Il autorise uniquement les deux stratagèmes déjà
couverts par ADR-018. Les quatre capacités suivantes sont versionnées comme
limitations non exécutables et affichées dans l'interface :

- `core-stratagem.command-reroll` — Relance de Commandement, 15.02 ;
- `core-stratagem.epic-challenge` — Défi Épique, 15.03 ;
- `core-stratagem.overwatch` — Tir en État d'Alerte/Tir Réflexe, 15.08–15.09 ;
- `core-stratagem.heroic-intervention` — Intervention Héroïque, 15.11.

Le runtime ne crée aucun bouton, événement ou approximation pour ces règles.
Il peut déclarer la session technique compatible uniquement si la liste exacte
des quatre limitations, les profils fixture-only, la mission, le terrain et
l'interface sont validés. Cette compatibilité signifie « exécutable dans le
périmètre technique déclaré », jamais « partie V11 complète fidèle ».

La dette de fidélité devient une tâche XL explicite de M10, avant les codex.
Elle doit être réévaluée et approuvée avant exécution conformément à la
politique de coût. M9-T04 playteste et accepte seulement le POC technique.

## Conséquences

- La boucle, le score, le journal et `SimulationSaveV6` peuvent être éprouvés
  maintenant, sans implémentation jetable de quatre règles complexes.
- L'interface et le statut produit portent en permanence la limite de
  couverture ; aucune promesse « partie complète V11 » n'est faite à M9.
- Les deux stratagèmes couverts restent disponibles au moteur dans leurs
  fenêtres existantes ; l'interface technique n'est pas tenue de provoquer
  artificiellement ces fenêtres pendant son parcours automatique.
- Le travail de codex M11 reste postérieur à la fermeture de la dette commune
  et aux zones spéciales de M10.
