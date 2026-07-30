# Warforge 40k

PWA locale de création de listes Warhammer 40,000. Elle utilise la base `../master_warorgan.json`, prend en compte la faction, le format de bataille, le scénario, les détachements, les coûts d’unités, l’équipement et les améliorations.

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
d'environnement utilisateur `Path` de Windows.
- Le fichier `master_warorgan.json` à la racine du projet `List Building`

## Lancer en développement

Depuis ce dossier :

```powershell
pnpm install
pnpm dev
```

Ouvrir ensuite l’adresse affichée par Vite (habituellement `http://localhost:5173`). Avant chaque démarrage, `pnpm` copie automatiquement la base vers `public/data/`. Cette copie est générée et n’est pas une seconde source de vérité.

## Compiler la PWA

```powershell
pnpm build
pnpm preview
```

Le dossier `dist/` contient l’application statique distribuable. La base JSON est incluse dans le build et pré-cachée par le service worker : l’application peut donc fonctionner hors ligne après son premier chargement.

## Utilisation

1. Choisir le format de bataille et la faction, puis ajouter les détachements dans la limite des points de détachement.
2. Choisir un scénario proposé par au moins un des détachements sélectionnés. Avec plusieurs détachements, les scénarios disponibles sont la réunion de leurs scénarios liés.
3. Rechercher les unités, choisir leur taille, leur équipement et les améliorations éligibles.
4. Vérifier le panneau de validation, sauvegarder localement ou exporter une liste au format `warforge-list/v1`.

Les sauvegardes et favoris restent dans le navigateur. Le bouton « Mettre à jour la base » permet de charger une version JSON plus récente pour la session et le cache local.

## Validation des règles

L’application bloque les incohérences certaines présentes dans les données : scénario non proposé par les détachements sélectionnés, dépassement de points ou de budget de détachements, amélioration non éligible et format invalide. Les coûts de détachement absents du JSON ainsi que les restrictions uniquement rédigées en texte sont affichés comme avertissements : ils demandent une vérification dans les règles sources.

Les anciennes exportations de `cr_ateur_de_liste_warhammer_40k(5).html` ne sont volontairement pas importées, car leurs identifiants d’unités peuvent être ambigus. Utiliser les nouveaux exports versionnés de Warforge 40k.
