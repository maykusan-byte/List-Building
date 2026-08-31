# ADR-020 — Extraction contrôlée des mesures des layouts GDM 2026

- Statut : accepté
- Date : 2026-08-30
- Décideur : project-owner
- Plan version : 3.2.0

## Contexte

Le propriétaire a fourni un dossier Google Drive contenant les 45 cartes de
layout GDM 2026 avec mesures visibles et confirme que GDM 2026 est une source
de projet fiable et entièrement utilisable. Le dépôt contient déjà 45 images
de mêmes noms dans l'archive GDM, mais leurs encodages diffèrent des originaux
Drive.

## Décision

1. Le dossier Drive `1clE0hvtnbtTN2xGdcR9scyrLcKQiMI0Z` est la provenance
   amont des 45 cartes mesurées approuvées.
2. Les copies déjà versionnées restent les actifs locaux de travail. Elles ne
   sont pas écrasées ; l'inventaire conserve les identifiants Drive, tailles et
   SHA-256 des originaux ainsi que les hashes des copies locales.
3. L'extraction suit le skill
   `warforge-layout-measurement-extraction` : OCR brut, cartouche et flèche
   visuelles, calibration du plateau, contrôles géométriques puis revue ciblée.
4. Aucune valeur OCR ne devient autoritative sans preuve visuelle ou double
   extraction concordante et contrôles géométriques.
5. La valeur imprimée est conservée en dixièmes de pouce. La conversion vers
   l'unité interne de 0,1 mm garde le rationnel exact avant tout arrondi.
6. M9-T01 devient une tranche XL approuvée et inclut l'inventaire et
   l'extraction structurée des 45 layouts avant sa revue indépendante.

## Conséquences

- Le simulateur peut progresser vers les placements de terrain M9 sans
  inventer de coordonnées depuis le raster.
- Les ambiguïtés sont regroupées dans une petite file de revue, qui constitue
  l'alternative manuelle la plus économique.
- Le corpus accepté contient 45 layouts × 32 repères, soit 1 440 mesures
  vérifiées, et aucune entrée restant en revue. Les mesures autoritatives sont
  reproductibles sémantiquement ; l'artefact revu est en plus lié à son
  SHA-256 canonique. Des versions différentes d'OpenCV peuvent faire varier
  uniquement des scores diagnostiques au millionième.
- La file antérieure à la revue (119 entrées après correction visuelle de
  `disruption-mirror-1/r001`) est conservée et liée par hash
  aux décisions Sol ; le finaliseur refuse une décision associée à une autre
  file.
- Ce corpus décrit les valeurs et coordonnées d'axe des cartouches. Leur
  association aux objectifs, zones de déploiement et sommets de terrain reste
  une étape distincte de transcription géométrique en M9-T03.
- L'autorité « approuvée par le projet » n'est pas renommée en publication
  officielle Games Workshop.

## Addendum du 2026-08-31

La compilation de `Disruption Mirror 1` a révélé que `r001` porte la cote
`4.1"` sur l'image, et non `4.0"` comme l'indiquait la lecture automatique.
La région a été ajoutée à la file liée, relue directement, puis l'artefact a
été régénéré. La mesure `m001` vaut désormais 41 dixièmes de pouce, soit le
miroir exact de `m032`. Les nouvelles empreintes sont contrôlées par le
manifeste et le validateur ; aucune autre mesure n'a été modifiée.
