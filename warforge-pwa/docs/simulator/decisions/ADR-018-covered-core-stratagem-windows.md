# ADR-018 — Fenêtres déterministes des stratagèmes de base couverts

- Statut : accepté
- Date : 2026-08-29
- Plan version : 3.0.0
- Tâche : SIM-M8-T03

## Contexte

Le graphe du pilote complet connaissait les règles générales des stratagèmes,
mais aucun stratagème ne possédait encore un contrat exécutable. Une couverture
globale de la section 15 serait trompeuse : plusieurs stratagèmes dépendent de
réserves, de réactions de tir, de blessures mortelles, de mots-clés ou de
fenêtres que le pilote fermé ne sait pas encore représenter.

Deux fenêtres déjà matérialisées par le moteur permettent une verticale stricte
sans étendre artificiellement son périmètre : le test d'Ébranlement en attente
de la section 08.03 et la fin autoritaire d'une résolution d'attaques de mêlée
de la section 12.04.

Les références canoniques consultées sont les règles de base françaises
15.01, 15.04 et 15.12, la mise à jour universelle anglaise de juillet 2026 et
la transcription officielle 15.01.01. La FAQ locale a également été contrôlée ;
elle ne modifie pas les coûts fixes de ces deux usages en l'absence d'une
aptitude qui modifie les PC.

## Décision

Implémenter uniquement les deux stratagèmes suivants :

1. `insane-bravery` — **Courage Insensé**, 1 PC. Il cible exactement l'unité
   dont le test d'Ébranlement est le prochain dans la file de la phase de
   Commandement du joueur. Le test est automatiquement réussi, la file avance,
   aucun dé n'est lancé et le stratagème est limité à une utilisation par
   bataille et par joueur.
2. `counter-offensive` — **Contre-offensive**, 2 PC. Il s'ouvre uniquement
   pendant la phase de Combat adverse, immédiatement après un événement
   `basic-melee-resolved` produit par le joueur actif. L'unité amie ciblée doit
   être active, déployée, éligible et ne pas avoir combattu. Son identifiant
   devient `forcedNextFightUnitId` ; ni un passage ni le choix d'une autre unité
   ne sont alors légaux. Cette priorité est retirée dès que l'unité choisie a
   combattu.

Chaque usage passe par `GameCommand → GameEvent → GameState`. Le registre
`BattleResourcesV1.stratagemUses` conserve l'événement, le stratagème, le
joueur, la cible, le coût et le moment de bataille. Le reducer recalcule le coût,
la fenêtre, la cible, les restrictions et la conséquence ; il refuse une preuve
altérée. Aucun de ces événements ne fait avancer le PRNG.

Les restrictions communes de 15.01 sont appliquées avant l'effet : PC
suffisants, pas deux usages du même stratagème par le même joueur à la même
phase et pas deux stratagèmes du même joueur sur la même unité à la même phase.
Une unité Ébranlée ne peut pas être ciblée, conformément à 01.07.

## Limites explicites

- Les huit autres stratagèmes de base restent non exécutables. La section 15.09
  décrit un type de tir et n'est pas un stratagème distinct.
- Les stratagèmes de faction et de détachement restent bloqués par leur
  compilation de roster et de détachement.
- Les modificateurs de coût sont sourcés mais ne sont pas activés sans aptitude
  compilée ; les coûts restent donc exactement 1 PC et 2 PC.
- Contre-offensive accepte les unités éligibles au début de l'étape Combattre
  ou ayant chargé. Les cas devenant éligibles uniquement par une nouvelle mise
  en engagement restent refusés tant que cette géométrie de combat n'est pas
  couverte.
- La fenêtre après une unité sans attaques n'est pas ouverte par
  `empty-fight-resolved`, car 15.12 exige qu'une unité ennemie ait résolu ses
  attaques.

## Conséquences

- Les sauvegardes V6 restent le format courant : le registre et les événements
  M8 sont vérifiés par les versions de schéma déjà embarquées dans V6.
- Le graphe de couverture passe à 0.7.0, tandis que
  `coverage.stratagems` reste `partial`.
- L'interface pourra proposer ces commandes à partir des fenêtres du domaine ;
  elle ne fournit ni coût, ni booléen d'éligibilité, ni priorité faisant
  autorité.
