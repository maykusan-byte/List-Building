# ADR-022 — POC de partie complète sans contenu de codex

- Statut : accepté
- Date : 2026-08-31
- Décideur : project-owner
- Plan version : 3.3.0

## Contexte

Le pilote fermé M9 devait initialement compiler des rosters Salamanders et
Blood Angels avec leurs loadouts, règles d'armée, détachements, aptitudes et
stratagèmes. Cette compilation serait coûteuse et rapidement périmée : un
nouveau Codex Space Marines est annoncé à court terme, un nouveau Codex Orks
doit paraître début septembre et les mises à jour de fin août devront être
reprises depuis l'archive texte GDM 2026 approuvée par le projet.

L'objectif prioritaire n'est pas encore de prouver la fidélité d'une faction.
Il est de prouver qu'une partie complète de cinq rounds peut être jouée de
bout en bout dans l'application avec un petit nombre d'unités choisies.

## Décision

M9 livre un POC `closed-complete-game-core-poc-v1` limité aux règles communes
V11 et à la mission fermée déjà sourcées. Les forces utilisent des profils
figés de fixture, versionnés uniquement pour ce POC. Elles peuvent conserver
des libellés reconnaissables pour le playtest, mais :

- elles ne portent aucun `supportedUnitId` du catalogue ;
- elles ne prouvent la couverture d'aucune datasheet ni d'aucun codex ;
- elles n'exécutent aucune règle d'armée, de détachement, d'amélioration,
  aptitude de datasheet ou stratagème de faction ;
- l'interface les identifie explicitement comme profils POC figés ;
- seules les règles communes réellement atteignables dans le scénario
  peuvent être déclarées couvertes.

Le graphe historique `closed-complete-game-pilot-v1`, fondé sur des rosters
réels Salamanders–Blood Angels, reste versionné comme travail préparatoire
différé. Ses gaps de roster, profils physiques, détachement et contenu hors
règles communes ne bloquent pas le POC M9 et ne doivent pas être résolus
artificiellement.

Après acceptation du POC, le redémarrage du contenu d'armée suit cette file :

1. figer la base de mises à jour de fin août depuis GDM 2026 ;
2. intégrer le nouveau Codex Orks depuis le fichier texte préparé par le
   propriétaire ;
3. intégrer le nouveau Codex Space Marines à sa sortie, sans investir dans
   les règles de détachement aujourd'hui destinées à être remplacées ;
4. ajouter ensuite les armées une par une par packs sourcés et audités.

Chaque pack futur restera refusé hors de sa couverture exacte. GDM 2026 est
une autorité approuvée par le projet pour les mises à jour qu'il archive, sans
être présenté comme une publication officielle Games Workshop.

## Conséquences

- Aucun crédit de développement M9 n'est consacré aux détachements ou codex.
- Le POC valide la boucle de jeu, la géométrie, la mission, le score, l'UI et
  le replay, pas la fidélité d'une armée publiée.
- Les stratagèmes communs atteignables restent dans le périmètre ; les règles
  de faction en sont totalement exclues.
- La matrice de couverture du POC doit être distincte du graphe historique de
  rosters réels afin de ne produire aucune fausse promesse.
- Le playtest humain M9 demeure la contribution manuelle la plus rentable.
