# Analyse des missions secondaires GDM 2026 — mode Tactique

**Projection générée depuis `data/strategy/knowledge-base.json` — ne pas modifier manuellement.**

**Édition :** Warhammer 40,000 V11  
**Pack :** GDM 2026 — 11th Edition (`gdm-2026-11th`)  
**Date de l’analyse :** 11 août 2026  
**Périmètre :** construction de liste et pilotage génériques, sans recommandation de faction.

## Provenance et niveaux de preuve

- Le fonctionnement général du mode Tactique est sourcé par le *Compagnon de Rencontre Warhammer* v1.1, document officiel archivé localement.
- Les conditions propres aux 18 cartes proviennent de l’archive GDM 2026 V11 récupérée le 8 août 2026, approuvée pour le développement mais non officielle.
- Les modèles de rendement, opportunités, menaces, séquences et décisions sont des inférences stratégiques revues. Ils ne prédisent ni dés, ni score, ni réussite.

## Cadre officiel du portefeuille Tactique

- À chaque phase de Commandement, **2 nouvelles cartes** sont piochées et deviennent actives.
- Une carte non accomplie et non défaussée **reste active** : le portefeuille peut donc croître d’un tour à l’autre.
- Une carte accomplie est résolue puis défaussée à la fin du tour concerné.
- À la fin de son propre tour, le joueur peut défausser volontairement une ou plusieurs cartes actives et gagne **1 PC**.
- Une fois par bataille, à la fin de sa phase de Commandement, il peut dépenser **1 PC** pour défausser une carte active et en piocher une nouvelle.
- Le score secondaire est plafonné à **15 PdV par round** et **45 PdV par bataille**.

Ces mécanismes imposent trois décisions distinctes : conserver une carte active avec un horizon explicite, la défausser volontairement en fin de son tour pour libérer le portefeuille et gagner 1 PC, ou consommer le remplacement immédiat à 1 PC disponible une seule fois par bataille. Les options particulières « Lorsque piochée » restent propres aux cartes qui les portent.

## Principes de pilotage transversal

1. Inventorier toutes les cartes actives, leur fenêtre et leur horizon avant d’allouer une unité.
2. Favoriser les lignes qui convergent avec le primaire, le déni ou la position du tour suivant.
3. Mesurer le coût marginal : unités, activations, PC, exposition et options abandonnées.
4. Préserver de la redondance : une unité ne peut pas fournir simultanément dégâts, présence, action et écran dans plusieurs zones.
5. Réévaluer en fin de tour les cartes sans horizon crédible au lieu de laisser le portefeuille monopoliser les ressources.

## 1. Destruction ciblée

Les cartes de la famille « Destruction ciblée » mutualisent certaines capacités, mais leur accumulation peut mettre les mêmes unités en concurrence avec le primaire et les autres familles actives.

**Rapprochement familial.** Deux nouvelles cartes sont piochées à chaque phase de Commandement et les cartes non accomplies ou non défaussées restent actives : la contrainte porte donc sur un portefeuille croissant, pas sur une paire isolée.

**Capacités mutualisables :** `concentrated-damage`, `distributed-damage`, `target-access`.

### A Grievous Blow

**Fait de mission sourcé.** En Tactique, marquer 5 PdV à la fin d’un tour si au moins une unité ennemie de force initiale 13 ou plus a été détruite pendant ce tour. Si aucune cible éligible n’est présente au tirage, la clause « Lorsque piochée » autorise à défausser cette carte et à en piocher une nouvelle.
**Fenêtres déclarées :** Chaque round de bataille — à la fin d’un tour..

**Capacités requises.**

- `concentrated-damage` (core) : Pouvoir achever une cible robuste dans la fenêtre de score.
- `distributed-damage` (core) : Pouvoir répartir les destructions entre plusieurs unités éligibles.
- `target-access` (supporting) : Atteindre les cibles pertinentes malgré écrans, lignes de vue ou protection.

#### Rendement tactique

En Tactique, marquer 5 PdV à la fin d’un tour si au moins une unité ennemie de force initiale 13 ou plus a été détruite pendant ce tour. Si aucune cible éligible n’est présente au tirage, la clause « Lorsque piochée » autorise à défausser cette carte et à en piocher une nouvelle. Convertir la destruction complète d’une grande unité déjà importante pour le primaire en rendement secondaire, sans disperser les dégâts entre plusieurs cibles. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Identifier une cible principale et une cible de repli, engager d’abord les attaques les moins polyvalentes, puis garder une activation de finition. Si la cible survit largement, arrêter l’escalade et préserver les ressources du primaire. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Convertir la destruction complète d’une grande unité déjà importante pour le primaire en rendement secondaire, sans disperser les dégâts entre plusieurs cibles. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

L’adversaire peut masquer, éloigner ou protéger l’unique cible accessible ; entamer plusieurs grandes unités sans en achever une ne marque rien. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : L’adversaire peut masquer, éloigner ou protéger l’unique cible accessible ; entamer plusieurs grandes unités sans en achever une ne marque rien. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** L’adversaire peut masquer, éloigner ou protéger l’unique cible accessible ; entamer plusieurs grandes unités sans en achever une ne marque rien.

#### Séquence conseillée

Identifier une cible principale et une cible de repli, engager d’abord les attaques les moins polyvalentes, puis garder une activation de finition. Si la cible survit largement, arrêter l’escalade et préserver les ressources du primaire. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Convertir la destruction complète d’une grande unité déjà importante pour le primaire en rendement secondaire, sans disperser les dégâts entre plusieurs cibles. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Au tirage, appliquer d’abord l’option particulière « Lorsque piochée » si sa condition est satisfaite. Sinon, conserver la carte active tant qu’un horizon crédible existe ; la défausser volontairement en fin de son propre tour pour gagner 1 PC si son coût d’opportunité devient supérieur à sa valeur ; réserver le remplacement à 1 PC, une fois par bataille, aux situations où renouveler immédiatement le portefeuille est décisif.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Une grande unité ennemie tient un objectif médian et se trouve déjà dans les angles de deux pièces offensives ; une autre cible éligible reste derrière un écran.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de A Grievous Blow, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Convertir la destruction complète d’une grande unité déjà importante pour le primaire en rendement secondaire, sans disperser les dégâts entre plusieurs cibles. Identifier une cible principale et une cible de repli, engager d’abord les attaques les moins polyvalentes, puis garder une activation de finition. Si la cible survit largement, arrêter l’escalade et préserver les ressources du primaire.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. L’adversaire peut masquer, éloigner ou protéger l’unique cible accessible ; entamer plusieurs grandes unités sans en achever une ne marque rien. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### Assassination

**Fait de mission sourcé.** En Tactique, marquer 5 PdV à la fin du tour de l’un ou l’autre joueur si au moins un modèle Personnage ennemi a été détruit ce tour, ou si tous les Personnages ennemis ont été détruits pendant la bataille.
**Fenêtres déclarées :** Chaque round de bataille — déclencheur archivé : While this card is active. ; Chaque round de bataille — déclencheur archivé : End of either player's turn..

**Capacités requises.**

- `concentrated-damage` (core) : Pouvoir achever une cible robuste dans la fenêtre de score.
- `distributed-damage` (core) : Pouvoir répartir les destructions entre plusieurs unités éligibles.
- `target-access` (supporting) : Atteindre les cibles pertinentes malgré écrans, lignes de vue ou protection.

#### Rendement tactique

En Tactique, marquer 5 PdV à la fin du tour de l’un ou l’autre joueur si au moins un modèle Personnage ennemi a été détruit ce tour, ou si tous les Personnages ennemis ont été détruits pendant la bataille. Faire coïncider la suppression d’un meneur ou support avec l’amélioration des échanges futurs, plutôt que lancer une chasse sans valeur positionnelle. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Suivre les Personnages blessés et les unités protectrices, créer une exposition par le mouvement ou la destruction de l’escorte, puis conserver une source précise pour terminer la cible. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Faire coïncider la suppression d’un meneur ou support avec l’amélioration des échanges futurs, plutôt que lancer une chasse sans valeur positionnelle. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

Les Personnages peuvent rester protégés ou hors de portée ; une poursuite forcée détourne facilement les unités rapides du primaire. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : Les Personnages peuvent rester protégés ou hors de portée ; une poursuite forcée détourne facilement les unités rapides du primaire. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** Les Personnages peuvent rester protégés ou hors de portée ; une poursuite forcée détourne facilement les unités rapides du primaire.

#### Séquence conseillée

