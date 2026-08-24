# Référence des règles

`core-rules-fr.json` est la transcription Web générée à partir de
`../../../references/warhammer-40k/rules/core/fre_01-06_warhammer40k_new40k_core_rules-ooyuallyp9-s4aczdfbm2_copie.pdf`.
Il est distribué avec la PWA, y compris dans le build GitHub Pages.

`official-app-faq-fr-2026-07.json` est une ressource locale de référence,
non distribuée automatiquement : transcription des FAQ entièrement visibles
dans les captures françaises de l'application officielle, dont la dernière mise
à jour affichée est le 22 juillet 2026. Les originaux et leurs empreintes sont
archivés dans `../../../references/warhammer-40k/rules/commentary/official-app-2026-08-24/`.
Chaque entrée renvoie aux captures correspondantes ; l'archive est partielle et
ne doit pas être prise pour la totalité de la FAQ. Une clarification extraite
ne devient exécutable dans le simulateur qu'après formalisation, tests et
activation explicite de son rulepack.

`official-app-references-fr-2026-07.json` transcrit les sous-sections de règles
de l'application officielle capturées le 24 août 2026, notamment `01.05.02`
(relances), `02.02.01` (modificateurs) et `02.02.03` (caractéristiques aléatoires). Ses captures,
empreintes et identifiants Drive sont archivés dans
`../../../references/warhammer-40k/rules/app-references/official-app-2026-08-24/`.

`official-app-errata-fr-2026-07.json` conserve séparément les corrections
officielles visibles à cette même date. Les remplacements documentaires ne
réécrivent pas rétroactivement `core-rules-fr.json` : un jalon doit les
formaliser et les activer explicitement dans son rulepack.

Lorsqu’une nouvelle version du PDF est retenue :

1. Vérifier manuellement le document, sa date et ses changements de règles.
2. Lancer `pnpm rules:extract` depuis `warforge-pwa` (PyPDF2 est requis).
3. Contrôler les 24 références, les pages source, les tableaux et schémas recréés.
4. Lancer `pnpm test` puis `pnpm build:pages`.

Les informations de score du pack de missions sont volontairement limitées aux
publications officielles accessibles en ligne. Ne pas ajouter de barème de carte
ou de texte de mission sans une source officielle fournie et versionnée.
