# Simulateur tactique Warforge

`planVersion: 1.1.0`

## Objectif et périmètre

Construire progressivement un simulateur tactique local, hors ligne et prioritairement desktop. Deux personnes jouent sur le même appareil : elles prennent les décisions tactiques, tandis que le moteur applique automatiquement les règles couvertes et refuse toute action ou partie qui référence une donnée, géométrie ou règle non prise en charge. Aucun backend, réseau ni adversaire IA n'est prévu.

Le premier produit jouable est un duel fermé : placement, mouvement, cohérence, collisions, ligne de vue 2.5D et résolution complète d'une attaque de tir. La promesse « toute liste » ne pourra être faite qu'après couverture complète du catalogue actif et de ses sources.

## Pilotage

`project-state.json` est l'unique source machine-lisible d'avancement ; `STATUS.md` est son rendu déterministe et ne se modifie jamais à la main. Toute modification substantielle de ce plan incrémente `planVersion` et crée un ADR. Chaque tâche a un identifiant `SIM-M<n>-T<nn>`, des dépendances, critères, preuves et un contexte de reprise. Une session doit lire les ADR applicables, vérifier le tracker, reprendre une unique tâche en cours, exécuter les validations, enregistrer leurs preuves puis documenter la prochaine action.

Les états autorisés sont `planned`, `ready`, `in_progress`, `blocked`, `done` et `deferred`. Le tracker refuse les dépendances incomplètes, plusieurs tâches en cours, des preuves absentes ou périmées à la clôture, un jalon accepté prématurément, un profil IA inconnu et un travail critique sans revue indépendante.

## Routage IA

La politique versionnée est dans `model-routing.json`. Sol `high` est privilégié pour l'architecture, les règles ambiguës et l'acceptation des jalons ; Terra `xhigh` pour l'implémentation complexe ; Terra `high` pour l'implémentation courante ; Terra `low`/`medium` pour les opérations mécaniques. Les petits modèles ne sont utilisés que s'ils sont effectivement disponibles et validés par le corpus d'évaluation. Les préférences ont un fallback et ne bloquent jamais le travail.

Avant une délégation, le coordinateur produit un TaskBrief avec résultat, fichiers autorisés, invariants, sources, critères, validations, interdictions et format de retour. Les sous-travailleurs ne changent ni plan, ni jalon, ni tracker ; le coordinateur réexécute les validations et enregistre seul l'état. Deux délégations sont la norme, trois le maximum, et seulement pour des périmètres sans conflit.

## Architecture cible

- `src/simulator/` sépare géométrie, règles, moteur événementiel, orchestration, persistance et UI.
- La vue `#simulator` est chargée à la demande ; PixiJS 8/WebGL assure le rendu et XState 5 gère phases, fenêtres de décision et interruptions.
- Toute action suit `GameCommand → GameEvent → GameState`. Le domaine pur ne dépend ni de React ni de PixiJS, n'a ni mutation hors événements ni RNG implicite.
- Le PRNG est déterministe et versionné. Snapshots et journal vivent dans IndexedDB ; export, import et replay JSON sont pris en charge.
- Les contrats publics comprennent `SimulatorManifestV1`, `PhysicalModelProfileV1`, `TerrainLayoutV1`, `RuleDefinition`, `GameCommand`, `GameEvent`, `DecisionRequest`, `RuleRejection`, `SimulationSaveV1`, `SimulationSaveV2` et `RosterSimulationAdapter`.
- `SimulationSaveV1` reste lisible pour les anciennes sessions sans tir. Les parties M3 sont exportées en V2 avec unités, événements de tir et empreinte d'environnement ; aucune sauvegarde V1 n'est promue implicitement en session M3 compatible.

## Géométrie et données

L'unité interne est 0,1 mm (un pouce = 254 unités). Les figurines sont des cercles, capsules ou polygones convexes orientés avec hauteur continue ; les terrains sont des multipolygones, trous, élévations et bandes d'occlusion. Une grille spatiale accélère la broad phase, puis les tests exacts contrôlent collisions, volume balayé, distance, engagement et cohérence. La ligne de vue utilise des rayons entre points normalisés ; son rayon, bloqueur et mesure sont toujours expliqués à l'interface.

Les profils physiques, rulepacks et scénarios sont versionnés sous `data/simulator/`, avec source, version, date d'effet et empreinte. Le texte naturel n'est jamais interprété à l'exécution. Toute convention non officielle est explicitement versionnée et soumise à revue humaine.

## Jalons

| Jalon | Résultat de sortie |
| --- | --- |
| M0 — Gouvernance et politique IA | Une nouvelle session retrouve l'état, la prochaine action et le profil IA sans historique conversationnel. |
| M1 — Fondations techniques | Le moteur est rejouable, sérialisable et testé sans UI. |
| M2 — Laboratoire spatial | Les cas géométriques de référence ont des verdicts stables et explicables. |
| M3 — Vertical slice de tir | Deux unités fermées de cinq modèles réalisent une séquence complète, sauvegardable et rejouable. |
| M4 — Intégration Warforge | Deux `RosterDraft` supportés sont importables ; le rapport bloque les éléments non couverts. |
| M5 — Extension des règles | Tir, combat, commandement, objectifs, réserves, transports, missions et factions couvertes progressivement. |

## Incrément M2 → M3

Le chemin critique version 1.1.0 finalise d'abord les empreintes, multipolygones, mouvements balayés et preuves visuelles de M2. M3 livre ensuite uniquement le duel fermé `closed-core-shooting-duel-v1` avec deux unités synthétiques de cinq figurines, une arme d'entraînement, le Bénéfice du Couvert 13.08 et un replay spatial vérifié. Les `RosterDraft`, unités du catalogue, rotations continues, véhicules, factions et mots-clés hors corpus restent réservés à M4 ou M5.

Le tir suit une commande minimale ne contenant que les identifiants d'unités et d'arme. Portée, ligne de vue et couvert sont calculés dans l'orchestration depuis un environnement immuable dont l'empreinte est liée à la session. Les jets suivent les étapes 05.01 à 05.04, les dégâts sont alloués au modèle déjà blessé puis au plus petit identifiant, et un rejet spatial ne consomme pas le PRNG.

## Validation

Les gates incluent le contrôle du tracker, la validation des données du simulateur, les tests unitaires et de propriétés (géométrie, moteur, statechart, replay et provenance), les golden tests sourcés, Playwright et le build. Les preuves enregistrent commande, résultat, périmètre, date et commit lorsqu'il est connu. Une preuve devient périmée lorsqu'une modification plus récente affecte son périmètre.

Le corpus de calibration compare les profils IA sur : formalisation d'une règle de tir, prédicat géométrique, interaction React/PixiJS, profil physique sourcé et mise à jour mécanique du tracker. Il mesure critères satisfaits, défauts de revue, retouches, validations, durée et consommation si disponibles. Une révision du routage suit un changement majeur de modèle ou cinq tâches représentatives, via ADR et incrément de `policyVersion`.
