# ADR-006 — Pilote de rosters réels et priorité au tir étendu

- Statut : accepté
- Date : 2026-08-13
- Plan version : 2.0.0

## Contexte

M3 a validé le moteur sur deux unités synthétiques, mais ne démontre pas encore que Warforge sait adapter des `RosterDraft` du catalogue actif. Le plan 1.1 regroupait dans un même jalon l'ensemble du tir, du combat, des missions et des factions ; ce périmètre était trop large pour produire des sorties auditables et rendait la prochaine promesse produit ambiguë.

Le propriétaire du projet fixe trois priorités : rendre deux rosters réels jouables en commençant par Salamanders contre Blood Angels, limiter le pilote à quelques unités choisies, puis fiabiliser le tir étendu avant les autres systèmes.

## Décision

Le plan passe en version 2.0.0 et remplace les anciens M4 et M5 par une feuille de route M4 à M11.

M4 livre deux petits rosters réels et versionnés dans le scénario fermé `real-roster-shooting-duel-v1`. Les compositions exactes, options d'équipement et détachements sont sélectionnés depuis le catalogue actif puis approuvés humainement. Par défaut, chaque camp contient deux à quatre fiches orientées infanterie et au plus un personnage ; véhicules, transports et capacités exigeant une phase non implémentée restent hors périmètre.

« Jouable » signifie pour M4 : importer ou sélectionner les deux `RosterDraft`, placer selon le scénario, se déplacer, cibler, résoudre les tirs et pertes, sauvegarder, reprendre et rejouer. Cela ne signifie pas encore jouer une partie complète ni supporter tous les Salamanders, Blood Angels ou Space Marines.

M5 est exclusivement consacré au tir étendu. Il formalise puis implémente les modificateurs, mots-clés, décisions et chaînes de dégâts révélés par les rosters réels. Charge/Combat et les systèmes de mission ne commencent qu'après l'acceptation de M5.

## Conséquences

- Le prochain travail est la sélection sourcée et l'approbation des deux compositions pilotes, pas l'adaptation générique de tout roster.
- Le rapport de compatibilité est exhaustif et bloquant : aucune règle de tir obligatoire ne peut être ignorée silencieusement.
- Les identités Salamanders et Blood Angels sont couvertes seulement pour les versions exactes des rosters pilotes et le scénario M4.
- Les extensions de factions se font après le durcissement générique du tir afin d'éviter d'encoder des exceptions propres à une liste.
- Les anciens identifiants M4/M5 non commencés sont remplacés ; M0 à M3 et leurs preuves restent inchangés.