Suivre les Personnages blessés et les unités protectrices, créer une exposition par le mouvement ou la destruction de l’escorte, puis conserver une source précise pour terminer la cible. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Faire coïncider la suppression d’un meneur ou support avec l’amélioration des échanges futurs, plutôt que lancer une chasse sans valeur positionnelle. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Conserver la carte active tant qu’un horizon crédible existe et que les ressources qu’elle immobilise restent compatibles avec les autres cartes actives. La défausser volontairement en fin de son propre tour pour gagner 1 PC si cet horizon disparaît. N’utiliser le remplacement à 1 PC, une fois par bataille, que si renouveler immédiatement le portefeuille vaut ce coût et cette ressource unique.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Un meneur accompagne l’unité qui conteste l’objectif central tandis qu’un second Personnage reste caché ; retirer l’escorte sert déjà le plan de bataille.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Assassination, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Faire coïncider la suppression d’un meneur ou support avec l’amélioration des échanges futurs, plutôt que lancer une chasse sans valeur positionnelle. Suivre les Personnages blessés et les unités protectrices, créer une exposition par le mouvement ou la destruction de l’escorte, puis conserver une source précise pour terminer la cible.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. Les Personnages peuvent rester protégés ou hors de portée ; une poursuite forcée détourne facilement les unités rapides du primaire. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### Bring It Down

**Fait de mission sourcé.** En Tactique, détruire pendant un tour au moins un modèle ennemi ayant une caractéristique de Blessures de 10 ou plus rapporte 5 PdV à la fin de ce tour. Sans cible éligible au tirage, la clause permet de défausser et repiocher.
**Fenêtres déclarées :** Chaque round de bataille — à la fin d’un tour..

**Capacités requises.**

- `concentrated-damage` (core) : Pouvoir achever une cible robuste dans la fenêtre de score.
- `distributed-damage` (core) : Pouvoir répartir les destructions entre plusieurs unités éligibles.
- `target-access` (supporting) : Atteindre les cibles pertinentes malgré écrans, lignes de vue ou protection.

#### Rendement tactique

En Tactique, détruire pendant un tour au moins un modèle ennemi ayant une caractéristique de Blessures de 10 ou plus rapporte 5 PdV à la fin de ce tour. Sans cible éligible au tirage, la clause permet de défausser et repiocher. Achever un véhicule ou monstre qui menace déjà le plan principal, en gardant assez de dégâts fiables pour franchir le dernier palier de blessures. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Choisir la cible dont la destruction apporte aussi position, sécurité ou contrôle ; séquencer réduction défensive, dégâts spécialisés puis finition, avec un seuil d’arrêt après chaque activation. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Achever un véhicule ou monstre qui menace déjà le plan principal, en gardant assez de dégâts fiables pour franchir le dernier palier de blessures. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

La cible peut être masquée, réparée ou retirée de portée ; surinvestir contre une pièce peu importante ouvre ailleurs le plan adverse. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : La cible peut être masquée, réparée ou retirée de portée ; surinvestir contre une pièce peu importante ouvre ailleurs le plan adverse. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** La cible peut être masquée, réparée ou retirée de portée ; surinvestir contre une pièce peu importante ouvre ailleurs le plan adverse.

#### Séquence conseillée

Choisir la cible dont la destruction apporte aussi position, sécurité ou contrôle ; séquencer réduction défensive, dégâts spécialisés puis finition, avec un seuil d’arrêt après chaque activation. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Achever un véhicule ou monstre qui menace déjà le plan principal, en gardant assez de dégâts fiables pour franchir le dernier palier de blessures. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Au tirage, appliquer d’abord l’option particulière « Lorsque piochée » si sa condition est satisfaite. Sinon, conserver la carte active tant qu’un horizon crédible existe ; la défausser volontairement en fin de son propre tour pour gagner 1 PC si son coût d’opportunité devient supérieur à sa valeur ; réserver le remplacement à 1 PC, une fois par bataille, aux situations où renouveler immédiatement le portefeuille est décisif.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Un véhicule endommagé bloque le couloir vers un objectif, mais une seconde cible plus robuste menace votre centre ; les dégâts de finition ne peuvent couvrir les deux.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Bring It Down, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Achever un véhicule ou monstre qui menace déjà le plan principal, en gardant assez de dégâts fiables pour franchir le dernier palier de blessures. Choisir la cible dont la destruction apporte aussi position, sécurité ou contrôle ; séquencer réduction défensive, dégâts spécialisés puis finition, avec un seuil d’arrêt après chaque activation.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. La cible peut être masquée, réparée ou retirée de portée ; surinvestir contre une pièce peu importante ouvre ailleurs le plan adverse. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### No Prisoners

**Fait de mission sourcé.** En Tactique, chaque unité ennemie détruite pendant le tour rapporte 2 PdV à la fin de ce tour.
**Fenêtres déclarées :** Chaque round de bataille — à la fin d’un tour..

**Capacités requises.**

- `concentrated-damage` (core) : Pouvoir achever une cible robuste dans la fenêtre de score.
- `distributed-damage` (core) : Pouvoir répartir les destructions entre plusieurs unités éligibles.
- `target-access` (supporting) : Atteindre les cibles pertinentes malgré écrans, lignes de vue ou protection.

#### Rendement tactique

En Tactique, chaque unité ennemie détruite pendant le tour rapporte 2 PdV à la fin de ce tour. Achever plusieurs unités déjà entamées ou fragiles, tout en évitant de disperser les attaques au point de ne convertir aucune destruction. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Classer les cibles par coût de finition et valeur positionnelle, confirmer chaque destruction avant de passer à la suivante, puis arrêter dès que la prochaine cible exige une ressource structurante. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Achever plusieurs unités déjà entamées ou fragiles, tout en évitant de disperser les attaques au point de ne convertir aucune destruction. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

L’adversaire peut cacher les unités affaiblies ou forcer des attaques inefficaces ; plusieurs cibles presque mortes ne produisent aucun rendement tant qu’elles ne sont pas achevées. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : L’adversaire peut cacher les unités affaiblies ou forcer des attaques inefficaces ; plusieurs cibles presque mortes ne produisent aucun rendement tant qu’elles ne sont pas achevées. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** L’adversaire peut cacher les unités affaiblies ou forcer des attaques inefficaces ; plusieurs cibles presque mortes ne produisent aucun rendement tant qu’elles ne sont pas achevées.

#### Séquence conseillée

Classer les cibles par coût de finition et valeur positionnelle, confirmer chaque destruction avant de passer à la suivante, puis arrêter dès que la prochaine cible exige une ressource structurante. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Achever plusieurs unités déjà entamées ou fragiles, tout en évitant de disperser les attaques au point de ne convertir aucune destruction. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Conserver la carte active tant qu’un horizon crédible existe et que les ressources qu’elle immobilise restent compatibles avec les autres cartes actives. La défausser volontairement en fin de son propre tour pour gagner 1 PC si cet horizon disparaît. N’utiliser le remplacement à 1 PC, une fois par bataille, que si renouveler immédiatement le portefeuille vaut ce coût et cette ressource unique.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Deux unités ennemies affaiblies contestent des objectifs distincts ; une troisième est facile à atteindre mais sans importance pour le primaire.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de No Prisoners, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Achever plusieurs unités déjà entamées ou fragiles, tout en évitant de disperser les attaques au point de ne convertir aucune destruction. Classer les cibles par coût de finition et valeur positionnelle, confirmer chaque destruction avant de passer à la suivante, puis arrêter dès que la prochaine cible exige une ressource structurante.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. L’adversaire peut cacher les unités affaiblies ou forcer des attaques inefficaces ; plusieurs cibles presque mortes ne produisent aucun rendement tant qu’elles ne sont pas achevées. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### Overwhelming Force

**Fait de mission sourcé.** En Tactique, chaque unité ennemie qui a commencé le tour à portée d’un ou plusieurs objectifs et qui est détruite pendant ce tour rapporte 3 PdV à la fin du tour.
**Fenêtres déclarées :** Chaque round de bataille — à la fin d’un tour..

**Capacités requises.**

- `concentrated-damage` (core) : Pouvoir achever une cible robuste dans la fenêtre de score.
- `distributed-damage` (core) : Pouvoir répartir les destructions entre plusieurs unités éligibles.
- `target-access` (supporting) : Atteindre les cibles pertinentes malgré écrans, lignes de vue ou protection.

#### Rendement tactique

