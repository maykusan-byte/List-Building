# Audit des packs de faction

`manifest.json` est le registre versionné des packs de faction français archivés
dans `../../../references/warhammer-40k/faction-packs/`. Chaque entrée associe une
faction et son fichier source de catalogue à un PDF, sa version, sa date d'effet,
son nombre de pages et son SHA-256.

Lancer `pnpm faction-packs:validate` après l'ajout ou la mise à jour d'un PDF.
Le contrôle vérifie les empreintes, la couverture de tous les PDF du dossier et
la cohérence avec `data/units/DataInfo.json`. Un pack plus récent que le
catalogue doit au minimum être audité ; les manques qui ne peuvent pas être
résolus sans une source de points ou une migration explicitement versionnée sont
conservés dans `audit.knownGaps`.
