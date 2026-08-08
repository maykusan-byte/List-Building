const fs = require('fs');

const enMissions = JSON.parse(fs.readFileSync('warforge-pwa/public/data/missions.json', 'utf8'));

const nameMap = {
  "Battlefield Dominance": "Domination du Terrain",
  "Determined Acquisition": "Acquisition Déterminée",
  "Immovable Object": "Objet Inamovible",
  "Inescapable Dominion": "Domination Inéluctable",
  "Purge and Secure": "Éliminer et Sécuriser",

  "Consecrate": "Consécration",
  "Destroyer's Wrath": "Courroux du Destructeur",
  "Meatgrinder": "Hachoir à Viande",
  "Punishment": "Châtiment",
  "Unstoppable Force": "Force Inarrêtable",

  "Gather Intel": "Réunir des Informations",
  "Reconnaissance Sweep": "Balayage de Reconnaissance",
  "Search and Scour": "Ratissage",
  "Surveil the Foe": "Surveiller l'Ennemi",
  "Triangulation": "Triangulation",

  "Extract Relic": "Extraire la Relique",
  "Sabotage": "Sabotage",
  "Secure Asset": "Sécurisation",
  "Vanguard Operation": "Opération d'Avant-Garde",
  "Vital Link": "Liaison Vitale",

  "Death Trap": "Piège Mortel",
  "Delaying Action": "Action Retardée",
  "Locate and Deny": "Localiser et Priver",
  "Outmanoeuvre": "Surclassé",
  "Smoke and Mirrors": "De la Poudre aux Yeux"
};

enMissions.primary.forEach(m => {
  if (nameMap[m.name]) {
    m.name = nameMap[m.name];
  }
});

fs.writeFileSync('warforge-pwa/public/data/locales/fr/missions.json', JSON.stringify(enMissions, null, 2));