En Tactique, chaque unité ennemie qui a commencé le tour à portée d’un ou plusieurs objectifs et qui est détruite pendant ce tour rapporte 3 PdV à la fin du tour. Faire de la reprise d’objectifs une opération de destruction complète, en suivant l’état de début de tour plutôt que la position finale des cibles. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Marquer les unités éligibles au début du tour, prioriser celles dont la destruction change aussi le contrôle, puis séquencer les finitions avant les cibles non éligibles. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Faire de la reprise d’objectifs une opération de destruction complète, en suivant l’état de début de tour plutôt que la position finale des cibles. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

Une unité déplacée reste éligible si elle l’était au début, mais une cible arrivée ensuite ne l’est pas ; confondre ces états ou disperser les dégâts fait échouer la carte. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : Une unité déplacée reste éligible si elle l’était au début, mais une cible arrivée ensuite ne l’est pas ; confondre ces états ou disperser les dégâts fait échouer la carte. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** Une unité déplacée reste éligible si elle l’était au début, mais une cible arrivée ensuite ne l’est pas ; confondre ces états ou disperser les dégâts fait échouer la carte.

#### Séquence conseillée

Marquer les unités éligibles au début du tour, prioriser celles dont la destruction change aussi le contrôle, puis séquencer les finitions avant les cibles non éligibles. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Faire de la reprise d’objectifs une opération de destruction complète, en suivant l’état de début de tour plutôt que la position finale des cibles. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Conserver la carte active tant qu’un horizon crédible existe et que les ressources qu’elle immobilise restent compatibles avec les autres cartes actives. La défausser volontairement en fin de son propre tour pour gagner 1 PC si cet horizon disparaît. N’utiliser le remplacement à 1 PC, une fois par bataille, que si renouveler immédiatement le portefeuille vaut ce coût et cette ressource unique.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Deux unités ont commencé sur des objectifs ; l’une est fragile mais éloignée après un mouvement, l’autre robuste et toujours au centre. Les ressources ne garantissent pas les deux finitions.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Overwhelming Force, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Faire de la reprise d’objectifs une opération de destruction complète, en suivant l’état de début de tour plutôt que la position finale des cibles. Marquer les unités éligibles au début du tour, prioriser celles dont la destruction change aussi le contrôle, puis séquencer les finitions avant les cibles non éligibles.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. Une unité déplacée reste éligible si elle l’était au début, mais une cible arrivée ensuite ne l’est pas ; confondre ces états ou disperser les dégâts fait échouer la carte. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

## 2. Contrôle d’objectifs

Les cartes de la famille « Contrôle d’objectifs » mutualisent certaines capacités, mais leur accumulation peut mettre les mêmes unités en concurrence avec le primaire et les autres familles actives.

**Rapprochement familial.** Deux nouvelles cartes sont piochées à chaque phase de Commandement et les cartes non accomplies ou non défaussées restent actives : la contrainte porte donc sur un portefeuille croissant, pas sur une paire isolée.

**Capacités mutualisables :** `objective-control`, `durable-presence`, `screening`.

### A Tempting Target

**Fait de mission sourcé.** Au tirage, l’adversaire choisit dans le no man’s land un objectif qui n’est pas un objectif de base. En Tactique, le contrôler à la fin de votre tour rapporte 5 PdV.
**Fenêtres déclarées :** Chaque round de bataille — à la fin de votre tour..

**Capacités requises.**

- `objective-control` (core) : Gagner ou contester le contrôle des objectifs pertinents.
- `durable-presence` (core) : Rester présent jusqu’à la fenêtre de score malgré la réponse adverse.
- `screening` (supporting) : Limiter les accès adverses tout en protégeant les unités de mission.

#### Rendement tactique

Au tirage, l’adversaire choisit dans le no man’s land un objectif qui n’est pas un objectif de base. En Tactique, le contrôler à la fin de votre tour rapporte 5 PdV. Transformer une prise d’objectif déjà nécessaire en score, en préparant simultanément le déni adverse et la survie après la fenêtre. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Évaluer le contrôle réel après pertes et contre-charge, ouvrir l’accès avec le minimum de ressources, puis engager une unité de contrôle seulement lorsque le palier reste robuste. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Transformer une prise d’objectif déjà nécessaire en score, en préparant simultanément le déni adverse et la survie après la fenêtre. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

L’adversaire sélectionne généralement l’objectif le plus coûteux à atteindre et peut empiler contrôle, écran et menace de reprise. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : L’adversaire sélectionne généralement l’objectif le plus coûteux à atteindre et peut empiler contrôle, écran et menace de reprise. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** L’adversaire sélectionne généralement l’objectif le plus coûteux à atteindre et peut empiler contrôle, écran et menace de reprise.

#### Séquence conseillée

Évaluer le contrôle réel après pertes et contre-charge, ouvrir l’accès avec le minimum de ressources, puis engager une unité de contrôle seulement lorsque le palier reste robuste. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Transformer une prise d’objectif déjà nécessaire en score, en préparant simultanément le déni adverse et la survie après la fenêtre. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Au tirage, appliquer d’abord l’option particulière « Lorsque piochée » si sa condition est satisfaite. Sinon, conserver la carte active tant qu’un horizon crédible existe ; la défausser volontairement en fin de son propre tour pour gagner 1 PC si son coût d’opportunité devient supérieur à sa valeur ; réserver le remplacement à 1 PC, une fois par bataille, aux situations où renouveler immédiatement le portefeuille est décisif.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

L’objectif désigné est latéral, occupé par une unité de contrôle et couvert par une pièce de riposte ; une autre carte active demande déjà une présence centrale.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de A Tempting Target, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Transformer une prise d’objectif déjà nécessaire en score, en préparant simultanément le déni adverse et la survie après la fenêtre. Évaluer le contrôle réel après pertes et contre-charge, ouvrir l’accès avec le minimum de ressources, puis engager une unité de contrôle seulement lorsque le palier reste robuste.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. L’adversaire sélectionne généralement l’objectif le plus coûteux à atteindre et peut empiler contrôle, écran et menace de reprise. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### Burden of Trust

**Fait de mission sourcé.** Au tirage et au début de votre tour, une unité amie peut être désignée pour garder chaque objectif. À la fin du tour adverse ou du cinquième round, chaque objectif encore contrôlé et gardé rapporte 2 PdV.
**Fenêtres déclarées :** Chaque round de bataille — déclencheur archivé : End of your opponent's turn or the end of the fifth battle round (whichever comes first)..

**Capacités requises.**

- `objective-control` (core) : Gagner ou contester le contrôle des objectifs pertinents.
- `durable-presence` (core) : Rester présent jusqu’à la fenêtre de score malgré la réponse adverse.
- `screening` (supporting) : Limiter les accès adverses tout en protégeant les unités de mission.

#### Rendement tactique

Au tirage et au début de votre tour, une unité amie peut être désignée pour garder chaque objectif. À la fin du tour adverse ou du cinquième round, chaque objectif encore contrôlé et gardé rapporte 2 PdV. Distribuer des gardiens capables de survivre sans retirer toutes les unités utiles aux autres cartes actives, en privilégiant les objectifs déjà défendables. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Désigner d’abord les gardiens à faible coût marginal, renforcer les points que l’adversaire peut réellement attaquer et conserver une redondance pour les objectifs à forte pression. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Distribuer des gardiens capables de survivre sans retirer toutes les unités utiles aux autres cartes actives, en privilégiant les objectifs déjà défendables. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

L’adversaire connaît les gardiens et peut concentrer son feu, ébranler l’unité ou contester au bon moment ; trop de gardiens immobilisent le plan offensif. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : L’adversaire connaît les gardiens et peut concentrer son feu, ébranler l’unité ou contester au bon moment ; trop de gardiens immobilisent le plan offensif. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** L’adversaire connaît les gardiens et peut concentrer son feu, ébranler l’unité ou contester au bon moment ; trop de gardiens immobilisent le plan offensif.

#### Séquence conseillée

Désigner d’abord les gardiens à faible coût marginal, renforcer les points que l’adversaire peut réellement attaquer et conserver une redondance pour les objectifs à forte pression. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Distribuer des gardiens capables de survivre sans retirer toutes les unités utiles aux autres cartes actives, en privilégiant les objectifs déjà défendables. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Au tirage, appliquer d’abord l’option particulière « Lorsque piochée » si sa condition est satisfaite. Sinon, conserver la carte active tant qu’un horizon crédible existe ; la défausser volontairement en fin de son propre tour pour gagner 1 PC si son coût d’opportunité devient supérieur à sa valeur ; réserver le remplacement à 1 PC, une fois par bataille, aux situations où renouveler immédiatement le portefeuille est décisif.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Deux objectifs sont contrôlés : l’un est couvert et l’autre exposé. Une unité polyvalente pourrait garder le second, mais elle est aussi nécessaire pour une action active.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Burden of Trust, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Distribuer des gardiens capables de survivre sans retirer toutes les unités utiles aux autres cartes actives, en privilégiant les objectifs déjà défendables. Désigner d’abord les gardiens à faible coût marginal, renforcer les points que l’adversaire peut réellement attaquer et conserver une redondance pour les objectifs à forte pression.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. L’adversaire connaît les gardiens et peut concentrer son feu, ébranler l’unité ou contester au bon moment ; trop de gardiens immobilisent le plan offensif. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### Defend Stronghold

