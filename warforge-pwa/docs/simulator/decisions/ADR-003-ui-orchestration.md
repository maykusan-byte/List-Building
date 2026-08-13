# ADR-003 — Orchestration et rendu

- Statut : accepté
- Date : 2026-08-13

## Décision

XState 5 gère les phases, décisions et interruptions. PixiJS 8 avec WebGL rend la scène depuis une projection en lecture seule et émet des intentions converties en commandes.

## Conséquences

L'interface est chargée à la demande dans `#simulator` sans couplage aux règles.
