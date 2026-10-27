# Warforge Layouts

Visualiseur public autonome pour poser les décors des 45 layouts GDM 2026.
Interface française, React/TypeScript/Vite, rendu SVG. GitHub Pages :
`https://maykusan-byte.github.io/List-Building/layouts/`.

## Utilisation

Choisir une confrontation et un layout, puis cliquer sur une empreinte.
Les repères A et B sont deux sommets du contour : leurs distances horizontales
et verticales sont disponibles depuis les quatre coins. Le sélecteur de coin
agit sur les projections et les graduations ; la rotation ne modifie pas les
coordonnées physiques. L’orientation initiale s’adapte à l’écran.

Le mode **Toutes** relie les 16 décors à un tableau de cotes. Le mode **Sans**
masque les projections sur la carte. Les calques grille, déploiements et
objectifs sont indépendants. Zoom à la molette ou par pincement, déplacement
par glissement. La fiche mobile s’ouvre en bas et conserve le cadrage.

Les fiches présentent les éléments GW assemblés, leur catégorie et un schéma
indicatif. Les grandes ruines illustrent un niveau supérieur, sans hauteur
supposée. Le lien partagé conserve carte, rotation, coin, calques et sélection.

## Développement et validation

Depuis la racine : `pnpm install --frozen-lockfile`, puis dans ce dossier :

```text
pnpm dev
pnpm data:validate
pnpm test
pnpm test:browser
pnpm build:pages
```

Le build n’utilise que le contenu versionné de ce projet. L’import explicite
`pnpm data:import` nécessite Python/Pillow et les ressources locales existantes
de Warforge Lists et de la PWA. Il n’est exécuté ni en CI ni dans le navigateur.
Les empreintes SHA-256 contrôlent les 137 fichiers de l’instantané public.

Les données sont réparties entre un manifeste commun (cinq contours de
gabarit, catalogue des pièces, index), un fichier par layout et les images
cotées WebP sans perte. Les mesures utilisent les transformations rigides des
gabarits ; l’export vérifie leur concordance avec les 720 placements acceptés.

## Précision et sources

- Les coordonnées calculées sont approximatives et portent **≈**, au dixième
  de pouce. Elles ne sont pas des cotes officielles au millimètre.
- A/B sont des repères locaux du visualiseur, distincts des points noirs GDM
  et des repères de composants GW. Les dimensions nominales ne sont pas les
  boîtes englobantes des contours de gravats.
- Les silhouettes et les icônes d’objectifs reproduisent les observations
  des cartes. Elles ne certifient pas une géométrie physique, des planchers,
  un rayon de contrôle ou une ligne de vue. Les parties cachées par une icône
  ne sont pas reconstruites.
- Les zones mixtes contiennent des éléments denses et légers ; la catégorie
  est attachée à chaque élément, pas déduite de la couleur du déploiement.
- GDM 2026 : archive du 30 août 2026. GW Event Companion v1.0, pages 7–8 et
  layouts, et Terrain Area Footprints du 12 juin 2026. Photos des kits GW
  du 19 juillet 2026 pour l’identification des assemblages. Liens dans l’app.
- L’instantané ne publie ni catalogue d’armée, ni vidéos, ni laboratoire privé.

## Publication

Le workflow Pages construit les deux applications puis exécute
`node warforge-layouts/scripts/assemble-pages.mjs` depuis la racine.
La PWA reste à `/List-Building/`, le visualiseur à `/List-Building/layouts/`.
Le service worker PWA exclut ce sous-chemin de son secours de navigation.
La vérification de cohabitation se lance après assemblage avec
`node warforge-layouts/scripts/check-pages.mjs`.

## Applications Android et Windows

Les applications embarquent les 45 layouts, les cartes cotées et les fiches.
La consultation fonctionne hors connexion ; les liens de référence ouvrent
le navigateur et le partage crée un lien vers le site public.

```text
pnpm build:desktop
pnpm android:signing
pnpm build:android
```

Windows : installeur NSIS x64, par utilisateur, dans `release/`. Le script
construit un projet temporaire minimal puis lance le programme empaqueté pour
vérifier les 45 layouts, la galerie, le partage et le rechargement. L’installeur
n’a pas de certificat Authenticode ; Windows peut afficher « éditeur inconnu ».
L’archive NSIS utilise une compression complète, sans blocs de mise à jour
différentielle, puisque cette livraison n’utilise pas de mise à jour automatique.

Android : APK release signé, Android 7.0 minimum (API 24), cible API 36.
Prérequis de compilation : JDK 21, SDK Android 36 et `ANDROID_HOME` (le chemin
Windows standard est détecté automatiquement). Exécuter `android:signing`
une seule fois : conserver `private-signing/` pour signer les mises à jour.
Les clés, mots de passe et fichiers locaux Android sont exclus de Git et des
livraisons. Les commandes sont exécutées depuis ce dossier.

Chaque binaire possède un fichier SHA-256. Les notes de release précisent les
contrôles effectués et les liens Drive. Les icônes sont générées localement
par `python scripts/generate-icons.py` (Pillow).

Projet communautaire indépendant, non affilié à Games Workshop. Cartes GDM
et références Warhammer : droits de leurs auteurs respectifs.