**Fait de mission sourcé.** Au premier round, cette carte est automatiquement remélangée après avoir pioché une nouvelle secondaire. À partir du deuxième round, contrôler votre objectif de base à la fin du tour adverse ou du cinquième round rapporte 3 PdV, plus 2 PdV si aucune unité ennemie n’est dans votre zone de déploiement.
**Fenêtres déclarées :** À partir du deuxième round de bataille — déclencheur archivé : End of your opponent's turn or the end of the fifth battle round (whichever comes first)..

**Capacités requises.**

- `objective-control` (core) : Gagner ou contester le contrôle des objectifs pertinents.
- `durable-presence` (core) : Rester présent jusqu’à la fenêtre de score malgré la réponse adverse.
- `screening` (supporting) : Limiter les accès adverses tout en protégeant les unités de mission.

#### Rendement tactique

Au premier round, cette carte est automatiquement remélangée après avoir pioché une nouvelle secondaire. À partir du deuxième round, contrôler votre objectif de base à la fin du tour adverse ou du cinquième round rapporte 3 PdV, plus 2 PdV si aucune unité ennemie n’est dans votre zone de déploiement. Sécuriser le palier de contrôle avec une défense proportionnée, puis traiter les infiltrations seulement si le bonus ne coûte pas davantage que sa valeur. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Maintenir une unité de contrôle protégée, conserver un écran ou une interception contre les arrivées et distinguer la sécurité de l’objectif du nettoyage complet de la zone. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Sécuriser le palier de contrôle avec une défense proportionnée, puis traiter les infiltrations seulement si le bonus ne coûte pas davantage que sa valeur. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

Une unité ennemie sacrifiable peut supprimer le bonus, tandis qu’une attaque concentrée peut faire perdre aussi le contrôle de base ; surprotéger l’arrière abandonne le milieu. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : Une unité ennemie sacrifiable peut supprimer le bonus, tandis qu’une attaque concentrée peut faire perdre aussi le contrôle de base ; surprotéger l’arrière abandonne le milieu. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** Une unité ennemie sacrifiable peut supprimer le bonus, tandis qu’une attaque concentrée peut faire perdre aussi le contrôle de base ; surprotéger l’arrière abandonne le milieu.

#### Séquence conseillée

Maintenir une unité de contrôle protégée, conserver un écran ou une interception contre les arrivées et distinguer la sécurité de l’objectif du nettoyage complet de la zone. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Sécuriser le palier de contrôle avec une défense proportionnée, puis traiter les infiltrations seulement si le bonus ne coûte pas davantage que sa valeur. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Au tirage, appliquer d’abord l’option particulière « Lorsque piochée » si sa condition est satisfaite. Sinon, conserver la carte active tant qu’un horizon crédible existe ; la défausser volontairement en fin de son propre tour pour gagner 1 PC si son coût d’opportunité devient supérieur à sa valeur ; réserver le remplacement à 1 PC, une fois par bataille, aux situations où renouveler immédiatement le portefeuille est décisif.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Votre base est tenue, mais une unité ennemie légère entre dans la zone de déploiement ; la poursuivre demanderait de quitter une position qui protège le primaire.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Defend Stronghold, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Sécuriser le palier de contrôle avec une défense proportionnée, puis traiter les infiltrations seulement si le bonus ne coûte pas davantage que sa valeur. Maintenir une unité de contrôle protégée, conserver un écran ou une interception contre les arrivées et distinguer la sécurité de l’objectif du nettoyage complet de la zone.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. Une unité ennemie sacrifiable peut supprimer le bonus, tandis qu’une attaque concentrée peut faire perdre aussi le contrôle de base ; surprotéger l’arrière abandonne le milieu. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### Forward Position

**Fait de mission sourcé.** Au premier round, la clause « Lorsque piochée » permet de repiocher puis remélanger cette carte. Sinon, contrôler à la fin de votre tour l’objectif de base adverse et/ou chaque objectif d’expansion rapporte 5 PdV.
**Fenêtres déclarées :** Chaque round de bataille — à la fin de votre tour..

**Capacités requises.**

- `objective-control` (core) : Gagner ou contester le contrôle des objectifs pertinents.
- `durable-presence` (core) : Rester présent jusqu’à la fenêtre de score malgré la réponse adverse.
- `screening` (supporting) : Limiter les accès adverses tout en protégeant les unités de mission.

#### Rendement tactique

Au premier round, la clause « Lorsque piochée » permet de repiocher puis remélanger cette carte. Sinon, contrôler à la fin de votre tour l’objectif de base adverse et/ou chaque objectif d’expansion rapporte 5 PdV. Transformer une percée déjà préparée en prise d’objectif profonde, en distinguant une fenêtre réelle d’une avance spectaculaire mais intenable. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Identifier l’objectif légal le moins coûteux, casser écran et contrôle avant la projection, conserver une unité de finition de mouvement et vérifier la contribution après le score. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Transformer une percée déjà préparée en prise d’objectif profonde, en distinguant une fenêtre réelle d’une avance spectaculaire mais intenable. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

L’adversaire peut empiler contrôle et contre-charge sur les objectifs profonds ; une unité projetée seule marque parfois au prix d’un effondrement du centre. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : L’adversaire peut empiler contrôle et contre-charge sur les objectifs profonds ; une unité projetée seule marque parfois au prix d’un effondrement du centre. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** L’adversaire peut empiler contrôle et contre-charge sur les objectifs profonds ; une unité projetée seule marque parfois au prix d’un effondrement du centre.

#### Séquence conseillée

Identifier l’objectif légal le moins coûteux, casser écran et contrôle avant la projection, conserver une unité de finition de mouvement et vérifier la contribution après le score. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Transformer une percée déjà préparée en prise d’objectif profonde, en distinguant une fenêtre réelle d’une avance spectaculaire mais intenable. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Au tirage, appliquer d’abord l’option particulière « Lorsque piochée » si sa condition est satisfaite. Sinon, conserver la carte active tant qu’un horizon crédible existe ; la défausser volontairement en fin de son propre tour pour gagner 1 PC si son coût d’opportunité devient supérieur à sa valeur ; réserver le remplacement à 1 PC, une fois par bataille, aux situations où renouveler immédiatement le portefeuille est décisif.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Un objectif d’expansion est accessible après destruction d’un écran, tandis que la base adverse demande une charge longue et détournerait deux unités du milieu.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Forward Position, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Transformer une percée déjà préparée en prise d’objectif profonde, en distinguant une fenêtre réelle d’une avance spectaculaire mais intenable. Identifier l’objectif légal le moins coûteux, casser écran et contrôle avant la projection, conserver une unité de finition de mouvement et vérifier la contribution après le score.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. L’adversaire peut empiler contrôle et contre-charge sur les objectifs profonds ; une unité projetée seule marque parfois au prix d’un effondrement du centre. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### Secure No Man's Land

**Fait de mission sourcé.** En Tactique, contrôler au moins deux objectifs du no man’s land, en excluant votre objectif de base, rapporte 5 PdV à la fin de votre tour.
**Fenêtres déclarées :** Chaque round de bataille — à la fin de votre tour..

**Capacités requises.**

- `objective-control` (core) : Gagner ou contester le contrôle des objectifs pertinents.
- `durable-presence` (core) : Rester présent jusqu’à la fenêtre de score malgré la réponse adverse.
- `screening` (supporting) : Limiter les accès adverses tout en protégeant les unités de mission.

#### Rendement tactique

En Tactique, contrôler au moins deux objectifs du no man’s land, en excluant votre objectif de base, rapporte 5 PdV à la fin de votre tour. Assembler deux contrôles simultanés avec une répartition asymétrique : un objectif sûr au coût minimal et un objectif disputé soutenu par la puissance nécessaire. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Verrouiller d’abord le point le plus stable, calculer le contrôle après pertes sur le second, puis engager la réserve seulement si les deux restent acquis à la fenêtre. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Assembler deux contrôles simultanés avec une répartition asymétrique : un objectif sûr au coût minimal et un objectif disputé soutenu par la puissance nécessaire. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

