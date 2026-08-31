# ADR-024 — Runtime léger des layouts 2,5D

- Statut : accepté
- Date : 2026-08-31
- Décideur : project-owner
- Plan version : 3.3.0

## Contexte

Les 45 cartes GDM 2026, leurs images, leurs mesures et leurs preuves de revue
forment une source de développement riche. Une partie n'a cependant besoin que
du layout sélectionné. Charger ou revalider tout le corpus pendant le jeu,
redessiner en continu une scène statique ou pré-calculer toutes les lignes de
vue augmenterait le coût sans améliorer le POC.

## Décision

1. L'archive des 45 layouts reste une ressource de validation et n'entre pas
   dans le chemin runtime du jeu.
2. Un layout sélectionné est matérialisé une seule fois par version en
   coordonnées monde entières. Les sessions suivantes réutilisent cette
   géométrie statique.
3. La sauvegarde référence l'identifiant, la version et l'empreinte du layout ;
   elle ne duplique pas ses polygones.
4. Pixi fonctionne sans boucle de rendu continue. Le plateau, les terrains et
   les objectifs forment un calque statique ; figurines et surcouches
   d'interaction sont mises à jour seulement lorsqu'un état pertinent change.
5. Les aperçus de glisser-déposer sont limités à une mise à jour par frame. La
   validation autoritaire exacte reste liée à la commande de mouvement.
6. Mouvement, LoS, couvert et contrôle d'objectif sont calculés à la demande,
   jamais à chaque rendu React. Un cache éventuel est indexé par la révision
   spatiale et invalidé lorsqu'une pose ou un état pertinent change.
7. Aucun moteur 3D, moteur physique, navmesh, worker ou éditeur générique n'est
   introduit sans mesure montrant qu'il est nécessaire.
8. `Disruption Mirror 1` conserve ses polygones directs pour le POC. Une
   bibliothèque de pièces avec position, rotation et miroir ne sera créée
   qu'après observation de répétitions réelles sur plusieurs layouts.

## Conséquences

- La validation reste exhaustive et sourcée au build, tandis que le navigateur
  ne charge que la définition compacte utile.
- Les calculs exacts peuvent rester simples : le POC ne contient que treize
  zones, vingt-huit surfaces et vingt-deux figurines.
- L'extension aux 44 autres layouts ne fait pas partie du POC et ne consomme
  pas de travail IA prématuré.
- L'index spatial existant pourra être branché sur les requêtes autoritaires si
  un profilage le justifie ; il n'est pas requis pour déclarer le POC fluide.
