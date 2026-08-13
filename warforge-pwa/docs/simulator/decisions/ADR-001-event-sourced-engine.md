# ADR-001 — Moteur événementiel déterministe

- Statut : accepté
- Date : 2026-08-13

## Décision

Le domaine traite `GameCommand → GameEvent → GameState`, journalise les décisions et les jets, et utilise un PRNG versionné. Les mutations hors événements et le RNG implicite sont interdits.

## Conséquences

Les parties sont sauvegardables, exportables et rejouables ; React et PixiJS restent hors du domaine pur.
