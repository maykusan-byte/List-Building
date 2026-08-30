# Simulateur tactique Warforge

`planVersion: 3.1.0`

## Résultat visé

Construire une PWA locale permettant à deux personnes de jouer une partie
complète de Warhammer 40,000 V11 sur le même appareil. Les joueurs prennent
les décisions ; le moteur vérifie la légalité, résout les règles couvertes,
journalise chaque effet et rejoue exactement la partie. Aucun backend,
adversaire IA ou mécanisme anti-triche hostile n'est prévu.

La première promesse « partie complète » est un pilote fermé de cinq rounds.
Elle précède l'élargissement du catalogue : un petit scénario entièrement
couvert vaut mieux qu'une grande liste dont des règles seraient ignorées.
« Toute liste » reste interdit avant couverture exhaustive du catalogue actif.

## État produit au début du plan 3

- M0 à M4 sont acceptés : gouvernance, moteur déterministe, laboratoire
  spatial, duel synthétique puis duel réel Salamanders–Blood Angels limité au
  mouvement et au tir.
- M5 livre des primitives de tir avancées sourcées sur fixtures : volumes,
  modificateurs, relances, critiques, sauvegardes et dégâts étendus, split
  fire, reciblage et choix d'occurrence de `[TOUCHES SOUTENUES]`.
- Les profils alternatifs réels, Charge, Combat, commandement, objectifs,
  stratagèmes, mission et score ne sont pas encore une capacité produit.

## Sources de vérité et reprise

- `project-state.json` est la source machine-lisible. Son schéma V2 contient
  jalons, tâches, tranches atomiques, coût, sources, ADR, chemins autorisés,
  gates attendues et exécutions réelles.
- `STATUS.md` est généré par `scripts/simulator-project.mjs` et n'est jamais
  édité manuellement.
- `model-routing.json` versionne le choix des modèles, les fallbacks et la
  politique de coût.
- `decisions/ADR-NNN-*.md` conserve les changements structurants.
- `docs/simulator/rule-arbitrations.md` consignera uniquement les arbitrages
  humains qui complètent une règle officielle réellement incomplète.

Une session commence par `pnpm simulator:project:check`, puis
`pnpm simulator:project:brief -- <taskId>` et
`pnpm simulator:project:health -- <taskId>`. Une seule tâche et une seule
tranche peuvent être `in_progress`. La reprise indique une prochaine action
exécutable sans dépendre de l'historique conversationnel.

Les seuls arrêts normaux sont : tranche terminée, source ou décision humaine
réellement manquante, gate en échec nécessitant un changement de périmètre,
action externe/destructive non autorisée, ou tâche XL non approuvée. Une
simple difficulté ou une longue exécution ne justifie pas une interruption.

## Coût et contribution humaine

Les tâches sont classées `S`, `M`, `L` ou `XL`. Le coordinateur prévient avant
`L` et `XL`, indique l'alternative manuelle utile, et demande une approbation
explicite avant `XL`. Les contributions humaines à forte valeur sont :

- captures structurées des sections officielles demandées ;
- vérification des passages OCR signalés comme incertains ;
- approbation des profils physiques, loadouts et arbitrages ;
- playtests guidés de la partie complète avec rapport des divergences.

Le corpus massif de règles et le playtest complet ne sont pas remplacés par
une consommation IA coûteuse lorsqu'une collecte ou une observation humaine
est plus fiable.

## Routage IA économique

La politique exacte est dans `model-routing.json` :

- Sol `high` : architecture, règles ambiguës et audits de jalon ;
- Terra `high` : moteur et implémentation complexe aux invariants multiples ;
- Terra `medium` : implémentation bornée, UI et tests standards ;
- Luna `low` : transcription lisible, index, fixtures et opérations mécaniques.

`xhigh` et `max` ne sont pas des valeurs par défaut. Aucun sous-travailleur
n'est lancé par défaut ; un seul peut être actif lorsque son périmètre est
indépendant et que le gain dépasse la supervision. Le coordinateur fournit un
TaskBrief, relance les gates et reste seul propriétaire du tracker et des
acceptations.

## Architecture du moteur de partie complète

- Toute mutation suit `GameCommand → GameEvent → GameState`.
- Domaine, règles et géométrie restent en TypeScript pur, sans React, PixiJS,
  DOM ni stockage navigateur.
- L'orchestration calcule portée, LoS, couvert, engagement, contrôle et score ;
  l'UI ne fournit aucun verdict faisant autorité.
- Le PRNG est injecté, déterministe et versionné. Un rejet ou un choix sans jet
  ne consomme aucune entropie.
- `SimulationSaveV6` devient l'enveloppe stable d'une partie complète. Chaque
  événement déclare sa version et ses capacités ; V1 à V5 restent importables
  et rejouables dans leur périmètre historique.
- Les primitives communes sont typées : `BattleStateV1`, `MissionStateV1`,
  `ResolutionQueue`, `ResolutionStep`, `RuleEffect`, `DecisionWindow`,
  `ScoreEvent`, `CompleteGameScenarioV1`, `CompatibilityReportV2` et
  `RuleArbitrationV1`.
- Le texte naturel n'est jamais un DSL d'exécution. Les règles sont compilées
  en contrats typés et reliées à des sources versionnées.
- Les snapshots et journaux vivent dans IndexedDB ; export, import, reprise et
  replay JSON doivent produire le même état final.

