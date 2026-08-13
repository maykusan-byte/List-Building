# ADR-005 — Sauvegarde V2 et duel fermé M3

- Statut : accepté
- Date : 2026-08-13
- Plan version : 1.1.0

## Contexte

La sauvegarde V1 couvre le socle M1 : état initial et journal générique. Le duel M3 ajoute des unités possédant des figurines et des armes réelles dans la fixture, des événements de tir, une chaîne PRNG plus riche et des preuves spatiales qui doivent être vérifiées avec le même environnement que la session.

Transformer silencieusement une V1 en partie M3 rendrait impossible de prouver la provenance des unités, la compatibilité des armes et l'intégrité de la géométrie rejouée.

## Décision

`SimulationSaveV2` devient le format d'export des sessions contenant le duel fermé. Il conserve l'état initial, le journal, les unités, les événements de tir et l'empreinte canonique de l'environnement de tir. Les chemins publics d'import, d'autosauvegarde et de reprise exigent cet environnement pour tout journal de tir et recalculent les preuves avant réduction.

`SimulationSaveV1` reste importable et rejouable pour les sessions historiques qui ne contiennent pas d'événement de tir. Une V1 n'est jamais migrée implicitement ni déclarée compatible avec M3. Une future migration devra être explicite, versionnée et testée séparément.

M3 demeure limité à `closed-core-shooting-duel-v1` et à ses `fixture-unit`. Aucun identifiant du catalogue actif n'est couvert par cette décision.

## Conséquences

- Les exports M3 sont autonomes quant au journal, mais leur reprise requiert les données versionnées ayant produit l'empreinte d'environnement.
- Une falsification de portée, LoS, couvert, profil physique, arme, terrain, perte ou PRNG invalide le replay.
- Les anciennes sauvegardes restent lisibles sans prétendre bénéficier des garanties M3.
- Toute évolution incompatible du contenu d'une sauvegarde impose une nouvelle version de schéma et un ADR.
