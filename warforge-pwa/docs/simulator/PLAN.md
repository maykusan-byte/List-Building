# Simulateur tactique Warforge

`planVersion: 2.3.3`

## Objectif et périmètre

Construire progressivement un simulateur tactique local, hors ligne et prioritairement desktop. Deux personnes jouent sur le même appareil : elles prennent les décisions tactiques, tandis que le moteur applique automatiquement les règles couvertes et refuse toute action ou partie qui référence une donnée, géométrie ou règle non prise en charge. Aucun backend, réseau ni adversaire IA n'est prévu.

M0 à M3 ont livré la gouvernance, le moteur déterministe, le laboratoire spatial et un duel de tir synthétique sauvegardable et rejouable. La prochaine promesse produit est un duel réel à périmètre fermé entre une petite force Space Marines Salamanders et une petite force Blood Angels. Cette promesse ne signifie pas encore « partie complète de Warhammer 40,000 » : M4 couvre le placement prédéfini, le mouvement, le ciblage et le tir des unités sélectionnées. Charge, Combat, objectifs, missions, réserves et transports restent des jalons ultérieurs.

La promesse « toute liste » ne pourra être faite qu'après couverture complète du catalogue actif et de ses sources.

## Pilotage

`project-state.json` est l'unique source machine-lisible d'avancement ; `STATUS.md` est son rendu déterministe et ne se modifie jamais à la main. Toute modification substantielle de ce plan incrémente `planVersion` et crée un ADR. Chaque tâche a un identifiant `SIM-M<n>-T<nn>`, des dépendances, critères, preuves et un contexte de reprise. Une session doit lire les ADR applicables, vérifier le tracker, reprendre une unique tâche en cours, exécuter les validations, enregistrer leurs preuves puis documenter la prochaine action.

Les états autorisés sont `planned`, `ready`, `in_progress`, `blocked`, `done` et `deferred`. Le tracker refuse les dépendances incomplètes, plusieurs tâches en cours, des preuves absentes ou périmées à la clôture, un jalon accepté prématurément, un profil IA inconnu et un travail critique sans revue indépendante.

## Routage IA

La politique versionnée est dans `model-routing.json`. Sol `high` est privilégié pour l'architecture, la formalisation des règles, les audits adversariaux et l'acceptation des jalons ; Terra `xhigh` pour le moteur, les adaptateurs complexes et la persistance ; Terra `high` pour l'UI et l'implémentation bornée ; Terra `low`/`medium` pour les opérations mécaniques. Les préférences ont un fallback et ne bloquent jamais le travail.

Avant une délégation, le coordinateur produit un TaskBrief avec résultat, fichiers autorisés, invariants, sources, critères, validations, interdictions et format de retour. Les sous-travailleurs ne changent ni plan, ni jalon, ni tracker ; le coordinateur réexécute les validations et enregistre seul l'état. Deux délégations sont la norme, trois le maximum, et seulement pour des périmètres sans conflit.

## Architecture et invariants

- `src/simulator/` sépare géométrie, règles, moteur événementiel, orchestration, persistance et UI.
- La vue `#simulator` est chargée à la demande ; PixiJS 8/WebGL assure le rendu et XState 5 gère phases, fenêtres de décision et interruptions.
- Toute action suit `GameCommand → GameEvent → GameState`. Le domaine pur ne dépend ni de React ni de PixiJS, n'a ni mutation hors événements ni RNG implicite.
- Le PRNG est déterministe et versionné. Snapshots et journal vivent dans IndexedDB ; export, import et replay JSON sont pris en charge.
- Les calculs de portée, LoS, couvert et légalité sont autoritaires côté orchestration ; l'UI ne fournit jamais une mesure ou un booléen de règle faisant autorité.
- Une session ne démarre que si son rapport de compatibilité couvre exhaustivement roster, profils physiques, armes, règles obligatoires et scénario.
- Les sauvegardes lient la session à des empreintes canoniques de roster, catalogue, règles et environnement. Une donnée modifiée invalide la reprise plutôt que de produire silencieusement un résultat différent.

## Géométrie et données

