# ADR-000 — Versionnement du plan

- Statut : accepté
- Date : 2026-08-13
- Plan version : 1.0.0

## Contexte

Le simulateur est un chantier long qui doit pouvoir reprendre sans contexte conversationnel.

## Décision

`PLAN.md` est la description humaine versionnée ; `project-state.json` est la source d'état machine-lisible ; `STATUS.md` est un rendu déterministe. Une évolution substantielle du plan nécessite un ADR et un incrément de `planVersion`.

## Conséquences

Le contrôle du tracker vérifie l'alignement du plan, de l'état et d'au moins un ADR pour la version active.
