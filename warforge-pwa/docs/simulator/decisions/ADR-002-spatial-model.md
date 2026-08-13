# ADR-002 — Géométrie 2.5D entière et explicable

- Statut : accepté
- Date : 2026-08-13

## Décision

L'unité interne est 0,1 mm et un pouce vaut 254 unités. Les modèles ont une empreinte et une hauteur continue ; les terrains sont des volumes 2.5D. Les verdicts de mouvement et de visibilité gardent leurs mesures et bloqueurs.

## Conséquences

Les calculs évitent les erreurs flottantes observables et sont testables indépendamment du rendu.