L'unité interne est 0,1 mm (un pouce = 254 unités). Les figurines sont des cercles, capsules ou polygones convexes orientés avec hauteur continue ; les terrains sont des multipolygones, trous, élévations et bandes d'occlusion. Une grille spatiale accélère la broad phase, puis les tests exacts contrôlent collisions, volume balayé, distance, engagement et cohérence. M3 conserve ses rayons normalisés historiques. Pour le pilote M4, la LoS est décidée par la convention locale finie et versionnée de quinze points représentatifs par hitbox cylindrique, conformément à ADR-008 : ce verdict est une approximation assumée, non une visibilité continue ni une règle officielle. Le témoin, le bloqueur et la mesure restent expliqués à l'interface.

Les profils physiques, rulepacks et scénarios sont versionnés sous `data/simulator/`, avec source, version, date d'effet et empreinte. Le texte naturel n'est jamais interprété à l'exécution. Toute convention non officielle est explicitement versionnée et soumise à revue humaine. Les données réelles du catalogue restent sous le protocole `warforge-data-operations` : source officielle, version, date d'effet, validation et synchronisation publique.

## Feuille de route officielle

| Jalon | Résultat de sortie |
| --- | --- |
| M0 — Gouvernance et politique IA | Une nouvelle session retrouve l'état, la prochaine action et le profil IA sans historique conversationnel. |
| M1 — Fondations techniques | Le moteur est rejouable, sérialisable et testé sans UI. |
| M2 — Laboratoire spatial | Les cas géométriques de référence ont des verdicts stables et explicables. |
| M3 — Vertical slice de tir | Deux unités synthétiques réalisent une séquence complète, sauvegardable et rejouable. |
| M4 — Duel réel pilote Salamanders–Blood Angels | Deux petits `RosterDraft` réels et figés jouent un duel de mouvement et de tir, sans règle obligatoire silencieusement ignorée. |
| M5 — Tir étendu fiable | Le pipeline de tir couvre les modificateurs, mots-clés et décisions nécessaires à des rosters réels plus variés. |
| M6 — Extension des forces pilotes | Les deux forces pilotes gagnent progressivement unités, options et règles de détachement sans réduire la couverture. |
| M7 — Charge et Combat | Charge, engagement, mouvements de combat, attaques de mêlée et consolidations sont déterministes et expliqués. |
| M8 — Commandement, statuts et objectifs | Les états persistants, ressources, objectifs et contrôle sont gérés par la machine à états. |
| M9 — Missions et score | Une mission fermée complète se joue et calcule son score depuis des sources versionnées. |
| M10 — Réserves, transports et déploiements spéciaux | Les changements de zone et d'embarquement sont couverts avec leurs contraintes spatiales. |
| M11 — Déploiement progressif du catalogue | Les factions sont ajoutées par lots audités ; « toute liste » reste interdit avant couverture totale. |

## M4 — Duel réel pilote Salamanders–Blood Angels

M4 commence par figer deux petits rosters réels. La cible par défaut est de deux à quatre fiches d'unité par camp, orientées infanterie, avec au plus un personnage par camp. Véhicules, transports, aéronefs, rotations continues et capacités dépendant d'une phase non implémentée sont exclus du premier lot, sauf décision ADR explicite. Les unités exactes, options d'équipement, détachements et coûts sont approuvés humainement dans `SIM-M4-T01` ; ils ne sont pas inventés par le moteur.

Le roster Salamanders reste un roster Space Marines dont l'identité, le détachement et les restrictions sont explicites. Le roster Blood Angels suit la même règle. Une unité n'entre dans le pilote que si toutes ses règles obligatoires pertinentes au scénario M4 sont soit exécutables et sourcées, soit explicitement hors phase ; une règle de tir obligatoire non couverte bloque le roster.

Ordre d'exécution :

1. `SIM-M4-T01` sélectionne et fige les deux compositions pilotes depuis le catalogue actif.
2. `SIM-M4-T02` compile les `RosterDraft` vers des identifiants de session stables et produit des refus exhaustifs.
3. `SIM-M4-T03` source les profils physiques, armes, aptitudes et conventions nécessaires aux seules unités choisies.
4. `SIM-M4-T07` implémente la LoS échantillonnée versionnée entre hitboxes, avec son témoin rejouable, ses limites explicites et ses cas limites.
5. `SIM-M4-T04` assemble une session autoritaire et son rapport de compatibilité complet.
6. `SIM-M4-T08` intègre les seules règles et preuves de tir nécessaires au pilote réel, puis transforme la matrice en couverture exécutable.
7. `SIM-M4-T05` livre le parcours UI import/sélection, mouvement, ciblage, tir, pertes, sauvegarde et reprise.
8. `SIM-M4-T06` rejoue le duel de bout en bout, exécute les probes adversariaux et audite le jalon.

