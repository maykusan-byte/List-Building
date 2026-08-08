# Warforge 40k

PWA locale de création de listes Warhammer 40,000. Elle génère son catalogue intégré V11 depuis `data/units/` (version des données portée par `DataInfo.json`), prend en compte la faction, les alliés déclarés, le format de bataille, le scénario, les détachements, les coûts d’unités, l’équipement et les améliorations.

## Prérequis

- Node.js 22 ou plus récent
- pnpm 10 ou plus récent

Sur Windows, si la commande `pnpm` n'est pas reconnue, installez-la une fois
avec npm (fourni avec Node.js) puis rouvrez PowerShell :

```powershell
npm install --global pnpm@latest-11
```

Vous pouvez vérifier l'installation avec `pnpm --version`.

Si `npm install --global pnpm@latest-11` réussit mais que `pnpm` reste
introuvable dans PowerShell, ajoutez son dossier global au `PATH` de la
session en cours, puis relancez la commande :

```powershell
$pnpmHome = npm prefix --global
$env:Path += ";$pnpmHome"
pnpm --version
```

Fermez ensuite ce terminal et ouvrez-en un nouveau. Si le problème persiste,
ajoutez le dossier affiché par `npm prefix --global` à la variable
d’environnement utilisateur `Path` de Windows.
- Les 36 fichiers de faction, `DataInfo.json` et `FactionInfoData.json` dans `data/units/`

## Organisation des données

- `data/units/`, `data/locales/`, `data/rules/` et `data/inventory/` sont les
  entrées versionnées de Warforge.
- `data/faction-packs/manifest.json` relie chaque pack de faction français à
  son PDF local, son empreinte SHA-256, sa version, sa date d'effet et son
  état d'audit. `pnpm faction-packs:validate` bloque les sources nouvelles ou
  non auditées avant une publication.
- Les fichiers sous `public/data/` sont générés par `pnpm sync-data`, à
  l’exception des images publiques validées.
- Les PDF de règles et les notes de contexte sont conservés hors de la PWA dans
  `../references/warhammer-40k/` ; les outils Warorgan historiques vivent dans
  `../legacy/warorgan/`.

## Lancer en développement

Depuis ce dossier :

```powershell
pnpm install
pnpm dev
```

Ouvrir ensuite l’adresse affichée par Vite (habituellement `http://localhost:5173`). Avant chaque démarrage, `pnpm` génère `public/data/catalog.json`. Cette copie est générée et n’est pas une seconde source de vérité. La base Warorgan historique est archivée dans `../legacy/warorgan/` et ne sert qu’aux migrations explicites.

## Compiler la PWA

```powershell
pnpm build
pnpm preview
```

Le dossier `dist/` contient l’application statique distribuable. Le catalogue V11 et l’inventaire sont inclus dans le build et pré-cachés par le service worker : l’application peut donc fonctionner hors ligne après son premier chargement.

Les ressources statiques utilisées par l’application, notamment les images d’unités,
doivent être placées dans `public/data/`. Le dossier `dist/` est généré et est remplacé
à chaque build.

## Images d’unités

Les miniatures du catalogue sont locales, donc disponibles hors ligne. Leur source de
vérité est `data/unit-image-seeds.json` : chaque entrée doit cibler une fiche par son
nom exact (et sa faction si nécessaire), contenir la provenance et une référence de
licence. Seules les fiches présentes dans l’inventaire par défaut sont ajoutées au
manifeste public.

Pour les nouveaux visuels, les fichiers sources sont téléchargés dans le cache local
ignoré `data/unit-image-sources/` et ne sont pas publiés ; seules les miniatures WebP
normalisées de `public/data/img/units/` sont nécessaires au catalogue.

```powershell
pnpm images:fetch   # récupère les sources distantes explicitement référencées
pnpm images:prepare # normalise les sources validées en WebP 320 × 320
pnpm images:build   # génère public/data/unit-images.json et le rapport des manques
pnpm images:validate # vérification stricte : toutes les fiches d’inventaire doivent être couvertes
```

`data/unit-image-missing.json` est la file de validation : il recense les fiches encore
sans rapprochement suffisamment certain. Ne pas utiliser de nom de fichier ou de
recherche approximative comme identifiant d’unité.