L’adversaire peut concentrer tout son déni sur le second objectif ; surinvestir sur le premier laisse souvent le second sans marge. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : L’adversaire peut concentrer tout son déni sur le second objectif ; surinvestir sur le premier laisse souvent le second sans marge. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** L’adversaire peut concentrer tout son déni sur le second objectif ; surinvestir sur le premier laisse souvent le second sans marge.

#### Séquence conseillée

Verrouiller d’abord le point le plus stable, calculer le contrôle après pertes sur le second, puis engager la réserve seulement si les deux restent acquis à la fenêtre. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Assembler deux contrôles simultanés avec une répartition asymétrique : un objectif sûr au coût minimal et un objectif disputé soutenu par la puissance nécessaire. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Conserver la carte active tant qu’un horizon crédible existe et que les ressources qu’elle immobilise restent compatibles avec les autres cartes actives. La défausser volontairement en fin de son propre tour pour gagner 1 PC si cet horizon disparaît. N’utiliser le remplacement à 1 PC, une fois par bataille, que si renouveler immédiatement le portefeuille vaut ce coût et cette ressource unique.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Un objectif est tenu à couvert ; le second peut être pris par une unité rapide, mais une contre-charge ennemie et une autre carte active sollicitent la même réserve.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Secure No Man's Land, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Assembler deux contrôles simultanés avec une répartition asymétrique : un objectif sûr au coût minimal et un objectif disputé soutenu par la puissance nécessaire. Verrouiller d’abord le point le plus stable, calculer le contrôle après pertes sur le second, puis engager la réserve seulement si les deux restent acquis à la fenêtre.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. L’adversaire peut concentrer tout son déni sur le second objectif ; surinvestir sur le premier laisse souvent le second sans marge. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

## 3. Projection territoriale

Les cartes de la famille « Projection territoriale » mutualisent certaines capacités, mais leur accumulation peut mettre les mêmes unités en concurrence avec le primaire et les autres familles actives.

**Rapprochement familial.** Deux nouvelles cartes sont piochées à chaque phase de Commandement et les cartes non accomplies ou non défaussées restent actives : la contrainte porte donc sur un portefeuille croissant, pas sur une paire isolée.

**Capacités mutualisables :** `territorial-projection`, `independent-units`, `unit-redundancy`.

### Beacon

**Fait de mission sourcé.** Au tirage, choisir une unité amie sur le champ de bataille ou embarquée dans un Transport comme balise. À la fin du tour adverse ou du cinquième round, elle rapporte 3 PdV si elle est hors de votre zone de déploiement et 5 PdV si elle est hors de votre territoire.
**Fenêtres déclarées :** Chaque round de bataille — déclencheur archivé : End of your opponent's turn or the end of the fifth battle round (whichever comes first)..

**Capacités requises.**

- `territorial-projection` (core) : Déployer rapidement une présence dans des zones éloignées.
- `independent-units` (core) : Occuper plusieurs zones sans dépendre d’un unique bloc.
- `unit-redundancy` (supporting) : Disposer d’une solution de repli si la première unité de mission est neutralisée.
- `action-capacity` (supporting) : Conserver des unités capables de consacrer une activation à une action sans abandonner le plan principal.

#### Rendement tactique

Au tirage, choisir une unité amie sur le champ de bataille ou embarquée dans un Transport comme balise. À la fin du tour adverse ou du cinquième round, elle rapporte 3 PdV si elle est hors de votre zone de déploiement et 5 PdV si elle est hors de votre territoire. Choisir une balise dont la trajectoire naturelle sert déjà la table et qui peut survivre jusqu’à la fenêtre adverse, sans condamner une pièce essentielle. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Nommer une unité avec route, couvert et repli possibles ; projeter d’abord un écran ou une seconde menace, puis déplacer la balise vers le palier compatible avec sa survie. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Choisir une balise dont la trajectoire naturelle sert déjà la table et qui peut survivre jusqu’à la fenêtre adverse, sans condamner une pièce essentielle. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

La cible est connue et doit survivre à la réponse adverse ; une unité rapide mais fragile peut offrir une destruction facile et perdre simultanément la carte. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : La cible est connue et doit survivre à la réponse adverse ; une unité rapide mais fragile peut offrir une destruction facile et perdre simultanément la carte. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** La cible est connue et doit survivre à la réponse adverse ; une unité rapide mais fragile peut offrir une destruction facile et perdre simultanément la carte.

#### Séquence conseillée

Nommer une unité avec route, couvert et repli possibles ; projeter d’abord un écran ou une seconde menace, puis déplacer la balise vers le palier compatible avec sa survie. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Choisir une balise dont la trajectoire naturelle sert déjà la table et qui peut survivre jusqu’à la fenêtre adverse, sans condamner une pièce essentielle. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Au tirage, appliquer d’abord l’option particulière « Lorsque piochée » si sa condition est satisfaite. Sinon, conserver la carte active tant qu’un horizon crédible existe ; la défausser volontairement en fin de son propre tour pour gagner 1 PC si son coût d’opportunité devient supérieur à sa valeur ; réserver le remplacement à 1 PC, une fois par bataille, aux situations où renouveler immédiatement le portefeuille est décisif.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Une unité durable doit naturellement quitter votre territoire, tandis qu’une unité plus rapide atteindrait le plein palier mais resterait exposée à plusieurs ripostes.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Beacon, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Choisir une balise dont la trajectoire naturelle sert déjà la table et qui peut survivre jusqu’à la fenêtre adverse, sans condamner une pièce essentielle. Nommer une unité avec route, couvert et repli possibles ; projeter d’abord un écran ou une seconde menace, puis déplacer la balise vers le palier compatible avec sa survie.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. La cible est connue et doit survivre à la réponse adverse ; une unité rapide mais fragile peut offrir une destruction facile et perdre simultanément la carte. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### Behind Enemy Lines

**Fait de mission sourcé.** Au premier round, la clause « Lorsque piochée » permet de piocher une nouvelle carte puis de remélanger celle-ci. Sinon, à la fin de votre tour, chaque unité amie éligible entièrement dans la zone de déploiement adverse rapporte 3 PdV.
**Fenêtres déclarées :** Chaque round de bataille — à la fin de votre tour..

**Capacités requises.**

- `territorial-projection` (core) : Déployer rapidement une présence dans des zones éloignées.
- `independent-units` (core) : Occuper plusieurs zones sans dépendre d’un unique bloc.
- `unit-redundancy` (supporting) : Disposer d’une solution de repli si la première unité de mission est neutralisée.
- `screening` (supporting) : Limiter les accès adverses tout en protégeant les unités de mission.

#### Rendement tactique

Au premier round, la clause « Lorsque piochée » permet de piocher une nouvelle carte puis de remélanger celle-ci. Sinon, à la fin de votre tour, chaque unité amie éligible entièrement dans la zone de déploiement adverse rapporte 3 PdV. Rentabiliser réserves, infiltrations tardives ou percées qui menacent déjà l’arrière adverse, avec plusieurs vecteurs indépendants plutôt qu’une unique arrivée fragile. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Cartographier les poches légales, forcer l’écran à s’étirer avec une première menace, puis n’engager une unité que si elle entre entièrement dans la zone et conserve une contribution future. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Rentabiliser réserves, infiltrations tardives ou percées qui menacent déjà l’arrière adverse, avec plusieurs vecteurs indépendants plutôt qu’une unique arrivée fragile. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

Les écrans et la géométrie peuvent fermer toutes les arrivées ; une unité isolée peut marquer puis être détruite sans créer d’autre avantage. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : Les écrans et la géométrie peuvent fermer toutes les arrivées ; une unité isolée peut marquer puis être détruite sans créer d’autre avantage. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** Les écrans et la géométrie peuvent fermer toutes les arrivées ; une unité isolée peut marquer puis être détruite sans créer d’autre avantage.

#### Séquence conseillée