Critère de sortie : les deux versions exactes des rosters pilotes peuvent terminer le scénario `real-roster-shooting-duel-v1`; une option, arme, aptitude ou donnée physique étrangère au périmètre est refusée avant la partie. M4 n'autorise aucune annonce de support global des Salamanders, des Blood Angels ou des Space Marines.

`SIM-M4-T08` corrige l'ordre initial : la compatibilité exhaustive de T04 a mis en évidence qu'une UI ne peut pas rendre une session jouable tant que le moteur n'exécute pas Oath of Moment, la convention LoS M4, le garde [PISTOL], le couvert et les conditions de mouvement correspondantes. T08 livre uniquement ces contrats bornés, leurs sources, leurs golden tests et leur replay ; M5 reste l'extension générique des capacités de tir.

## M5 — Tir étendu fiable

M5 précède Charge/Combat parce que les rosters réels exposent immédiatement les limites du moteur de tir. L'extension se fait par capacités atomiques, chacune reliée à une source officielle, des golden tests, des cas de rejet sans consommation du PRNG et un replay exact.

Ordre d'exécution :

1. `SIM-M5-T01` construit la matrice de capacités et le corpus sourcé à partir des écarts observés sur les deux rosters pilotes.
2. `SIM-M5-T02` couvre volumes et modificateurs d'attaques, CT, portée et ordre d'application.
3. `SIM-M5-T03` couvre relances, touches/blessures critiques et mots-clés déclenchés, y compris les fenêtres de décision qui interrompent légalement une résolution de tir ; les journaux interrompus V3 suivent ADR-010 et ADR-011.
4. `SIM-M5-T04` couvre sauvegardes alternatives, prévention et dégâts variables ou spéciaux. Les choix d'allocation et l'état durable des armes `[TIR UNIQUE]` sont journalisés par `SimulationSaveV4` conformément à ADR-012 ; les réductions génériques de dégâts restent explicitement refusées jusqu'à leur contrat sourcé.
5. `SIM-M5-T05` couvre ciblage avancé, armes mixtes, split fire et décisions de résolution.
6. `SIM-M5-T06` intègre ces capacités aux rosters pilotes, durcit l'UI/replay et fait auditer M5.

Une capacité n'est annoncée `covered` qu'après tests positifs, négatifs et de provenance. Les aptitudes de faction ou de détachement qui ne sont pas génériques restent dans M6, même si leur moteur d'effet repose sur une primitive livrée en M5.

## M6 à M11 — Extension contrôlée

M6 élargit d'abord Salamanders et Blood Angels : davantage d'unités, options et règles de détachement, par petits lots régressifs. M7 livre ensuite Charge et Combat. M8 introduit les ressources de commandement, statuts durables et contrôle d'objectifs. M9 ajoute une mission fermée et son score. M10 couvre réserves, transports et déploiements spéciaux. M11 industrialise l'ajout de factions par matrice de couverture, sans jamais assimiler une faction partiellement couverte à une faction entièrement supportée.

Chaque jalon conserve un vertical slice jouable et régressif. L'ordre peut être révisé par ADR, mais M5 reste le successeur immédiat de M4 tant que le tir étendu n'est pas fiable.

## Validation

Les gates incluent le contrôle du tracker, la validation et la synchronisation des données du simulateur, les tests unitaires et de propriétés, les golden tests sourcés, les probes de compatibilité, Playwright et le build. Les preuves enregistrent commande, résultat, périmètre, date et commit lorsqu'il est connu. Une preuve devient périmée lorsqu'une modification plus récente affecte son périmètre.

Pour M4, Playwright couvre au minimum : chargement des deux rosters figés, refus d'une option étrangère, mouvement légal et illégal, sélection de cible, tir, pertes, export V2, reprise IndexedDB et replay identique. Pour M5, chaque nouvelle capacité possède une graine fixe et un test vérifiant qu'un rejet ne consomme aucune entropie.

Toute clôture critique et toute acceptation de jalon reçoivent une revue indépendante Sol `high`, ou le fallback versionné si Sol est indisponible. Seul le coordinateur enregistre les preuves et accepte le jalon.

Le corpus de calibration IA est complété à partir des résultats réels de M3 à M5. Toute modification de routage crée un ADR et incrémente `policyVersion`.
