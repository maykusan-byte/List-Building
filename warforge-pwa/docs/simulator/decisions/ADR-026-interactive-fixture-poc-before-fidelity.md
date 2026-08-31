# ADR-026 — POC interactif fixture-only avant la fidélité commune

- Statut : accepté
- Date : 2026-08-31
- Décideur : project-owner
- Plan version : 3.5.0
- Autorisation : « J’approuve le jalon XL POC interactif »

## Contexte

M9 prouve la boucle déterministe de cinq rounds, le score, la sauvegarde et le
replay, mais son interface principale automatise les décisions. Les moteurs M7
et M8 savent déjà valider déploiement, mouvement, tir, charge, combat,
ressources et objectifs sur des fixtures ; ils ne sont pas encore assemblés
dans un même parcours tactique manipulable par deux joueurs.

Commencer les codex ou les zones spéciales avant d'éprouver cette interaction
risquerait d'accumuler du contenu autour d'une expérience de jeu non validée.

## Décision

Un nouveau M10 livre un **POC interactif fixture-only** avant la fidélité
commune et les codex. Il réutilise le scénario, le layout, les profils et la
couverture M9. Il ne promeut aucune unité du catalogue et ne modifie pas la
liste des quatre limitations ADR-025.

Deux joueurs sur le même appareil peuvent :

- sélectionner et déployer les figurines sur le plateau 2,5D ;
- choisir une unité et son type de mouvement, tracer les trajectoires des
  figurines, prévisualiser la légalité puis confirmer la commande ;
- choisir tireur, arme et cible et voir portée, ligne de vue, couvert, jets,
  allocations et pertes ;
- déclarer une charge, déplacer les figurines avec la distance obtenue, puis
  choisir les combats, pile-in, attaques et consolidation ;
- résoudre les décisions couvertes, passer ou terminer les phases, consulter
  CP, objectifs, score et journal ;
- sauvegarder, reprendre et rejouer exactement la partie.

L'UI ne fabrique aucun verdict : elle construit des intentions et des
`GameCommand`, puis affiche événements, décisions ou `RuleRejection` produits
par l'orchestration. Les brouillons de déplacement restent de l'état de vue ;
seule leur confirmation devient un événement. Pixi reste à rendu à la demande
et la géométrie statique du layout n'est pas recalculée à chaque frame.

Le jalon XL est découpé en sept tâches L : contrat interactif, plateau et
déploiement, mouvement, tir, charge/combat, partie complète/persistance, puis
playtest et audit. Un playtest humain court suit chaque vertical slice utile.

## Limites conscientes

- Le POC est complet côté interaction couverte, pas côté règles V11.
- Relance de Commandement, Défi Épique, Tir en État d'Alerte/Tir Réflexe et
  Intervention Héroïque restent visibles et indisponibles jusqu'au jalon de
  fidélité commune.
- Aucun codex, détachement, aptitude de datasheet, réserve ou transport n'est
  ajouté au POC interactif.
- Les actions non couvertes sont refusées explicitement ; elles ne sont jamais
  ignorées pour permettre d'avancer la phase.

## Conséquences

- L'ancien M10 devient M11 et l'ancien M11 devient M12.
- La prochaine capacité produit est le POC interactif, avant toute extension
  de contenu.
- Le coût IA est concentré sur les adaptateurs et l'interface ; les règles
  déjà testées ne sont pas reformalisées.