Cartographier les poches légales, forcer l’écran à s’étirer avec une première menace, puis n’engager une unité que si elle entre entièrement dans la zone et conserve une contribution future. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Rentabiliser réserves, infiltrations tardives ou percées qui menacent déjà l’arrière adverse, avec plusieurs vecteurs indépendants plutôt qu’une unique arrivée fragile. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Au tirage, appliquer d’abord l’option particulière « Lorsque piochée » si sa condition est satisfaite. Sinon, conserver la carte active tant qu’un horizon crédible existe ; la défausser volontairement en fin de son propre tour pour gagner 1 PC si son coût d’opportunité devient supérieur à sa valeur ; réserver le remplacement à 1 PC, une fois par bataille, aux situations où renouveler immédiatement le portefeuille est décisif.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Une petite réserve peut entrer dans un coin, mais l’adversaire peut le fermer ; une unité mobile déjà sur table pourrait créer une seconde route au tour suivant.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Behind Enemy Lines, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Rentabiliser réserves, infiltrations tardives ou percées qui menacent déjà l’arrière adverse, avec plusieurs vecteurs indépendants plutôt qu’une unique arrivée fragile. Cartographier les poches légales, forcer l’écran à s’étirer avec une première menace, puis n’engager une unité que si elle entre entièrement dans la zone et conserve une contribution future.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. Les écrans et la géométrie peuvent fermer toutes les arrivées ; une unité isolée peut marquer puis être détruite sans créer d’autre avantage. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### Centre Ground

**Fait de mission sourcé.** À la fin de votre tour, une unité amie éligible à 3 pouces du centre et aucune unité ennemie à 3 pouces rapportent 3 PdV ; si aucun ennemi n’est à 6 pouces, le rendement passe à 5 PdV.
**Fenêtres déclarées :** Chaque round de bataille — à la fin de votre tour..

**Capacités requises.**

- `territorial-projection` (core) : Déployer rapidement une présence dans des zones éloignées.
- `independent-units` (core) : Occuper plusieurs zones sans dépendre d’un unique bloc.
- `unit-redundancy` (supporting) : Disposer d’une solution de repli si la première unité de mission est neutralisée.

#### Rendement tactique

À la fin de votre tour, une unité amie éligible à 3 pouces du centre et aucune unité ennemie à 3 pouces rapportent 3 PdV ; si aucun ennemi n’est à 6 pouces, le rendement passe à 5 PdV. Combiner présence centrale et éviction graduée : le palier de 3 PdV peut être supérieur au plein score si pousser jusqu’à 6 pouces exige une surextension. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Nettoyer d’abord la zone minimale, placer une unité qui sert aussi le primaire, puis décider si le coût pour vider l’anneau de 6 pouces reste inférieur au bénéfice marginal. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Combiner présence centrale et éviction graduée : le palier de 3 PdV peut être supérieur au plein score si pousser jusqu’à 6 pouces exige une surextension. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

Un simple corps ennemi dans le rayon interdit le palier ; vouloir vider 6 pouces peut exposer plusieurs unités à une contre-attaque. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : Un simple corps ennemi dans le rayon interdit le palier ; vouloir vider 6 pouces peut exposer plusieurs unités à une contre-attaque. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** Un simple corps ennemi dans le rayon interdit le palier ; vouloir vider 6 pouces peut exposer plusieurs unités à une contre-attaque.

#### Séquence conseillée

Nettoyer d’abord la zone minimale, placer une unité qui sert aussi le primaire, puis décider si le coût pour vider l’anneau de 6 pouces reste inférieur au bénéfice marginal. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Combiner présence centrale et éviction graduée : le palier de 3 PdV peut être supérieur au plein score si pousser jusqu’à 6 pouces exige une surextension. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Conserver la carte active tant qu’un horizon crédible existe et que les ressources qu’elle immobilise restent compatibles avec les autres cartes actives. La défausser volontairement en fin de son propre tour pour gagner 1 PC si cet horizon disparaît. N’utiliser le remplacement à 1 PC, une fois par bataille, que si renouveler immédiatement le portefeuille vaut ce coût et cette ressource unique.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Votre unité durable peut occuper le centre après avoir retiré un écran à 3 pouces, mais une seconde cible à 5 pouces demanderait une pièce offensive réservée ailleurs.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Centre Ground, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Combiner présence centrale et éviction graduée : le palier de 3 PdV peut être supérieur au plein score si pousser jusqu’à 6 pouces exige une surextension. Nettoyer d’abord la zone minimale, placer une unité qui sert aussi le primaire, puis décider si le coût pour vider l’anneau de 6 pouces reste inférieur au bénéfice marginal.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. Un simple corps ennemi dans le rayon interdit le palier ; vouloir vider 6 pouces peut exposer plusieurs unités à une contre-attaque. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### Display of Might

**Fait de mission sourcé.** Avoir plus d’unités amies qu’ennemies éligibles entièrement dans le no man’s land rapporte 2 PdV à la fin de votre tour, puis 5 PdV à la fin du tour adverse si cette supériorité subsiste.
**Fenêtres déclarées :** Chaque round de bataille — à la fin de votre tour. ; Chaque round de bataille — déclencheur archivé : End of your opponent's turn..

**Capacités requises.**

- `territorial-projection` (core) : Déployer rapidement une présence dans des zones éloignées.
- `independent-units` (core) : Occuper plusieurs zones sans dépendre d’un unique bloc.
- `unit-redundancy` (supporting) : Disposer d’une solution de repli si la première unité de mission est neutralisée.

#### Rendement tactique

Avoir plus d’unités amies qu’ennemies éligibles entièrement dans le no man’s land rapporte 2 PdV à la fin de votre tour, puis 5 PdV à la fin du tour adverse si cette supériorité subsiste. Construire une majorité distribuée et survivante : le plein rendement dépend moins d’un pic de mouvement que de la capacité à résister au décompte adverse. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Compter les unités éligibles avant de bouger, ajouter des présences indépendantes derrière couvert, retirer les unités adverses faciles puis garder une marge contre les pertes et entrées adverses. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Construire une majorité distribuée et survivante : le plein rendement dépend moins d’un pic de mouvement que de la capacité à résister au décompte adverse. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

L’adversaire peut égaliser par une unité bon marché, détruire une présence fragile ou provoquer l’ébranlement ; compter des unités non entièrement placées invalide le plan. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : L’adversaire peut égaliser par une unité bon marché, détruire une présence fragile ou provoquer l’ébranlement ; compter des unités non entièrement placées invalide le plan. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** L’adversaire peut égaliser par une unité bon marché, détruire une présence fragile ou provoquer l’ébranlement ; compter des unités non entièrement placées invalide le plan.

#### Séquence conseillée

Compter les unités éligibles avant de bouger, ajouter des présences indépendantes derrière couvert, retirer les unités adverses faciles puis garder une marge contre les pertes et entrées adverses. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Construire une majorité distribuée et survivante : le plein rendement dépend moins d’un pic de mouvement que de la capacité à résister au décompte adverse. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Conserver la carte active tant qu’un horizon crédible existe et que les ressources qu’elle immobilise restent compatibles avec les autres cartes actives. La défausser volontairement en fin de son propre tour pour gagner 1 PC si cet horizon disparaît. N’utiliser le remplacement à 1 PC, une fois par bataille, que si renouveler immédiatement le portefeuille vaut ce coût et cette ressource unique.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Vous pouvez prendre une majorité de trois contre deux à la fin de votre tour, mais l’une de vos unités est exposée et une réserve adverse peut entrer dans le no man’s land.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Display of Might, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Construire une majorité distribuée et survivante : le plein rendement dépend moins d’un pic de mouvement que de la capacité à résister au décompte adverse. Compter les unités éligibles avant de bouger, ajouter des présences indépendantes derrière couvert, retirer les unités adverses faciles puis garder une marge contre les pertes et entrées adverses.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. L’adversaire peut égaliser par une unité bon marché, détruire une présence fragile ou provoquer l’ébranlement ; compter des unités non entièrement placées invalide le plan. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### Engage on All Fronts

**Fait de mission sourcé.** Une présence est établie par une unité amie éligible entièrement dans un quart de table et à plus de 6 pouces du centre. À la fin de votre tour, trois quarts rapportent 3 PdV et quatre quarts 5 PdV.
**Fenêtres déclarées :** Chaque round de bataille — à la fin de votre tour..

**Capacités requises.**

- `territorial-projection` (core) : Déployer rapidement une présence dans des zones éloignées.
- `independent-units` (core) : Occuper plusieurs zones sans dépendre d’un unique bloc.
- `unit-redundancy` (supporting) : Disposer d’une solution de repli si la première unité de mission est neutralisée.

#### Rendement tactique

Une présence est établie par une unité amie éligible entièrement dans un quart de table et à plus de 6 pouces du centre. À la fin de votre tour, trois quarts rapportent 3 PdV et quatre quarts 5 PdV. Répartir des unités autonomes dans des quarts utiles sans transformer le plein score en dispersion irréversible. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Valider entièrement chaque empreinte et l’exclusion du centre, sécuriser trois quarts avec les unités déjà utiles, puis n’ouvrir le quatrième que si une unité redondante garde une sortie ou un couvert. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Répartir des unités autonomes dans des quarts utiles sans transformer le plein score en dispersion irréversible. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

