# ADR-010 — [TOUCHES FATALES] interrompues et sauvegarde V3

- Statut : accepté
- Date : 2026-08-24
- Plan version : 2.3.1

## Contexte

La règle 24.23, p. 85, autorise le joueur à choisir, pour chaque touche
critique d'une arme [TOUCHES FATALES], de blesser automatiquement la cible.
Le choix intervient après les jets de touche et avant les jets de blessure.
Le tir atomique historique ne peut pas choisir cette option au nom du joueur
ni demander une politique globale sans modifier la règle.

La reprise doit pouvoir survenir pendant cette fenêtre. Or `SimulationSaveV2`
ne connaît que le journal de tir atomique. Ajouter silencieusement des
événements de stade de touche, de choix létal et de complétion rendrait un
journal V3 non interprétable par un lecteur V2, ce qui est une évolution
incompatible au sens d'ADR-005.

## Décision

Créer `SimulationSaveV3`. Les sauvegardes V1 et V2 restent importables selon
leurs garanties actuelles ; elles ne sont jamais migrées implicitement. V3
conserve les mêmes empreintes canoniques de session et d'environnement que V2,
mais reconnaît les événements de tir interrompu.

Pour la fixture létale initiale uniquement, `resolve-basic-shooting` valide
la déclaration et l'environnement, génère les caractéristiques A puis tous
les jets de touche. S'il existe une touche critique, il émet un événement de
stade de touche et ouvre une `DecisionRequest` pour la première clé critique
ordonnée. Chaque réponse valide ne consomme aucun dé, journalise exactement
`auto-wound` ou `roll-to-wound`, puis ouvre la demande suivante. La complétion
repart du PRNG après les touches : une option `auto-wound` supprime seulement
le jet de blessure de cette attaque et donne une blessure non critique ;
`roll-to-wound` reprend la séquence normale.

La reprise autoritaire recalcule le stade de touche, l'ordre des clés, chaque
choix et la complétion depuis le même `ShootingEnvironment`. Une falsification
de clé, joueur, option, empreinte, événement ou état PRNG invalide le replay.

La première couverture est bornée à un profil, un porteur, une instance
physique et des caractéristiques A/D fixes. Elle refuse avant PRNG tout cumul
avec [ANTI] ou [TOUCHES SOUTENUES], toute relance, tout multi-profil et toute
allocation à choix. Le tir M3/M4 et tout tir non létal conservent leur unique
événement atomique V2.

## Conséquences

- Une sauvegarde V3 peut reprendre exactement au milieu des décisions létales
  sans enregistrer de snapshot mutable hors du journal.
- Les chemins export, import, autosauvegarde et replay doivent connaître V3 et
  leurs tests doivent couvrir la reprise entre deux décisions ainsi que les
  falsifications négatives.
- [TOUCHES FATALES] reste limitée à sa fixture et aucun profil M4 n'est activé.
  Les relances génériques et `[JUMELÉ]`, alors bloqués faute de définition
  canonique locale, sont traités séparément par ADR-011 après archivage de
  `01.05.02`.
