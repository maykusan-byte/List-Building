# Validation — 27 octobre 2026

## Données

- 45 layouts, 720 placements, 90 zones de déploiement, 270 repères d’objectifs.
- 117 000 sommets de contours reconstruits depuis les cinq gabarits ; écart
  maximum avec le corpus accepté : 0,000001993 pouce. Cette concordance ne
  change pas la précision du corpus, qui reste issue des illustrations.
- 45 cartes cotées transcodées sans perte : comparaison de tous les pixels RGB
  entre les PNG source et les WebP publics, sans différence.
- Deux exports consécutifs donnent les mêmes octets et les mêmes empreintes
  pour les 137 fichiers de l’instantané.
- Contrôle visuel des cinq planches de neuf layouts, source à gauche et
  contours/éléments exportés à droite, confronté au PDF GW pages 7–9 et aux
  photos officielles des trois kits du 19 juillet 2026.
- Composition par table : huit grandes ruines, huit petites ruines, deux
  blocs de condensateurs, deux réseaux électriques, deux sanctuaires,
  quatre barricades et quatre pylônes. Les deux pylônes d’une bande courte et
  les deux barricades d’une bande longue sont comptés comme éléments assemblés.
- Les silhouettes restent illustratives : les contours masqués par des
  pictogrammes ne sont pas reconstruits. Aucun statut privé en attente de revue
  humaine, ni aucune estimation privée de hauteur, n’est promu en donnée officielle.

## Application

- Huit tests unitaires/de données : toutes les ancres des 720 placements,
  quatre rotations, quatre coins, transformations rigides, zoom et URL.
- Neuf scénarios navigateur : galerie, sélection clavier et pointeur, calques,
  carte cotée, erreurs réseau/reprise, liens partagés, glissement, pincement
  tactile et affichage 390×844, 844×390, 1024×768, 1440×1000.
- Captures relues après correction des contours de focus SVG, de la taille
  des cotes et du panneau inférieur mobile.
- Construction TypeScript et Vite pour le sous-chemin GitHub Pages réussie.
- Site assemblé testé avec un service worker PWA installé : accès direct,
  redirection avec barre finale, navigation depuis la PWA et rechargement
  d’un lien partagé. Aucun remplacement par l’index de la PWA.

## Régression et revue du code

- PWA : 59 fichiers / 548 tests passent avec deux workers ; le premier lancement
  sans limitation a rencontré des délais de démarrage des workers Windows.
- Build Pages de la PWA réussi. Aucun changement des sources de données PWA.
- Revue : état physique indépendant de la caméra, annulation des chargements
  devenus obsolètes, état URL validé, composants de fiche et carte séparés,
  contenu rendu par React, état candidat explicitement conservé, publication
  limitée à l’instantané public. Les changements locaux antérieurs sont exclus
  de l’index de livraison.

## Reproductibilité de la publication

- Export de l’index Git dans un dossier distinct, sans les projets privés ;
  installation hors ligne avec lockfile figé (trois workspaces publics).
- Build Pages des deux applications et test de cohabitation réussis sur cet
  export. Les 137 fichiers du visualiseur conservent leurs octets via ses
  attributs Git ; leurs empreintes passent après checkout.
- Réparation du blocage antérieur du workflow Pages (run 33441179618) : les
  preuves GDM avaient été hachées avec des fins de ligne Windows. Les attributs
  explicites rétablissent CRLF pour les candidats et les mesures canoniques.
  La file de pré-revue contient des fins de ligne mixtes : son contenu exact
  est conservé, avec le même JSON et le SHA-256 déjà approuvé. Aucune valeur,
  décision de revue ou empreinte attendue n’a été changée.

## Applications installables

- APK release 1.0.0, versionCode 10000, `com.warforge.layouts`, API 24–36.
  `apksigner verify --verbose --print-certs` valide la signature v2 RSA 3072.
  Empreinte SHA-256 du certificat public :
  `6bb35cb3c101c120b6ef1550cbd591d412538eb8564c2c3f709b47156826c6ca`.
- `python scripts/check-android.py` contrôle les 136 ressources répertoriées
  plus le manifeste d’intégrité et tous les fichiers web embarqués ; aucun
  serveur distant ni secret de signature dans l’APK. Aucun appareil ou
  émulateur Android disponible : lancement natif sur appareil non testé.
- Windows : contrôle Playwright sur l’exécutable empaqueté, fenêtre masquée,
  avec galerie de 45 layouts, lecture des 45 JSON via le protocole local,
  sélection d’un layout, lien public et rechargement. Aucun échec JavaScript.
- Les binaires sont accompagnés de SHA-256 ; les clés Android restent locales.

## Livraison confirmée

- Commit applicatif `e9a0bf7a3783dde3149c7e68d9934c6391fa26e9`.
- [Déploiement Pages réussi](https://github.com/maykusan-byte/List-Building/actions/runs/40562745655)
  et [CI complète réussie](https://github.com/maykusan-byte/List-Building/actions/runs/40562745469).
- Contrôle sur le site public : réponse HTTP 200, manifeste de 45 layouts,
  sélection d’un décor, tableau des quatre coins et rechargement de la vue.
  L’aperçu avec l’ancien cache PWA affiche aussi le visualiseur après sa mise à jour.
- Les six scénarios navigateur de la PWA passent également sur la copie propre.
- APK de 17 319 317 octets et installeur Windows de 96 257 459 octets déposés
  dans le dossier Drive de release ; noms, tailles et dossier parent relus via
  l’API. Deux fichiers SHA-256 et notes d’installation accompagnent les builds.
