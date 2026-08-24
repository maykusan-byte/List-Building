# M5 — Matrice des capacités de tir étendu

- Statut : `in_progress`. Les écarts sont formalisés ; T04 implémente
  les sauvegardes, dégâts et décisions d'allocation dont les sources sont complètes. Les lignes `covered` de
  T03 restent bornées aux fixtures décrites : elles ne promulguent aucun
  profil réel M4 ni aucune liste supplémentaire.
  Aucune ligne `planned`/`candidate`/`implemented-pending-task` n'est une
  promesse de couverture. Le dernier statut signifie seulement que le contrat
  typé, les tests et le replay existent ; il reste hors de la matrice de
  compatibilité jusqu'à l'acceptation de la tâche critique qui le porte.
- Tâche active : `SIM-M5-T04` (`SIM-M5-T01` a livré la matrice de
  formalisation ; `SIM-M5-T02` a intégré et fait auditer les primitives de
  volume et de modificateurs, et `SIM-M5-T03` les relances et déclencheurs).
- Portée : primitives génériques de tir. Les aptitudes de faction ou de
  détachement restent dans M6, et Charge/Combat, objectifs, missions,
  réserves et transports hors de M5.

## Corpus et règles de lecture

La source de base est l'archive officielle locale
`warforge-core-rules-fr-2026-07` : *Règles de base Warhammer 40,000 —
français*, version `archive-2026-07-28`, récupérée le 2026-07-28, empreinte
SHA-256 `36c934dd62ea00800b38924424ed58f442ade9c4079451fa61c731be9e10bee6`.
Elle est déclarée dans `data/simulator/manifest.json`; le texte extrait est
dans `data/rules/core-rules-fr.json`.

Cette archive n'a **pas** de date d'effet officielle enregistrée
(`effectiveDate: null`). La date de récupération et le libellé de version
servent uniquement à la provenance : ils ne doivent jamais être présentés
comme une date d'effet de règle.

Le corpus du simulateur référence également, en attente d'activation
explicite, les documents suivants :

- `warforge-universal-rules-updates-en-2026-07`, *Universal Rules Updates*
  v1.0, applicable le 2026-07-22, empreinte
  `d9dea5fc751d3e3561dbaef1055c2d67ccc8bc21db2887f374b4346f3f4e8ced`.
  Il modifie des règles de stratagèmes et d'ajout d'unité ; il ne définit pas
  les modificateurs, relances ou caractéristiques aléatoires de T02 et
  n'étend donc pas M4/M5.
- `warforge-official-app-faq-fr-2026-07`, FAQ française de l'application
  officielle, dont la dernière mise à jour affichée est le 2026-07-22 et dont
  le snapshot local a été capturé le 2026-08-24. Les 47 clarifications
  entièrement visibles, les captures et leurs empreintes sont archivées. Elles
  confirment notamment que « +1 en A » augmente la caractéristique A de chaque
  arme concernée, et que le couvert se décide puis se groupe par figurine
  attaquante. Elles ne fournissent toutefois ni la grammaire des
  caractéristiques aléatoires, ni l'ordre général des modificateurs, ni les
  règles générales de modification des jets de dés : elles ne lèvent pas
  `BLK-004` seules.
- `warforge-official-app-references-fr-2026-07`, références françaises de
  l'application officielle, snapshot local du 2026-08-24. Les captures
  versionnées transcrivent `01.05.02` (*Relances*), `02.02.01` (*Modificateurs*), `02.02.03`
  (*Caractéristiques Aléatoires*), `04.03.01`, `04.03.03` et `05.03.02`.
  Elles donnent l'ordre de calcul, les plafonds, la sémantique des jets non
  modifiés et le moment exact de génération des A et D aléatoires : elles
  lèvent la lacune documentaire de T02.1/T02.2 et T03.1. Elles ne promulguent pas un
  loadout et ne rendent aucune capacité exécutable sans tests.
- `warforge-official-app-errata-fr-2026-07`, errata français de l'application
  officielle, snapshot local du 2026-08-24. Les corrections `13.09`, `17.03`
  et `18.05`, ainsi que les deux alias de stratagèmes, sont archivés
  séparément. Elles restent sans effet sur le périmètre M4 fermé.
- `warforge-faction-pack-space-marines-fr-2026-07`, pack Space Marines v1.1,
  applicable le 2026-07-22, empreinte
  `247ccf96c5d2b6e16f28c34ad670b14c47fed2e1f405d77fbed0c5fae8f73993`.
