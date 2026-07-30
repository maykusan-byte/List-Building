# Contexte de développement - List Building

## Objectif

Maintenir deux outils web locaux pour Warhammer 40,000 :

- `warhammer_40k_unit_browser(2).html` : navigateur de fiches d'unités.
- `cr_ateur_de_liste_warhammer_40k(5).html` : création, import et export de listes d'armée.

Les deux applications sont des pages HTML autonomes, sans serveur, build, package manager ni test automatisé. Elles chargent manuellement `master_warorgan.json` via `FileReader` ; ne pas introduire de dépendance backend sans demande explicite.

## Cartographie du dépôt

- `master_warorgan.json` est la source de données principale (environ 36 Mo).
- `*.pdf` contient les règles et packs de faction utilisés comme références métier. Ce ne sont pas des artefacts générés.
- `SM_Datasheets_Armageddon_V11.pdf` est une référence ciblée de fiches Space Marines.
- `Unit list.txt` et `Coaching w40k.txt` sont des notes de joueur, pas une source canonique de données.
- Les deux pages chargent Tailwind CDN et Font Awesome CDN. Le navigateur de fiches charge aussi la police Inter depuis Google Fonts.

## Contrat de données

La racine du JSON est un tableau de blocs de faction :

```text
FactionBlock { Name, Units[] }
Unit {
  Name, Faction, UnitComposition, UnitAbilities, Infos, Keywords,
  CoreAbilities, FactionKeywords, StatLines, Weapons, Upgrades, Points
}
```

- `Points` peut contenir plusieurs tailles/coûts ; ne pas supposer que `Points[0]` est l'unique coût possible.
- Les coûts d'équipement proviennent de `UnitComposition.WargearDefinitions` et les options de `ModelCompositions[].Wargear`.
- Les champs ajoutés en mémoire par l'interface commencent par `_` (`_factionName`, `_libraryId`) ; ne pas les sérialiser dans la base de référence.
- Traiter les champs optionnels comme absents par défaut et garder les valeurs source intactes.

La base actuelle contient 64 blocs pour 35 noms de faction distincts et 1 995 unités. Plusieurs blocs partagent donc le même nom (par exemple `Imperial Agents`, `Space Marines`, `Dark Angels`). Toujours agréger les blocs portant le même nom pour l'affichage, mais ne jamais utiliser le seul nom de faction comme identifiant primaire.

L'identifiant actuel de l'outil de liste (`${faction.Name}_${index}_${unit.Name}`) entre en collision pour 29 groupes dans la base actuelle. Il ne peut pas garantir qu'un export réimporte la bonne fiche. Lors d'une évolution de l'import/export, utiliser un identifiant source explicite ou un identifiant stable incluant la position du bloc, versionné dans le format d'export ; prévoir une migration ou un message clair pour les anciens exports.

## Règles d'implémentation

- Conserver l'expérience locale : chargement de fichier, pas d'appel réseau pour les données de jeu, import/export JSON explicite.
- Garder les deux interfaces compatibles avec le même schéma. Si une normalisation est nécessaire, l'extraire dans un module partagé uniquement après avoir prévu un mode de chargement simple dans le navigateur.
- Considérer tout texte issu du JSON importé comme non fiable. Préférer les nœuds DOM et `textContent`; échapper strictement toute valeur injectée dans `innerHTML`, les attributs HTML ou les gestionnaires inline.
- Conserver le texte et les fichiers en UTF-8. Les outils nettoient actuellement certains artefacts d'encodage ; corriger la source ou la chaîne d'import plutôt que multiplier les remplacements silencieux.
- Ne pas présenter les valeurs de la base comme des règles officielles à jour sans vérifier le document source et sa date de validité.
- Éviter les refactorings esthétiques mêlés aux changements de règles, de points ou du format d'export.

## Références de règles présentes

- Règles de base : éditions française et anglaise, 88 pages.
- Pack Space Marines français v1.0, valide en jeu égal à partir du 20 juin 2026.
- Pack Blood Angels français v1.0, valide en jeu égal à partir du 20 juin 2026.
- Pack Dark Angels anglais v1.1, valide en jeu égal à partir du 22 juillet 2026.

Avant de modifier des données de jeu, noter dans le changement le document, la version et la date qui justifient la mise à jour. Les points peuvent être mis à jour séparément dans l'application officielle : ne pas les déduire d'un texte de règle.

## Vérification minimale après un changement

1. Valider que `master_warorgan.json` se lit toujours comme JSON et conserver son tableau racine.
2. Ouvrir les deux pages dans un navigateur, charger la base et vérifier recherche, filtres et affichage d'une unité.
3. Dans le créateur, ajouter une unité avec plusieurs options de points et une option d'équipement ; contrôler le total.
4. Exporter la liste puis la réimporter dans la même base ; vérifier unités, taille sélectionnée, équipement et total.
5. Vérifier un nom ou un texte contenant apostrophes, guillemets et caractères accentués.
6. Tester au moins une faction présente dans plusieurs blocs et confirmer que les unités sont toutes accessibles.

Il n'existe pas de commande de build ou de test définie. Pour une modification importante, ajouter une vérification reproductible avant de modifier les données de production.