La géométrie conserve l'unité entière de 0,1 mm et la LoS M4 échantillonnée
sur quinze points de hitbox cylindrique conformément à ADR-008. Les limites de
cette convention restent visibles. Aucun durcissement contre la modification
volontaire de mémoire ou de sauvegarde n'est planifié ; seules la correction
normale, les schémas, versions, empreintes et invariants sont vérifiés.

## Pilote fermé de partie complète

Le pilote cible trois unités par camp, sans prétendre couvrir une faction :

- Salamanders : les unités M4 plus `book-space-marines:unit:3` Captain, pour
  un total prévu de 235 points ; Captain non attaché ; équipement candidat
  *heavy bolt pistol* et *master-crafted power weapon*.
- Blood Angels : les unités M4 plus une seconde
  `book-blood-angels:unit:33` Assault Intercessor Squad, pour un total prévu
  de 240 points.

La mission candidate utilise Disruption, disposition miroir 1, Outmanoeuvre
pour les deux joueurs, puis Assassination et Engage on All Fronts comme
secondaires fixes. Le propriétaire du projet a approuvé le 2026-08-30
l'archive locale GDM 2026 comme source fiable pour ces cartes et ce layout.
Cette source `trusted-web` peut donc fonder leur couverture exécutable dans
Warforge, avec hashes et contrôle contre les images archivées, sans être
présentée comme une publication officielle Games Workshop. Les règles
générales et plafonds restent reliés au Compagnon de Rencontre officiel.

## Feuille de route exécutable

| Jalon | Résultat de sortie |
| --- | --- |
| M0–M4 | Fondations et duel réel mouvement/tir acceptés. |
| M5 — Tir avancé sur fixtures | Primitives sourcées, rejouables et régressions M4 vertes ; profils alternatifs réels différés. |
| M6 — Fondations de partie complète | Corpus/gaps, arbitrages, enveloppe V6, état de bataille/mission et rosters fermés sont prêts sans règle manquante cachée. |
| M7 — Boucle de bataille | Déploiement, premier joueur, cinq rounds, tours, mouvements, Charge et Combat sont jouables et rejouables. |
| M8 — Ressources et objectifs | CP, Battle-shock, statuts, contrôle d'objectifs et stratagèmes obligatoires du pilote sont exécutables. |
| M9 — Mission complète et UI | Mission fermée, score, interface, sauvegarde/reprise et playtest humain de bout en bout sont acceptés. |
| M10 — Zones spéciales | Réserves, transports et déploiements spéciaux sont ajoutés sans état spatial impossible. |
| M11 — Catalogue | Factions et listes sont ajoutées par lots sourcés et audités. |

### M5 — clôture

`SIM-M5-T06` audite les primitives et fixtures M5, les refus hors périmètre,
les sauvegardes V1–V5 et les régressions du duel M4. Il n'exige pas que le
split fire de fixture soit exposé dans l'UI M4. Les profils alternatifs réels
restent différés jusqu'à une source et un loadout approuvé.

### M6 — fondations de partie complète

1. Construire le graphe de couverture et la file exacte des sources/arbitrages.
2. Définir `BattleStateV1`, `MissionStateV1`, les files de résolution et
   `SimulationSaveV6` avec lecteurs V1–V5.
3. Compiler les deux rosters fermés, profils physiques et scénario draft ;
   toute lacune bloque la compatibilité, pas le chantier architectural.
4. Auditer l'architecture, les migrations et les refus de session incomplète.

### M7 — boucle de bataille

1. Placement, zones de déploiement et détermination du premier joueur.
2. Rounds, tours et phases ; Normal Move, Remain Stationary, Advance et Fall
   Back avec conséquences persistantes.
3. Déclaration, jet et mouvement de Charge avec réactions couvertes.
4. Sélection de combat, pile-in, mêlée, pertes et consolidation.
5. Vertical slice sauvegardable de plusieurs tours, sans phase sautée.

### M8 — commandement et objectifs

1. Ressources, CP, Battle-shock, durées et expirations.
2. Objectifs, présence, contrôle et contestation depuis la géométrie.
3. Stratagèmes et aptitudes obligatoires du seul pilote fermé.
4. Audit des fenêtres, effets et reprises.

### M9 — mission et interface complète

1. Activer les données de mission après validation de l'archive GDM 2026
   approuvée et conserver sa provenance non officielle explicite.
2. Produire chaque point via un `ScoreEvent` explicable sur cinq rounds.
3. Livrer l'interface complète : phase, round, score, décisions, journal,
   sauvegarde, reprise et replay.
4. Exécuter Playwright puis un playtest humain guidé hors ligne ; aucun bouton
   « ignorer la phase » ne peut masquer une règle obligatoire.

## Gates

Chaque tranche exécute ses `expectedGates`. Les gates de jalon comprennent :

- `pnpm simulator:project:check` et `pnpm simulator:project:health` ;
- `pnpm simulator:validate`, validation des sources et couverture ;
- tests unitaires, propriétés, golden tests à graine fixe et replay ;
- Playwright pour les parcours réellement exposés ;
- `pnpm build` puis `pnpm verify` à l'acceptation ;
- revue Sol `high` indépendante avant tout jalon critique.

Une session jouable exige une compatibilité exhaustive de ses rosters,
profils physiques, armes, règles obligatoires et scénario. Une source absente
produit un gap explicite. Une règle officielle incomplète produit un
`RuleArbitrationV1` approuvé humainement ; elle n'est jamais complétée en
silence par le moteur.