Un écran, une perte ou quelques millimètres d’empreinte peuvent supprimer un quart ; viser quatre zones fragilise les échanges locaux. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : Un écran, une perte ou quelques millimètres d’empreinte peuvent supprimer un quart ; viser quatre zones fragilise les échanges locaux. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** Un écran, une perte ou quelques millimètres d’empreinte peuvent supprimer un quart ; viser quatre zones fragilise les échanges locaux.

#### Séquence conseillée

Valider entièrement chaque empreinte et l’exclusion du centre, sécuriser trois quarts avec les unités déjà utiles, puis n’ouvrir le quatrième que si une unité redondante garde une sortie ou un couvert. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Répartir des unités autonomes dans des quarts utiles sans transformer le plein score en dispersion irréversible. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Au tirage, appliquer d’abord l’option particulière « Lorsque piochée » si sa condition est satisfaite. Sinon, conserver la carte active tant qu’un horizon crédible existe ; la défausser volontairement en fin de son propre tour pour gagner 1 PC si son coût d’opportunité devient supérieur à sa valeur ; réserver le remplacement à 1 PC, une fois par bataille, aux situations où renouveler immédiatement le portefeuille est décisif.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Trois quarts sont accessibles avec des unités déjà engagées dans le plan ; le quatrième exigerait une réserve qui pourrait plutôt protéger l’arrière au tour suivant.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Engage on All Fronts, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Répartir des unités autonomes dans des quarts utiles sans transformer le plein score en dispersion irréversible. Valider entièrement chaque empreinte et l’exclusion du centre, sécuriser trois quarts avec les unités déjà utiles, puis n’ouvrir le quatrième que si une unité redondante garde une sortie ou un couvert.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. Un écran, une perte ou quelques millimètres d’empreinte peuvent supprimer un quart ; viser quatre zones fragilise les échanges locaux. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### Outflank

**Fait de mission sourcé.** À la fin de votre tour, une unité amie éligible à 6 pouces d’un bord et hors de votre territoire rapporte 3 PdV ; deux unités près de bords opposés, dont au moins une hors de votre territoire, rapportent 5 PdV.
**Fenêtres déclarées :** Chaque round de bataille — à la fin de votre tour..

**Capacités requises.**

- `territorial-projection` (core) : Déployer rapidement une présence dans des zones éloignées.
- `independent-units` (core) : Occuper plusieurs zones sans dépendre d’un unique bloc.
- `unit-redundancy` (supporting) : Disposer d’une solution de repli si la première unité de mission est neutralisée.
- `screening` (supporting) : Limiter les accès adverses tout en protégeant les unités de mission.

#### Rendement tactique

À la fin de votre tour, une unité amie éligible à 6 pouces d’un bord et hors de votre territoire rapporte 3 PdV ; deux unités près de bords opposés, dont au moins une hors de votre territoire, rapportent 5 PdV. Utiliser les bords comme axes de projection complémentaires, avec un palier sûr d’un côté et une seconde présence seulement si elle conserve une fonction. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Choisir le bord déjà servi par le primaire, vérifier la distance et le territoire, puis ouvrir le bord opposé avec une unité indépendante plutôt que détacher une pièce indispensable. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Utiliser les bords comme axes de projection complémentaires, avec un palier sûr d’un côté et une seconde présence seulement si elle conserve une fonction. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

L’adversaire peut fermer un bord, intercepter une arrivée ou obliger une unité à rester dans votre territoire ; la recherche des bords opposés étire les soutiens. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : L’adversaire peut fermer un bord, intercepter une arrivée ou obliger une unité à rester dans votre territoire ; la recherche des bords opposés étire les soutiens. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** L’adversaire peut fermer un bord, intercepter une arrivée ou obliger une unité à rester dans votre territoire ; la recherche des bords opposés étire les soutiens.

#### Séquence conseillée

Choisir le bord déjà servi par le primaire, vérifier la distance et le territoire, puis ouvrir le bord opposé avec une unité indépendante plutôt que détacher une pièce indispensable. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Utiliser les bords comme axes de projection complémentaires, avec un palier sûr d’un côté et une seconde présence seulement si elle conserve une fonction. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Conserver la carte active tant qu’un horizon crédible existe et que les ressources qu’elle immobilise restent compatibles avec les autres cartes actives. La défausser volontairement en fin de son propre tour pour gagner 1 PC si cet horizon disparaît. N’utiliser le remplacement à 1 PC, une fois par bataille, que si renouveler immédiatement le portefeuille vaut ce coût et cette ressource unique.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Une unité contrôle déjà un flanc hors de votre territoire ; la seconde pourrait atteindre le bord opposé, mais quitterait un écran qui protège une carte active.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Outflank, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Utiliser les bords comme axes de projection complémentaires, avec un palier sûr d’un côté et une seconde présence seulement si elle conserve une fonction. Choisir le bord déjà servi par le primaire, vérifier la distance et le territoire, puis ouvrir le bord opposé avec une unité indépendante plutôt que détacher une pièce indispensable.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. L’adversaire peut fermer un bord, intercepter une arrivée ou obliger une unité à rester dans votre territoire ; la recherche des bords opposés étire les soutiens. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

## 4. Actions et opérations

Les cartes de la famille « Actions et opérations » mutualisent certaines capacités, mais leur accumulation peut mettre les mêmes unités en concurrence avec le primaire et les autres familles actives.

**Rapprochement familial.** Deux nouvelles cartes sont piochées à chaque phase de Commandement et les cartes non accomplies ou non défaussées restent actives : la contrainte porte donc sur un portefeuille croissant, pas sur une paire isolée.

**Capacités mutualisables :** `action-capacity`, `durable-presence`, `unit-redundancy`.

### Cleanse

**Fait de mission sourcé.** En Tactique, nettoyer un objectif pendant le tour rapporte 2 PdV à la fin de votre tour ; en nettoyer au moins deux rapporte 5 PdV. Si Plunder est déjà active au tirage, la clause permet de repiocher puis remélanger Cleanse.
**Fenêtres déclarées :** Chaque round de bataille — à la fin de votre tour..

**Capacités requises.**

- `action-capacity` (core) : Conserver des unités capables de consacrer une activation à une action sans abandonner le plan principal.
- `durable-presence` (core) : Rester présent jusqu’à la fenêtre de score malgré la réponse adverse.
- `unit-redundancy` (supporting) : Disposer d’une solution de repli si la première unité de mission est neutralisée.
- `objective-control` (supporting) : Gagner ou contester le contrôle des objectifs pertinents.

#### Rendement tactique

En Tactique, nettoyer un objectif pendant le tour rapporte 2 PdV à la fin de votre tour ; en nettoyer au moins deux rapporte 5 PdV. Si Plunder est déjà active au tirage, la clause permet de repiocher puis remélanger Cleanse. Employer des opérateurs dont l’action ne supprime pas une contribution critique et mutualiser leur présence avec le contrôle des objectifs. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Sécuriser d’abord un objectif et son opérateur, vérifier l’action et sa fenêtre, puis ne viser le second que si une unité indépendante peut agir sans faire tomber le primaire ou un écran. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Employer des opérateurs dont l’action ne supprime pas une contribution critique et mutualiser leur présence avec le contrôle des objectifs. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

Chaque action consomme une unité et l’adversaire peut contester, ébranler ou détruire l’opérateur ; le plein palier concurrence fortement les autres cartes multi-zone. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : Chaque action consomme une unité et l’adversaire peut contester, ébranler ou détruire l’opérateur ; le plein palier concurrence fortement les autres cartes multi-zone. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** Chaque action consomme une unité et l’adversaire peut contester, ébranler ou détruire l’opérateur ; le plein palier concurrence fortement les autres cartes multi-zone.

#### Séquence conseillée

Sécuriser d’abord un objectif et son opérateur, vérifier l’action et sa fenêtre, puis ne viser le second que si une unité indépendante peut agir sans faire tomber le primaire ou un écran. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Employer des opérateurs dont l’action ne supprime pas une contribution critique et mutualiser leur présence avec le contrôle des objectifs. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Au tirage, appliquer d’abord l’option particulière « Lorsque piochée » si sa condition est satisfaite. Sinon, conserver la carte active tant qu’un horizon crédible existe ; la défausser volontairement en fin de son propre tour pour gagner 1 PC si son coût d’opportunité devient supérieur à sa valeur ; réserver le remplacement à 1 PC, une fois par bataille, aux situations où renouveler immédiatement le portefeuille est décisif.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Une petite unité tient un objectif sûr et peut le nettoyer ; atteindre le second palier demanderait à une unité de combat de renoncer à une activation essentielle.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Cleanse, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Employer des opérateurs dont l’action ne supprime pas une contribution critique et mutualiser leur présence avec le contrôle des objectifs. Sécuriser d’abord un objectif et son opérateur, vérifier l’action et sa fenêtre, puis ne viser le second que si une unité indépendante peut agir sans faire tomber le primaire ou un écran.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. Chaque action consomme une unité et l’adversaire peut contester, ébranler ou détruire l’opérateur ; le plein palier concurrence fortement les autres cartes multi-zone. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

