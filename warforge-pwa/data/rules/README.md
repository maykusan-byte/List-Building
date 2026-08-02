# Référence des règles

`core-rules-fr.json` est la transcription Web générée à partir de
`../../../references/warhammer-40k/rules/core/fre_01-06_warhammer40k_new40k_core_rules-ooyuallyp9-s4aczdfbm2_copie.pdf`.
Il est distribué avec la PWA, y compris dans le build GitHub Pages.

Lorsqu’une nouvelle version du PDF est retenue :

1. Vérifier manuellement le document, sa date et ses changements de règles.
2. Lancer `pnpm rules:extract` depuis `warforge-pwa` (PyPDF2 est requis).
3. Contrôler les 24 références, les pages source, les tableaux et schémas recréés.
4. Lancer `pnpm test` puis `pnpm build:pages`.

Les informations de score du pack de missions sont volontairement limitées aux
publications officielles accessibles en ligne. Ne pas ajouter de barème de carte
ou de texte de mission sans une source officielle fournie et versionnée.
