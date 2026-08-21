# ADR-008 — Ligne de vue par points représentatifs de cylindre

- Statut : accepté
- Date : 2026-08-21
- Plan version : 2.2.0
- Remplace : ADR-007-continuous-hitbox-line-of-sight

## Contexte

ADR-007 retenait une ligne de vue existentielle entre n'importe quels points
de deux hitboxes cylindriques continues. Cette exigence impose un solveur de
géométrie réelle exact et un backend WebAssembly additionnel. Le propriétaire
du projet a approuvé le remplacement de cette exigence par un nombre fini de
points représentatifs, afin de conserver une PWA locale, déterministe et
auditable sans moteur algébrique externe.

## Décision

Pour le pilote M4, Warforge applique la convention locale
`m4-sampled-cylinder-los-v1` version `1.0.0`. Une hitbox est toujours un
cylindre vertical fermé, mais sa visibilité est décidée seulement sur quinze
points générés depuis son rayon et sa hauteur :

1. hauteurs `bottom`, `middle`, `top` : `0`, `height / 2`, `height` ;
2. positions horizontales `center`, `east`, `north`, `west`, `south` :
   `(0,0)`, `(r,0)`, `(0,r)`, `(-r,0)`, `(0,-r)`.

Les niveaux sont évalués avant les positions, dans cet ordre exact. Une cible
est visible si le premier rayon dégagé du produit cartésien ordonné
source-major/cible-minor est dégagé. Chaque paire compte donc 225 rayons. Les
extrémités des rayons et les volumes de terrain sont fermés : tout contact ou
tangence avec un volume d'occlusion bloque le rayon.

La largeur de rayon vaut exactement `0` unité monde. Les seuls occluders sont
des volumes de terrain statiques `TerrainBlocker` ; une figurine, un blocker
mobile ou un champ supplémentaire (`rayWidth`, `modelOcclusion`, etc.) est
refusé au lieu d'être interprété silencieusement.

Ce verdict est exact pour ces 225 rayons, mais c'est une approximation locale
et versionnée des hitboxes continues ; ce n'est ni une affirmation des règles
officielles de Warhammer 40,000, ni un verdict de couvert, ni une mesure de
visibilité intégrale d'une figurine.

## Conséquences

- La politique, les points, leur ordre, le premier témoin clair et les
  bloqueurs sont inclus dans les preuves et empreintes M4 ; toute modification
  invalide replay et reprise.
- M3 reste inchangé : ses deux `visibilityPoints` historiques et ses replays
  ne sont ni reclassifiés ni convertis vers cette convention.
- Le résultat LoS M4 ne calcule pas le couvert. Tant qu'un prédicat de couvert
  séparé n'est pas formalisé, une session M4 qui en a besoin est refusée avant
  tout tir et toute consommation de PRNG.
- T07 n'accepte que les volumes statiques déjà représentables par
  `TerrainBlocker` ; géométrie inconnue, blockers mobiles, largeur de rayon
  non nulle ou occlusion par les autres figurines sont refusés explicitement.
- Ajouter, retirer ou réordonner un point, modifier la convention de contact,
  ou passer à une autre méthode de visibilité exige une nouvelle ADR et une
  nouvelle version de politique.