## Déploiement GitHub Pages

Chaque envoi sur la branche `master` déclenche le workflow
`.github/workflows/deploy-pages.yml`. Il installe les dépendances, valide les packs de
faction, génère le catalogue,
synchronise les ressources versionnées de la PWA, compile la PWA et publie `dist/` sur GitHub Pages.

Le workflow utilise automatiquement le chemin du dépôt GitHub : les données,
l’inventaire et les ressources publiques restent donc accessibles sous l’URL publique
du projet.

## Inventaire

L’inventaire par défaut est le fichier `data/inventory/datasheet_x_figs.csv`. Il est copié avec
la base, pré-caché par la PWA et peut être remplacé localement depuis le bouton
« Importer un inventaire CSV ».

Les quatre colonnes contractuelles sont :

```text
DatabaseFingerprint,UnitId,ID_figurine,Type
```

- `UnitId` est le seul lien vers le catalogue ; il doit être exact.
- `Type` vaut strictement `real` ou `proxy`.
- `DatabaseFingerprint` doit correspondre à la base chargée, sinon le CSV est refusé.
- `Nom_datasheet`, s’il est présent, et toute autre colonne sont purement documentaires : l’application ne les lit, ne les valide et ne les affiche jamais.

Pour préparer un nouveau CSV avec les identifiants de la base actuelle :

```powershell
pnpm inventory:index ..\catalog_unit_index.csv
```

Une mise à jour de la base qui change son empreinte impose de régénérer et de
valider humainement l’inventaire. Les réservations sont recalculées depuis la
liste et l’inventaire local ; elles ne modifient pas le format d’export v1.

Pour préparer la migration depuis l’ancienne base, utilisez uniquement un CSV
d’inventaire historique dont les `UnitId` proviennent de cette base, puis lancez
d’abord le contrôle :

```powershell
pnpm inventory:rebase --check
```

Après validation, `pnpm inventory:rebase --apply --exclude-unavailable` écrit le
CSV V11. Les fiches disparues du catalogue sont conservées séparément dans
`data/inventory-v11-unavailable.csv`; ce script n’utilise jamais `Nom_datasheet`.
Ne l’exécutez pas comme contrôle courant sur l’inventaire V11 actif : la
migration est volontairement à sens unique.

## Utilisation

1. Choisir le format de bataille et la faction, puis ajouter les détachements dans la limite des points de détachement.
2. Choisir un scénario proposé par au moins un des détachements sélectionnés. Avec plusieurs détachements, les scénarios disponibles sont la réunion de leurs scénarios liés.
3. Rechercher les unités, choisir leur taille, leur équipement et les améliorations éligibles. Les alliés autorisés sont affichés dans la bibliothèque avec un badge, mais leurs détachements ne sont jamais proposés.
4. Ouvrir « Détails » pour consulter tous les profils d’armes. Dans la liste, configurer l’armement et l’équipement par type de figurine : les limites structurées (`Max`, `PerXModels`, remplacements et détachement requis) sont appliquées et les cas ambigus sont signalés.
5. Vérifier le panneau de validation, sauvegarder localement ou exporter une liste au format `warforge-list/v1`.

Les sauvegardes et favoris restent dans le navigateur. Le bouton « Mettre à jour la base » permet de charger une base JSON historique pour la session. Les sauvegardes/favoris du catalogue V11 sont isolés des identifiants historiques.

## Validation des règles

L’application bloque les incohérences certaines présentes dans les données : scénario non proposé par les détachements sélectionnés, dépassement de points ou de budget de détachements, amélioration non éligible et format invalide. Un coût de détachement absent du JSON représente le coût standard de 1 DP. Les lignes de points sont regroupées par taille : `UnitCount` détermine le palier de coût selon le rang d’occurrence du même `UnitId`, même si les tailles choisies diffèrent. Les restrictions d’alliés uniquement rédigées en texte restent des avertissements à vérifier dans les règles sources.

Les anciennes exportations de `../legacy/warorgan/cr_ateur_de_liste_warhammer_40k(5).html` ne sont volontairement pas importées, car leurs identifiants d’unités peuvent être ambigus. Utiliser les nouveaux exports versionnés de Warforge 40k.
