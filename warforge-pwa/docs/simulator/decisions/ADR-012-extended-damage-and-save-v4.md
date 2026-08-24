# ADR-012 — Sauvegarde V4 pour sauvegardes et dégâts étendus

- Statut : accepté
- Date : 2026-08-24
- Plan version : 2.3.3

## Contexte

M5-T04 étend le tir avec les sauvegardes invulnérables, les dégâts variables
et `[FUSION X]`, `[BLESSURES DÉVASTATRICES]`, les blessures mortelles,
`Insensible à la Douleur`, `[À RISQUE]`, `[TIR UNIQUE]`, et les choix du
défenseur lors de l'allocation.

Le corpus canonique local contient les règles nécessaires : `02.02` (p. 10),
`05.03`–`05.04` (p. 19), `06.02`–`06.03` (p. 24), `24.10`, `24.12`,
`24.15`, `24.25` et `24.26` (pp. 79–85), avec les clarifications FAQ
archivées. Ces règles introduisent toutefois un état qui n'existait pas dans
les journaux V3 : un ordre d'allocation et des choix de figurine du défenseur,
ainsi qu'une consommation durable d'instance d'arme `[TIR UNIQUE]`.

## Décision

Créer `SimulationSaveV4` pour les journaux T04. Les V1, V2 et V3 restent
importables selon leurs contrats précédents, mais refusent explicitement les
événements, continuations ou états T04.

Les décisions d'ordre de groupes et de figurine à laquelle allouer une attaque
sont des `DecisionRequest` du défenseur. Elles ne consomment pas le PRNG. Les
dégâts aléatoires sont lancés après ce choix ; une Insensible à la Douleur
lance ensuite un D6 par point de vie qui serait perdu. Les résultats, sources,
choix, modèle choisi et état du PRNG sont journalisés et recalculés au replay.

La première couverture reste une fixture de tir étendu fermée. Elle ne
propage pas les SvIn déjà présentes dans les faits M4, n'active aucun loadout
alternatif M4 et refuse les combinaisons ou choix qui ne font pas partie de sa
capacité déclarée. Une instance `[TIR UNIQUE]` est identifiée au niveau de son
porteur et ne peut plus être choisie après son premier emploi, y compris après
import ou reprise.

## Conséquences

- Une sortie V4 est la seule capable de transporter une continuation
  d'allocation T04 et l'état des instances `[TIR UNIQUE]`.
- Les primitives sans choix (SvIn, D variable, Fusion et FNP) conservent
  malgré tout leur provenance et leurs dés dans le journal V4 afin que le
  replay ne dépende pas d'un état calculé hors journal.
- Les profils réels M4 gardent leurs contrats et leur compatibilité actuelle ;
  leur activation explicite est réservée à M5-T06 après couverture vérifiée.
- La réduction générique des dégâts reste refusée tant qu'un contrat de
  modificateur de dégâts sourcé et testé n'est pas livré.