### Plunder

**Fait de mission sourcé.** En Tactique, piller une zone de terrain pendant votre tour rapporte 5 PdV à la fin de votre tour. Si Cleanse est déjà active au tirage, la clause permet de repiocher puis remélanger Plunder.
**Fenêtres déclarées :** Chaque round de bataille — à la fin de votre tour..

**Capacités requises.**

- `action-capacity` (core) : Conserver des unités capables de consacrer une activation à une action sans abandonner le plan principal.
- `durable-presence` (core) : Rester présent jusqu’à la fenêtre de score malgré la réponse adverse.
- `unit-redundancy` (supporting) : Disposer d’une solution de repli si la première unité de mission est neutralisée.
- `territorial-projection` (supporting) : Déployer rapidement une présence dans des zones éloignées.

#### Rendement tactique

En Tactique, piller une zone de terrain pendant votre tour rapporte 5 PdV à la fin de votre tour. Si Cleanse est déjà active au tirage, la clause permet de repiocher puis remélanger Plunder. Affecter un opérateur à une zone de terrain accessible dont la position après l’action reste utile et défendable. Le rendement maximal n’est pertinent que si son coût marginal reste inférieur à la valeur positionnelle et aux autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Modèle de rendement » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Construction de liste

La liste doit disposer de plusieurs vecteurs capables d’exécuter ce plan : Choisir terrain, route et opérateur avant les mouvements, neutraliser les menaces qui interrompent l’action et conserver une unité de remplacement si l’accès devient illégal. Elle doit garder une solution de repli afin qu’une perte ou un écran ne rende pas la carte dépendante d’une unique unité.

**Pourquoi :** Cette inférence transforme le détail « Construction de liste » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Opportunités

Affecter un opérateur à une zone de terrain accessible dont la position après l’action reste utile et défendable. L’opportunité est forte lorsque le mouvement, la destruction, le contrôle ou l’action requis sert simultanément le primaire, le déni et la position du tour suivant.

**Pourquoi :** Cette inférence transforme le détail « Opportunité » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Modes d’échec

L’action concentre la trajectoire sur une zone connue ; écrans, ébranlement ou perte de l’opérateur peuvent consommer le tour sans rendement. Le mode d’échec le plus coûteux est d’engager une ressource critique sans atteindre la fenêtre, tout en réduisant la capacité à traiter les autres cartes actives.

**Pourquoi :** Cette inférence transforme le détail « Mode d’échec » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Contre-jeu adverse

Le contre-jeu adverse consiste à exploiter ce levier : L’action concentre la trajectoire sur une zone connue ; écrans, ébranlement ou perte de l’opérateur peuvent consommer le tour sans rendement. Il faut donc annoncer une cible ou zone de repli et réévaluer la légalité après chaque réponse adverse.

**Pourquoi :** Cette inférence transforme le détail « Contre-jeu adverse » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Menaces :** L’action concentre la trajectoire sur une zone connue ; écrans, ébranlement ou perte de l’opérateur peuvent consommer le tour sans rendement.

#### Séquence conseillée

Choisir terrain, route et opérateur avant les mouvements, neutraliser les menaces qui interrompent l’action et conserver une unité de remplacement si l’accès devient illégal. Si la réalisation doit mûrir sur plusieurs tours, assigner un horizon explicite et éviter d’immobiliser d’avance toutes les ressources nécessaires.

**Pourquoi :** Cette inférence transforme le détail « Séquence de jeu » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

#### Arbitrages

Affecter un opérateur à une zone de terrain accessible dont la position après l’action reste utile et défendable. Comparer toutefois son coût avec le primaire et le reste du portefeuille : une carte peut rester active légalement sans mériter une unité dédiée dès ce tour.

**Pourquoi :** Cette inférence transforme le détail « Arbitrage de ressources » de l’analyse en décision vérifiable séparément.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Pilotage du portefeuille actif

Au tirage, appliquer d’abord l’option particulière « Lorsque piochée » si sa condition est satisfaite. Sinon, conserver la carte active tant qu’un horizon crédible existe ; la défausser volontairement en fin de son propre tour pour gagner 1 PC si son coût d’opportunité devient supérieur à sa valeur ; réserver le remplacement à 1 PC, une fois par bataille, aux situations où renouveler immédiatement le portefeuille est décisif.

**Pourquoi :** Les cartes non accomplies et non défaussées restent actives pendant que deux nouvelles cartes sont piochées à chaque phase de Commandement.

**Conditions :** Vérifier la carte archivée, la fenêtre applicable et l’état réel des unités et zones.

**Coût d’opportunité :** Concurrence avec le primaire, les autres cartes actives et les unités disponibles.

#### Exemple décisionnel

Une unité légère peut atteindre un terrain protégé mais renonce à tenir un objectif ; une unité durable peut piller plus sûrement au tour suivant si la carte reste active.
Au moins une autre carte secondaire reste active et sollicitera potentiellement les mêmes unités à la prochaine séquence.

**Point de décision :** Faut-il engager maintenant les ressources de Plunder, la conserver pour un tour ultérieur ou libérer le portefeuille ?

- **Si La condition converge avec le primaire ou peut mûrir sans immobiliser une ressource critique.** Exécuter la séquence si elle est robuste ; sinon conserver la carte active avec un horizon explicite. Affecter un opérateur à une zone de terrain accessible dont la position après l’action reste utile et défendable. Choisir terrain, route et opérateur avant les mouvements, neutraliser les menaces qui interrompent l’action et conserver une unité de remplacement si l’accès devient illégal.
- **Si La condition n’a plus d’horizon crédible ou concurrence une autre carte active plus convergente.** Ne pas surexposer la liste ; en fin de son propre tour, défausser volontairement la carte pour 1 PC, ou employer le remplacement unique seulement si un nouveau tirage immédiat est décisif. L’action concentre la trajectoire sur une zone connue ; écrans, ébranlement ou perte de l’opérateur peuvent consommer le tour sans rendement. La conservation reste légale, mais elle doit conserver un horizon et ne pas monopoliser les ressources.

**Hypothèses :** Aucun résultat de dés, score futur ni probabilité de réussite n’est présumé. Deux nouvelles cartes seront piochées à la prochaine phase de Commandement et les cartes non résolues resteront actives.

*Statut : reviewed · confiance : medium · revue avant le 2026-11-30.*

## Rapprochements entre familles

- **Capacités mutualisables :** mobilité et redondance servent projection, contrôle et actions ; accès aux cibles et dégâts servent surtout la destruction, mais peuvent également libérer une zone.
- **Compatibilités de tempo :** une carte est particulièrement efficace lorsque sa fenêtre se superpose au primaire ou à une autre carte active sans demander une activation supplémentaire.
- **Concurrence :** les mêmes unités rapides ou sacrifiables sont souvent sollicitées par projection, contrôle et actions ; les pièces offensives choisissent parfois entre achever une cible et protéger le tempo primaire.
- **Surextension :** multiplier les cartes actives ne crée pas de nouvelles unités. Une ligne multi-zone sans écran, repli ni redondance expose l’armée au déni en chaîne.
- **Dépendance adverse :** destruction et accès dépendent des cibles proposées ; contrôle, projection et actions dépendent du placement, des écrans et de la survie des opérateurs.
- **Conflit de portefeuille :** conserver est légal, mais chaque carte doit garder un horizon. La défausse volontaire et le remplacement unique répondent à deux coûts et timings différents.

## Checklist de robustesse de liste

- Mobilité, projection multi-zone et unités indépendantes.
- Unités sacrifiables et redondance des rôles.
- Contrôle d’objectif, présence durable et écrans.
- Capacité à agir sans neutraliser toute la pression.
- Dégâts concentrés, dégâts distribués et accès aux cibles.
- Résilience et capacité de repli.

Toute modification du pack, de son archive ou du Compagnon officiel exige une nouvelle revue humaine avant de republier les guides.
