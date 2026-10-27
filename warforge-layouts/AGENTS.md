# Warforge Layouts

Application publique autonome d’aide à la pose des 45 layouts GDM 2026.
React/TypeScript/Vite, plateau SVG, aucune simulation ni backend.

- `public/data/` contient un instantané public autonome généré par
  `scripts/import-layouts.py`. L’import est explicite et local ; le build et
  la CI ne lisent jamais `warforge-lists/`.
- Préserver la géométrie acceptée et sa provenance. Les coordonnées calculées
  sont approximatives ; ne pas les présenter comme des cotes officielles.
- Les silhouettes observées illustrent les cartes ; elles ne certifient ni
  hauteur, ni volume, ni visibilité. Ne pas publier de données privées annexes.
- Utiliser le skill layout-measurement-extraction pour les opérations de données.
- Vérifier `pnpm test`, `pnpm test:browser` et `pnpm build:pages`.
- Publication dans `/List-Building/layouts/` via le workflow Pages partagé.
- Android/Windows embarquent le même instantané. Ne jamais versionner ou
  téléverser `private-signing/`, ni publier les applications privées voisines.
- Pour une release native, vérifier la signature et le contenu de l’APK et
  laisser le script desktop contrôler l’application empaquetée avant livraison.
