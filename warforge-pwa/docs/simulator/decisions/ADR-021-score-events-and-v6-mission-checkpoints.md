# ADR-021 — ScoreEvent et checkpoints de mission dans V6

- Statut : accepté
- Date : 2026-08-30
- Plan version : 3.1.0
- Tâche : SIM-M9-T02

## Contexte

La mission fermée Disruption doit appliquer Outmanoeuvre, Assassination,
Engage on All Fronts, les plafonds du Compagnon, Battle Ready et la fin après
cinq rounds. Les journaux V6 antérieurs ne contiennent aucun événement de
score et doivent rester rejouables sans acquérir rétroactivement ces fenêtres.

## Décision

Le score est activé par le profil explicite
`closed-complete-game-disruption-v1`. Son absence conserve les sémantiques V6
pré-M9. Une session activée doit résoudre un checkpoint à la fin de chaque
phase de Commandement et de chaque tour avant de faire avancer la boucle.

La commande ne contient aucun VP, contrôle d'objectif ou quart de table.
L'orchestration autoritaire produit successivement le contrôle des objectifs,
les preuves spatiales d'Engage puis `mission-scoring-resolved`. Ses
`MissionScoreEventV1` exposent le barème brut, les plafonds disponibles, les VP
appliqués, les objets concernés et les sources.

Le PRNG ne progresse pas. Le reducer recalcule le barème, les plafonds, les
pertes PERSONNAGE déjà comptées et le résultat final. Le replay autoritaire
recalcule aussi les quarts depuis les hitbox. Battle Ready reste un verdict
booléen externe, jamais un nombre de VP fourni par l'interface.

Les événements sont ajoutés à `SimulationSaveV6` : aucune enveloppe V7 n'est
nécessaire, car le profil d'activation rend l'extension additive et les anciens
journaux ne peuvent pas produire un événement M9.

## Limites et arbitrages

Le pilote ne contient qu'un modèle PERSONNAGE par camp. Assassination et
Engage ne peuvent donc pas dépasser ensemble le plafond secondaire de 15 VP
sur un même round ; leur ordre d'imputation n'introduit aucun arbitrage
observable dans ce périmètre. Une extension avec davantage de PERSONNAGES qui
rendrait cet ordre matériel devra vérifier la source ou créer un arbitrage
humain approuvé avant activation.

Les rôles spatiaux des six objectifs sont des entrées compilées de mission.
Ils sont liés à la session et à ses deux empreintes exécutables ; le replay ne
les reconstruit jamais depuis l'événement qu'il vérifie. Leur association aux
coordonnées officielles sera fournie par M9-T03 ; le moteur M9-T02 refuse une
association incomplète ou dupliquée.

## Conséquences

- chaque VP et le vainqueur sont sourcés, explicables et rejouables ;
- un checkpoint manquant bloque la phase suivante sans consommer d'entropie ;
- les plafonds primaire, secondaire et par carte sont durables dans l'état ;
- `coverage.mission` peut devenir `covered`, sans annoncer le layout ou la
  partie complète comme jouables.
