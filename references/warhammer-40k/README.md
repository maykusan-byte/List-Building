# Références Warhammer 40,000

Ces documents sont des sources de contexte versionnées, hors du bundle public
de Warforge. Les noms de fichiers sont conservés afin de préserver la
provenance des extractions.

| Emplacement | Contenu | Usage dans Warforge |
| --- | --- | --- |
| `rules/core/` | Règles de base française et anglaise, 88 pages | Le PDF français alimente `data/rules/core-rules-fr.json`. |
| `faction-packs/` | 28 packs de faction officiels français V11, de la v1.0 à la v1.2 | Chaque PDF est recensé avec sa version, sa date d'effet, son nombre de pages et son empreinte dans `warforge-pwa/data/faction-packs/manifest.json`. |
| `datasheets/` | Fiches Space Marines Armageddon V11 | Référence ciblée de fiches. |
| `notes/` | Notes de joueur et liste d’unités | Contexte non canonique, jamais une source de règles. |

Avant toute mise à jour de règles ou de données, vérifier le document source,
sa version et sa date de validité. Les points peuvent être publiés séparément
et ne doivent pas être déduits du texte des règles.

Le manifeste des packs est vérifié avant toute compilation GitHub Pages. Un PDF
nouveau, modifié ou plus récent que le catalogue sans audit explicite bloque la
publication. Les écarts qui demandent une source de points ou une migration
d'identifiants restent déclarés comme tels et ne sont pas importés implicitement.