- `warforge-faction-pack-blood-angels-fr-2026-07`, pack Blood Angels v1.1,
  applicable le 2026-07-22, empreinte
  `32a81025ff962e21b3dd67695472ebea79b6c5a09871f752fbc2c364d17b398b`.

Les deux packs de faction étaient déjà archivés et audités pour le catalogue
actif. Leur inscription dans le manifeste du simulateur lève uniquement la
gate de **provenance des profils** du pilote ; une option d'équipement reste
inactive tant qu'un loadout précis n'est pas approuvé et que sa mécanique
générique n'est pas `covered`.

Les références de catalogue restent celles du roster M4 figé (catalogue
`1.2.13.0`, publié le 2026-07-24). Elles servent à constater les écarts, pas
à déclarer un soutien de faction. Une source de fiche ou de règle additionnelle
doit être ajoutée au corpus versionné avant qu'une nouvelle capacité soit
exécutable.

Chaque capacité M5 doit :

1. être validée avant de créer un `GameEvent` et avant tout tir du PRNG ;
2. conserver dans l'événement la décision, les données source et les jets
   effectivement consommés ;
3. fournir un golden test à graine fixe, un rejet sans consommation d'entropie
   et un replay qui recalcule les preuves autoritaires ;
4. rester `unsupported-*` si son profil, son mot-clé, son choix joueur ou sa
   provenance n'est pas couvert.

## Socle M4 conservé

| Contrat déjà exécuté | Preuve/source | Limite maintenue |
| --- | --- | --- |
| Tir direct, portée, jets de touche/blessure/sauvegarde, PA, dégâts fixes et allocation déterministe | 04, 05.01–05.04, pages 16, 18–19 ; `core-basic-shooting-v1` | Un profil numérique fermé, une seule cible et sans choix d'allocation ambigu. |
| Couvert | 13.08, p. 50 | Applique seulement la convention M4 de dégradation de CT; le couvert n'est pas une LoS. |
| Oath of Moment | Catalogues Salamanders et Blood Angels `1.2.13.0` | Deux variantes exactes du pilote; pas une primitive générique de faction. |
| [PISTOLET] | 24.27, p. 84, lié à 24.07 et 10.06 | Garde M4 borné : pas de tir engagé générique. |
| Visibilité et géométrie | ADR-008, convention `m4-sampled-cylinder-los-v1` | Quinze points par cylindre, terrain statique seulement; approximation locale M4. |

Les écarts visibles dans les données du pilote sont notamment les SvIn 4+ des
Bladeguard et du Captain, les groupes de PV différents, les quatre unités
sélectionnables et le besoin d'employer d'autres profils que le seul *Heavy
bolt pistol*. Ils sont donc des entrées de travail, non des règles ignorées.

