# Contrat de connaissance stratégique Warforge

## Périmètre et emplacement

Ce contrat prépare une future source versionnée
warforge-pwa/data/strategy/knowledge-base.json. Aucun fichier de ce domaine
n'est encore chargé par la PWA. Lors de l'intégration, le fichier source devra
être synchronisé vers une copie publique générée et validé par le script fourni.

Le document porte sur la V11 uniquement. Sa compatibilité épingle :

- catalogSchema : warforge-catalog/v2 ;
- catalogDataVersion : valeur de data/units/DataInfo.json:Version ;
- missionPackIds : identifiants de data/missions/mission-packs.json.

Une unité ou un détachement est référencé par son identifiant normalisé
(book-…:unit:n ou book-…:detachment:n), jamais par son nom affiché. Ces
identifiants sont stables seulement pour la version de catalogue épinglée.

## Strates de connaissance

| Strate | Objet | Niveau de confiance possible | Exigence minimale |
| --- | --- | --- | --- |
| Fait officiel | règle, points, catalogue, mission, FAQ | élevé | source officielle, version/date et empreinte |
| Observation | résultats d'événement ou playtest | faible à élevé | population, période, méthode et archive |
| Inférence | rôle, synergie, plan de jeu | faible à élevé | sources qui la soutiennent, conditions et limites |
| Hypothèse | piste à tester | faible | protocole de test ; jamais une recommandation publiée |

Ne fusionnez pas ces strates. Une source communautaire peut soutenir une
inférence, mais ne devient pas une règle officielle.

## Document racine

Le fichier utilise schemaVersion: "warforge-strategy-knowledge/v1" et contient :

| Champ | Rôle |
| --- | --- |
| knowledgeVersion, updatedAt, status | cycle de vie de la base |
| compatibility | édition, catalogue et packs de mission compatibles |
| sources | registre de preuves, daté et archivé |
| scenarios | profils de missions et axes de victoire |
| unitProfiles, detachmentProfiles | évaluations contextuelles liées au catalogue |
| synergies | interactions et contreparties explicites |
| metaSnapshots | mesures datées, jamais une impression non chiffrée |
| recommendations | conclusions dérivées, contextualisées et révisables |

Le statut initial skeleton autorise seulement une structure vide. Utilisez
draft, reviewed ou published dès que des enregistrements apparaissent.

## Sources

Chaque entrée sources possède un identifiant stable, un type, une autorité, une
date de publication, une date de récupération, un unique emplacement (url ou
relativePath) et l'empreinte SHA-256 de la ressource consultée. Quand
l'emplacement est une URL, archivePath peut désigner sa copie locale vérifiable.
Les documents officiels utilisent nécessairement authority: "official".

Types admis :

- official-rule, official-mission, official-points, official-errata
- event-results, community-analysis, playtest

Une source web ou un export de résultats doit être archivé localement avant
publication d'une recommandation. Une source ne suffit pas à établir une
causalité : résumer sa méthode et ses limites dans l'enregistrement concerné.

## Axes et évaluations

Les axes contrôlés sont :

primary-scoring, secondary-scoring, board-control, tempo, mobility,
durability, damage-projection, resource-efficiency, denial, trading.

Une évaluation utilise un entier de 0 à 4 :

- 0 : aucune contribution démontrée ;
- 1 : contribution rare ou coûteuse ;
- 2 : contribution normale, dépendante du contexte ;
- 3 : contribution forte dans le contexte décrit ;
- 4 : contribution déterminante, avec limites documentées.

Cette échelle exprime une appréciation tactique, pas une probabilité de victoire
ni une mesure de dégâts. Chaque profil comporte une justification, des sources
et une confiance. Les profils d'unité et de détachement exigent une
catalogDataVersion renseignée.

## Enregistrements stratégiques

### Scénario

Un scénario identifie le pack de mission, les cartes ou dispositions lorsqu'elles
sont légalement et réellement disponibles, ses fenêtres de score et un
classement des axes. Son sourceIds doit pointer vers une source de mission.
N'ajoutez aucun détail de carte à un pack summary-only.

### Profil d'unité ou de détachement

Un profil est lié au catalogue épinglé et contient des rôles contrôlés, des
évaluations d'axes, une conclusion courte, des limites, des sources et une
confiance. Il ne remplace pas les caractéristiques ou règles sources.

### Synergie

Une synergie fournit au moins deux participants (unité, détachement,
stratagème ou amélioration), une affirmation, les préconditions, le timing,
les contre-jeux, les coûts d'opportunité, des effets d'axe et les sources.
evidenceKind: "rules-supported" exige au moins une source officielle ;
"tested" exige une source de playtest ou de résultats ; "hypothesis" reste au
statut needs-review.

### Snapshot de meta

Un snapshot contient une fenêtre d'observation, un format, une méthode, une
description de l'échantillon, les métriques et les limites. Ses sources doivent
être des résultats, des analyses communautaires ou des playtests ; ne dérivez
pas une métrique au-delà de ce que la source mesure.

### Recommandation

Une recommandation est toujours une inférence. Elle référence un ou plusieurs
scénarios, synergies ou snapshots existants, indique son contexte, ses
compromis, sa confiance, son statut et reviewBy. Une recommandation published
doit avoir une preuve traçable et ne peut pas reposer sur une synergie
hypothétique.

## Porte de publication

Avant l'intégration à la PWA :

1. Exécuter le validateur sur le fichier source.
2. Vérifier que les références de catalogue et de missions existent dans les
   versions épinglées.
3. Relire les conclusions affichables : contexte, limites, contre-jeu et date
   de révision doivent être visibles.
4. Ajouter les tests de chargement et de rendu texte lors du branchement à
   l'interface.

Le validateur vérifie le contrat structurel et les relations internes. La
validation humaine confirme la fidélité des règles, la pertinence des sources
et les identifiants réels de catalogue.
