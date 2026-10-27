# Warforge Layouts 1.0.0 — 27 octobre 2026

[Site public](https://maykusan-byte.github.io/List-Building/layouts/) ·
[Dossier de livraison Drive](https://drive.google.com/drive/folders/1HtFR7TtHGy11DHIC6FDf2tWOufpFE9yl)

45 layouts GDM, grille en pouces, mesures depuis les quatre coins, rotation,
zoom tactile, calques et fiches illustrées des éléments Armageddon. Les cotes
calculées sont approximatives (≈) ; les cartes cotées restent consultables.

Les versions Android et Windows embarquent les cartes pour la consultation
hors connexion. Les références externes et le partage utilisent Internet.

## Android

Installer `Warforge Layouts 1.0.0.apk`, puis autoriser cette installation si
Android le demande. Android 7.0 minimum, application `com.warforge.layouts`.
APK release signé ; même clé conservée localement pour les futures mises à jour.

SHA-256 : `901b14272d1b149740d45e44a5b2b5532e2089edcb01db316c671a5d37aecf8c`.

## Windows

Lancer `Warforge Layouts Setup 1.0.0.exe` pour installer l’application x64
dans le compte utilisateur. Le dossier d’installation est personnalisable.
L’installeur n’a pas de certificat Authenticode (éditeur inconnu).

SHA-256 : `b1717c65963094e7fde4e18eea829332ca85c4100abba1db0061eb522d244e50`.

## Vérification

Huit tests unitaires/de données et neuf scénarios navigateur du visualiseur.
Build public vérifié depuis un export de l’index sans projet privé. Navigation
avec le service worker de la PWA contrôlée. Régression PWA : 548 tests.

Windows : programme empaqueté lancé et contrôlé automatiquement ; les 45
layouts sont accessibles localement. Android : signature, manifeste et
intégralité des fichiers embarqués contrôlés. Aucun appareil ou émulateur
Android disponible pour vérifier le lancement natif sur appareil.

Les fichiers `.sha256` permettent de vérifier les téléchargements avec
`Get-FileHash -Algorithm SHA256` dans PowerShell.