Le pilote M4 reste volontairement fermé : les quatorze porteurs actifs ont
uniquement le *Heavy bolt pistol* (18", A1, CT 2+/3+, F4, PA -1, D1). Les
autres options sont aujourd'hui interdites par son approbation; elles ne sont
pas activées par cette matrice.

## Capacités atomiques et ordre de livraison

| Ordre / tâche | Capacité atomique | Source canonique | Contrat exécutable et refus | Golden case minimal |
| --- | --- | --- | --- | --- |
| M5-T02.0 — `implemented-pending-task` | Normalisation fermée des profils et mots-clés | 24.10, 24.15, 24.18, 24.25, 24.27 et 24.37, pp. 80, 79, 82, 84–85 ; options de catalogue pilotées | Une primitive pure normalise uniquement les alias explicitement sourcés (`HAZARDOUS`, `DEVASTATING WOUNDS`, `MELTA X`, `IGNORES COVER`, `TORRENT`, `PISTOL`) dans un ordre canonique avec leur provenance. Tout mot-clé, doublon ou expression inconnue est rejeté ; aucun effet ni loadout n'est activé par cette normalisation seule. | Les six alias exacts passent avec leur provenance ; faute de frappe, doublon ou mot-clé supplémentaire = refus explicite sans état/PRNG. |
| M5-T02.1 — `implemented-pending-task` | Valeurs d'Attaques et de Dégâts exprimées (`N`, `D3`, `D6`, additions) | 01.05, p. 9 ; 02.04, p. 10 ; 04.03, p. 17 ; application officielle `02.02.03` | Le parser typé distingue les valeurs après `+` dans une caractéristique des modificateurs. `D3` jette physiquement un D6 puis l'arrondit à la moitié supérieure, et ce D6 brut est journalisé. Une fixture génère l'A de chaque arme physique individuellement avant tout jet de touche, puis D après chaque allocation non sauvegardée ; les dés, valeurs, provenances, PRNG et pertes sont recalculés au replay. Toute expression non couverte est rejetée avant PRNG. Aucun profil réel M4 n'est promu par ce contrat. | Fixture `D3` en A par arme physique et `D3` en D par allocation ; D6 brut 3 donne D3=2 ; syntaxe non couverte = refus sans état ni entropie. |
| M5-T02.2 — `implemented-pending-task` | Plan de modificateurs de portée, Attaques, CT et jet de touche | 02.04, p. 10 ; 05.01, p. 18 ; 10.02, p. 34 ; application officielle `02.02.01` | Le plan applique remplacement, multiplication, addition, division, soustraction, puis arrondi supérieur. Une valeur remplacée par 0 reste 0. Les relances précèdent les modificateurs de jets, tandis que les 1 et 6 non modifiés gardent respectivement leurs échec et touche critique obligatoires ; CT reste entre 1+ et 7+. Les plafonds et le choix partiel d'ignorer des modificateurs sont explicites. Les faits compilés de fixture modifient portée, A, CT et jet de touche, sont inclus dans l'empreinte d'environnement, l'événement et son replay. M4 Oath/couvert demeurent leurs contrats fermés, sans promotion de nouveau profil réel. | Fixture hors portée sans modificateur puis légale avec Portée +1000, A +1, CT dégradée et +1 au jet de touche ; 1 non modifié amélioré et 6 non modifié dégradé ; provenance/opération inconnue = refus sans tir. |
| M5-T02.3 — `implemented-pending-task` | [TIR RAPIDE X] et [DÉFLAGRATION X] | 24.30, p. 85 ; 24.05, p. 81 | Le nombre de dés est figé au choix des cibles, à mi-portée pour Tir rapide et par tranches de 5 pour Déflagration; le nombre de figurines vient de l'état autoritaire. Le moteur journalise la ventilation et refuse toute injection de ce compte. | Limite exacte de mi-portée et cible de 4/5/10 figurines; tentative de fournir un compte depuis l'UI refusée; replay déterministe. |
| M5-T02.4 — `implemented-pending-task` | Éligibilité « unité choisie pour tirer » | 10.02, p. 34 | Une unité active ne peut être choisie qu'une fois dans la phase; l'événement mémorise le choix et les armes déclarées. Plusieurs profils vers une même cible sont validés atomiquement avant le PRNG; le split fire reste M5-T05. | Deux armes d'une même unité dans une déclaration légale; seconde sélection d'unité rejetée sans PRNG; réinitialisation à la phase de tir suivante. |
| M5-T03.1 — `covered` | Relances génériques de jets de touche et de blessure | Application officielle 01.05.02 ; 02.02.01 ; 05.01–05.02, p. 18 ; [JUMELÉ], 24.38, p. 83 ; ADR-011 ; Oath M4 comme régression | La fixture versionnée `simulator.fixture-generic-rerolls-v1` journalise le choix `keep`/`reroll` par D6 de touche puis de blessure, dans un ordre stable. Le PRNG ne progresse que pour les dés relancés ; une clé n'est proposée qu'une fois, avant les modificateurs, et son résultat relancé déclenche normalement un critique. Un jet additif est spécifié comme groupe atomique par 01.05.02 mais reste refusé hors fixture tant qu'un contrat dédié n'est pas livré. [JUMELÉ] est normalisé seulement sous ce libellé français sourcé et ouvre les blessures, avec les provenances 01.05.02 et 24.38. Aucun profil réel M4 n'est activé. | Choix mixte de conservation/relance, 6 relancé critique après modificateur, seconde relance/demande hors fenêtre sans entropie ; V3 export/import/replay, V1/V2 refusés. |
| M5-T03.2 — `covered` | Touche/blessure critique comme résultat non modifié et [ANTI-X Y+] | 05.01–05.02, p. 18 ; [ANTI-X Y+], 24.03, p. 79 | Les résultats non modifiés restent distincts des résultats modifiés. Le seuil [ANTI] ne s'applique qu'au mot-clé cible tiré de l'état autoritaire. Le contrat et le replay refusent provenance, mot-clé, doublon ou profil inconnus avant PRNG. | `ANTI-VÉHICULE 4+` contre cible avec/sans mot-clé ; naturel 1 ; aucune touche critique ne naît d'une simple modification ; replay exact. |
| M5-T03.3a — `covered` | Déclencheur [TOUCHES SOUTENUES X] | 24.36, p. 85 | Une touche critique crée X touches supplémentaires distinctes, non critiques, portant l'identifiant de la touche critique d'origine. Elles suivent les jets de blessure, allocations et le replay normaux ; doublons et profils inconnus sont refusés avant PRNG. | Critique avec X=2 : trois touches au total, deux supplémentaires tracées, ordre de dés et replay exacts. |
| M5-T03.3b — `covered` | Déclencheur [TOUCHES FATALES] | 24.23, p. 85 ; ADR-010 | Une arme de fixture couverte interrompt après les touches critiques, ouvre une `DecisionRequest` ordonnée par touche et journalise `auto-wound` ou `roll-to-wound` sans consommer de PRNG. La complétion reprend au PRNG du stade de touche ; une auto-blessure est non critique et omet seulement son jet de blessure. Les journaux interrompus exigent `SimulationSaveV3`, vérifient environnement/ordre/choix au replay et refusent V1/V2. Limite : un profil, un porteur, une instance, A/D fixes, sans relance, modificateur, [ANTI] ni [TOUCHES SOUTENUES]. | Deux critiques avec choix mixtes ; aucune entropie pendant les choix ; export/import au milieu de la fenêtre puis replay final ; journal, clé, joueur, option, ordre, PRNG ou version falsifiés refusés. |
| M5-T04.1 — `candidate` | Test automatique Sv / SvIn | 02.02, p. 10 ; 05.04, p. 19 | Pour un même jet, le moteur applique les conditions de 05.04 dans leur ordre : succès via SvIn si le résultat satisfait son seuil, sinon test de Sv après application de la PA, sinon dégâts. Le défenseur ne choisit jamais le type de sauvegarde. | Captain Sv3+/SvIn4+ contre PA-4 : naturel 4 réussit par SvIn alors que l'armure modifiée échoue; aucun choix de type de sauvegarde n'est demandé. |
| M5-T04.2 — `candidate/blocked` | Dégâts variables et [FUSION X] | 01.05, p. 9 ; 24.25, p. 82 ; 05.04, p. 19 | L'*inferno pistol* du Captain est l'exemple prévu (D3, MELTA 2) mais son activation requiert l'option approuvée et la source de soutien aléatoire. La distance est figée au choix des cibles. | À 3"/au-delà de 3", même graine : bonus seulement à mi-portée; expression/condition absente refusée. |
| M5-T04.3 — `candidate` | Blessures dévastatrices et blessures mortelles | 05.01–05.02, p. 18 ; 24.10, p. 80 ; 06.02, p. 24 | Le *neo-volkite pistol* est le cas attendu : critique, aucune sauvegarde, blessures mortelles après le normal et plafond d'une figurine par critique. La séquence 06.02 est extraite dans le corpus local ; sa mise en œuvre exige toutefois le journal V4 d'ADR-012. | Blessure naturelle 6, D2, aucune sauvegarde et aucun débordement sur une seconde figurine. |
| M5-T04.4 — `candidate` | Groupes et décisions d'allocation | 05.03–05.04, p. 19 | Le défenseur choisit l'ordre des groupes valide, puis la figurine du groupe actuel pour les dégâts, en respectant les priorités de figurine blessée et de PERSONNAGE. Ces décisions deviennent `DecisionRequest`, jamais un choix implicite de l'UI. | Deux Bladeguard valides : la figurine choisie reçoit D2; choix hors groupe ou qui ignore une figurine déjà blessée ne modifie ni état ni PRNG. |
| M5-T04.5 — `candidate` | Prévention/réduction de dégâts, dont Insensible à la Douleur | 24.12, p. 83 | Primitive testable isolément, sans l'activer dans M4 puisqu'aucun profil approuvé ne la porte. Les réductions de dégâts restent bloquées faute de source pilote et de règle de soutien. | FNP 5+ avec graine fixe; capacité absente = rejet, jamais approximation. |
| M5-T04.6 — `candidate` | [À RISQUE] et [TIR UNIQUE] | 24.15, p. 79 ; 24.26, p. 85 ; 06.02–06.03, p. 24 | Un jet À risque intervient seulement après toutes les attaques d'une unité et dépend d'une déclaration complète; Tir unique est un état durable. Les sources sont extraites ; l'activation reste limitée à une fixture et au journal V4 d'ADR-012, sans nouveau profil M4. | Un plasma superchargé : tir puis un seul jet À risque; Tir unique refusé au second emploi après import. |
| M5-T05.1 — `candidate/blocked` | Choix de profils alternatifs et équipement mixte | 02.07, p. 11 ; 04.01–04.03, pp. 16–17 ; « Profils d'Arme Multiples » à versionner | Instances `modelId:weaponId`, et plasma standard **ou** superchargé : jamais les deux. L'approbation M4 interdit encore hand flamer, plasma, neo-volkite et inferno; une nouvelle approbation de loadout est requise. | Quatre pistols + un plasma, standard ou surchargé; double profil/mauvais porteur refusé avant tir. |
| M5-T05.2 — `candidate` | Déclaration multi-armes, split fire et ordre | 04.01–04.03, pp. 16–17 ; exemples pp. 20–23 | Un plan entier (instance arme/modèle → cible) est validé avant les jets; groupes identiques et ordre de résolution sont figés. La politique d'atomicité recommandée est : déclaration invalide = rejet intégral sans PRNG. | Deux pistols vers le Captain et trois vers les Intercessors; instance dupliquée, cible illégale ou hors portée/LoS = refus du plan. |
| M5-T05.3 — `deferred` | [PRÉCISION], unités attachées, [TIR INDIRECT] et tir engagé | 19.03–19.04, p. 67 ; 24.28, p. 84 ; 10.06–10.07, p. 35 ; 24.19 et 24.27, pp. 84–85 | Ces contrats exigent unités attachées, engagement/mouvement ou états non construits. Ils restent refusés jusqu'à leurs jalons propriétaires; le garde [PISTOLET] M4 ne les généralise pas. | Aucune promotion M5 sans modèle d'attachement et source/profile approuvés. |
| M5-T05.4 — `candidate` | Occurrences dupliquées d'une même aptitude et choix du joueur | 24.01–24.02, p. 78 | Plusieurs occurrences de la **même** aptitude de base ou d'arme ne se cumulent pas, y compris si leur nombre ou mot-clé diffère; le joueur choisit l'occurrence applicable. Des aptitudes différentes suivent chacune leur propre contrat. Tout choix obligatoire devient `DecisionRequest` et est journalisé. | Deux [TOUCHES SOUTENUES] de valeurs différentes : choix d'une seule occurrence; absence de réponse garde l'état sans consommer le PRNG. |

## Limites intentionnelles après M5-T01

- `[ASSAUT]`, `[COMBAT RAPPROCHÉ]`/`[PISTOLET]` en tir engagé, les
  MONSTRES/VÉHICULES engagés et l'interaction avec Charge/Combat exigent les
  mouvements et l'engagement génériques : ils restent hors couverture jusqu'à
  M7, à l'exception du garde fermé M4 déjà livré.
- Règles d'armée, de détachement, stratagèmes et améliorations ne sont pas
  généralisés par M5. Les primitives génériques qu'elles pourront consommer
  n'autorisent pas leur activation sans source et couverture propres en M6 ou
  jalon ultérieur.
- Transports, Pont de Tir, réserves et déploiements spéciaux restent M10.
- Un mot-clé absent de cette matrice est rejeté : il n'est pas implicitement
  traité comme une arme sans aptitude.

## Décisions d'implémentation qui restent ouvertes

1. Le schéma M5-T02 accepte uniquement `N`, `D3`, `D6`, un nombre de dés et
   une addition non négative. `D3` signifie un D6 divisé par deux, arrondi au
   supérieur. Multiplication, soustraction et toute autre forme restent
   explicitement invalides jusqu'à une décision et une source supplémentaires.
2. Les choix défenseur et les choix de déclencheur doivent être représentés par
   `DecisionRequest`, plutôt que calculés par l'UI ou résolus arbitrairement.
3. L'unité attachée est nécessaire à [PRÉCISION] : si le modèle d'attachement
   n'est pas prêt lors de M5-T05, cette sous-capacité reste `deferred` avec un
   refus explicite, sans bloquer les primitives précédentes.
4. Les références locales couvrent désormais les caractéristiques aléatoires,
   les modificateurs et les blessures mortelles nécessaires à T02–T04. La
   réduction générique de dégâts et les profils d'arme multiples restent
   refusés tant qu'un contrat sourcé et testé ne les couvre pas.
5. Les PDF Space Marines et Blood Angels nécessaires au pilote sont désormais
   enregistrés comme sources de simulateur avec identifiant, version, date et
   empreinte. Toute faction ou option hors de ce périmètre exigera sa propre
   source avant activation.
6. Obtenir une approbation humaine de chaque nouveau loadout M5 : le consentement
   M4 ne couvre que les *Heavy bolt pistols* et interdit les options alternatives.

## Gate de clôture de chaque sous-tâche

Pour toute ligne promue, ajouter une source/version dans les faits ou
rulepacks, des tests positifs/négatifs/de provenance, un replay à graine fixe
et un test d'absence de consommation du PRNG en cas de refus. Ensuite seulement
la matrice de couverture peut passer cette ligne à `covered`.
