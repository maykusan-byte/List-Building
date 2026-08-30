# ADR-015 — Contrats de partie complète et sauvegarde V6

- Statut : accepté
- Date : 2026-08-27
- Plan version : 3.0.0
- Tâche : SIM-M6-T02

## Contexte

Les sauvegardes V1 à V5 décrivent le socle historique et les incréments de tir.
Elles ne portent ni état de bataille sur plusieurs tours, ni mission, ni file de
résolution versionnée. Les étendre implicitement ferait apparaître d'anciennes
sessions comme des parties complètes alors qu'elles ne possèdent pas les
preuves de couverture nécessaires.

## Décision

Ajouter des contrats purs et sérialisables : `BattleStateV1`,
`MissionStateV1` et `ResolutionQueueV1`. `GameState` les porte de façon
additive ; les sessions V1 à V5 conservent `battle` et `mission` à `null` et
une file vide. Les lecteurs historiques acceptent aussi les états initiaux
créés avant l'existence de ces trois champs.

Une `SessionSetup` de partie complète doit fournir un
`CompleteGameSessionSetupV1` compilé. Ce contrat ne sait représenter qu'un
rapport `compatible` et lie explicitement :

- la portée et la version de couverture ;
- l'empreinte du rapport de compatibilité ;
- l'empreinte canonique du manifeste exécutable, de l'environnement spatial,
  des profils physiques, des caractéristiques, armes, affectations et sources
  de chaque unité et figurine ;
- les joueurs et le nombre maximal de rounds ;
- la mission, son empreinte et ses objectifs ;
- la version du flux d'événements.

`SimulationSaveV6` est la seule enveloppe autorisée pour ce journal. Elle
ajoute les versions des contrats bataille, mission, file et flux d'événements,
ainsi que les empreintes canoniques du setup complet et du rapport. V1 à V5
refusent explicitement un événement de setup complet ; aucune migration ou
promotion automatique n'est réalisée.

La file de résolution ne contient que l'identité, le timing, le propriétaire
et les règles sources d'une fenêtre. Elle ne transporte pas d'effet libre :
les effets exécutables resteront des `GameEvent` typés.

M6-T02 matérialise ces états au setup mais verrouille les anciennes commandes
de phase sur une session V6. M7 remplacera ce verrou par les commandes et
événements dédiés à la boucle de bataille. Cette séparation empêche le moteur
historique mono-tour de faire avancer silencieusement une partie complète.

## Conséquences

- Une sauvegarde V6 peut être exportée, importée, autosauvegardée et rejouée
  sans perdre son périmètre.
- Une session dont un fait exécutable diverge du rapport compilé est refusée
  avant toute mutation d'état ou consommation du PRNG.
- Un réordonnancement des clés d'un objet ne change pas son empreinte : la
  forme canonique est reconstruite avant sérialisation ; l'ordre des joueurs
  et des objectifs demeure intentionnel.
- Les sauvegardes V1 à V5 restent lisibles et rejouables dans leur portée
  d'origine, y compris sans les champs d'état introduits par V6.
- Le scénario M6 actuel reste `draft-blocked` : disposer du contrat V6 ne crée
  aucun rapport compatible et n'active aucune règle de mission.
