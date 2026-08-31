# ADR-023 — Compilation spatiale du layout du POC commun

- Statut : accepté
- Date : 2026-08-31
- Décideur : project-owner
- Plan version : 3.3.0

## Contexte

Le POC sans codex utilise `Disruption Mirror 1`. Ses 32 cartouches de mesure
sont vérifiés, mais ils décrivent des coordonnées d'axe indépendantes : ils ne
forment pas seize couples `(x, y)` et ne suffisent pas seuls à reconstruire les
formes du diagramme.

## Proposition technique implémentée en draft

1. Les 32 mesures sont chacune liées à un extrême, une ancre ou une
   sous-région explicite d'un des treize terrains.
2. Les contours des baseplates sont des polygones de jeu simplifiés, relus
   directement sur le diagramme et contraints par toutes les cotes qui leur
   sont applicables. Ils ne prétendent pas reproduire les irrégularités
   illustratives au pixel près.
3. Les quatorze aplats verts et quatorze aplats orange sont extraits depuis
   l'image sans mesures par leur couleur pleine, simplifiés à 3 px et conservés
   comme surfaces distinctes.
4. Les six centres d'objectif sont projetés depuis leurs pictogrammes dans le
   repère de plateau ; toute dérive pixel/plateau est bloquée par validation.
5. Les zones rouge et bleue sont compilées comme les deux triangles visibles,
   et le déploiement vérifie désormais le polygone exact plutôt que son seul
   rectangle englobant.
6. Tant que la convention ci-dessous n'est pas approuvée, les surfaces vertes
   et orange restent non exécutables : aucune hauteur ni propriété de blocage
   n'est inventée et une partie complète ne peut pas démarrer.

## Convention physique approuvée

- Baseplate : zone de terrain ; les règles de terrain V11 13.07–13.10 sont
  calculées depuis la zone et les catégories qu'elle contient.
- Aplat vert « Ruin wall » : élément de terrain dense, franchissable
  horizontalement par les figurines d'INFANTERIE du POC selon 13.06, hauteur
  conventionnelle proposée de 5" (1 270 unités).
- Aplat orange « Obstacle » : élément de terrain léger, traversable selon
  13.06, hauteur conventionnelle proposée de 2" (508 unités).
- Les zones contenant ces éléments sont occultantes selon 13.10. Les éléments
  denses appliquent aussi Plein 13.11 jusqu'à 3" du sol.
- La ligne de vue géométrique utilise les volumes colorés et la convention
  finie de points représentatifs déjà approuvée ; l'illustration de baseplate
  n'est pas, à elle seule, un volume solide.

## Décision propriétaire

Le 31 août 2026, le propriétaire a approuvé cette convention et son extension
au profil synthétique `training-infantry-32mm-v1`, exclusivement pour le
périmètre `closed-complete-game-core-poc-v1`.

## Conséquences

- `core-poc-layout.json` passe de `draft-human-review` à `covered` et compile
  28 volumes physiques exécutables.
- L'extension du profil synthétique 32 mm × 40 mm au périmètre
  `closed-complete-game-core-poc-v1` est enregistrée dans la même décision.
- L'UI et la persistance pourront alors consommer une géométrie de déploiement,
  de couvert et de visibilité stable sans dépendre d'un codex.
