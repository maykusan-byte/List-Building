# Simulateur tactique — invariants locaux

- Lire `../../docs/simulator/STATUS.md` et reprendre la tâche suivie avant de
  modifier ce module.
- Garder `domain/` et `geometry/` en TypeScript pur, sans React, PixiJS, DOM,
  IndexedDB ni stockage navigateur.
- Toute mutation de partie passe par `GameCommand -> GameEvent -> GameState`.
- Injecter le PRNG versionné ; `Math.random()` est interdit dans la logique.
- Utiliser des unités monde entières de 0,1 mm et isoler les pixels du rendu.
- Refuser explicitement tout contenu non couvert ; aucune approximation
  silencieuse ne peut produire une session valide.
- Ajouter des tests déterministes pour toute règle, transition ou primitive
  géométrique modifiée.
- Mettre à jour les preuves et le statut via le script du projet, jamais en
  éditant `STATUS.md` manuellement.
