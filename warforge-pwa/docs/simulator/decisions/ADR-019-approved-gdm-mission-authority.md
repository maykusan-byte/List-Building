# ADR-019 — Autorité de projet de l'archive GDM 2026 pour la mission M9

- Statut : accepté
- Date : 2026-08-30
- Plan version : 3.1.0
- Décideur : project-owner

## Contexte

Le pilote fermé M9 utilise Disruption, le layout miroir 1, Outmanoeuvre,
Assassination et Engage on All Fronts. L'archive locale GDM 2026 contient les
cartes structurées, les images complètes, les mesures du layout et les hashes,
mais elle n'est pas une publication officielle Games Workshop. Le plan 3.0.0
imposait par prudence des captures officielles supplémentaires.

Le propriétaire du projet a explicitement décidé le 2026-08-30 que cette
archive est suffisamment fiable pour servir de source aux données et au moteur
de la mission M9.

## Décision

`approved-gdm-2026-11th-archive` devient une source canonique au sens interne
du simulateur pour le seul contenu de mission qu'elle archive. Elle conserve
les propriétés suivantes :

- nature `trusted-mission-archive` et autorité `project-owner-approved` ;
- archive locale immuable contrôlée par SHA-256 ;
- liens vérifiables entre cartes, layout, ressources et hashes individuels ;
- mention obligatoire qu'il ne s'agit pas d'une publication officielle GW.

Le Compagnon de Rencontre officiel reste l'autorité pour la séquence de
mission, les conditions générales d'accomplissement, les conditions
« cumulative » et « or », la fin de partie et les plafonds de VP.

L'approbation lève les cinq gaps de source M6 liés à la mission. Elle ne vaut
pas preuve que le score, les coordonnées spatiales ou l'interface M9 sont déjà
implémentés : ces capacités restent partielles jusqu'aux tâches M9-T02 et
M9-T03 et à leurs tests.

## Conséquences

- Aucune nouvelle capture officielle n'est requise pour formaliser les cinq
  ressources du pilote M9.
- La provenance publique et les messages UI ne doivent jamais qualifier GDM
  de source officielle Games Workshop.
- Toute divergence future entre GDM et une source officielle fournie doit être
  signalée au propriétaire avant de modifier le comportement exécutable.
- Les informations absentes de l'archive restent des gaps explicites ; elles
  ne sont pas inférées silencieusement.
