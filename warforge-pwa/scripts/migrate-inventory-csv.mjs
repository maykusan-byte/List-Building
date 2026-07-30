import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve(import.meta.dirname, '../../datasheet_x_figs.csv');

// This is deliberately a migration-only table. The PWA never loads it and
// never attempts any name-based inventory matching.
const LEGACY_TARGETS = {
  'Adrax Agatone': 'ADRAX AGATONE',
  Aggressors: 'AGGRESSOR SQUAD',
  Apothicaire: 'APOTHECARY',
  'Apothicaire Biologis': 'APOTHECARY BIOLOGIS',
  'Archiviste en Armure Terminator': 'LIBRARIAN IN TERMINATOR ARMOUR',
  'Archiviste Primaris': 'LIBRARIAN',
  Astorath: 'ASTORATH',
  Azrael: 'AZRAEL',
  Belial: 'BELIAL',
  'Capitaine avec Bouclier Relique': 'CAPTAIN',
  'Capitaine avec Réacteur Dorsal': 'CAPTAIN WITH JUMP PACK',
  'Capitaine en Armure Gravis': 'CAPTAIN IN GRAVIS ARMOUR',
  'Capitaine en Armure Terminator': 'CAPTAIN IN TERMINATOR ARMOUR',
  'Capitaine Gravis': 'CAPTAIN IN GRAVIS ARMOUR',
  'Capitaine Tacticus': 'CAPTAIN',
  'Champion de Compagnie': 'PRIMARIS COMPANY CHAMPION',
  'Chapelain avec Réacteur Dorsal': 'CHAPLAIN WITH JUMP PACK',
  'Chevaliers de la Deathwing': 'DEATHWING KNIGHTS',
  'Compagnie de la Mort à pied': 'DEATH COMPANY MARINES',
  'Compagnie de la Mort avec Réacteurs Dorsaux': 'DEATH COMPANY MARINES WITH JUMP PACKS',
  Dante: 'COMMANDER DANTE',
  'Doyen Bladeguard': 'BLADEGUARD ANCIENT',
  'Doyen de Compagnie': 'ANCIENT',
  'Dreadnought Ballistus': 'BALLISTUS DREADNOUGHT',
  'Dreadnought Brutalis': 'BRUTALIS DREADNOUGHT',
  'Dreadnought Redemptor': 'REDEMPTOR DREADNOUGHT',
  Eliminators: 'ELIMINATOR SQUAD',
  Eradicators: 'ERADICATOR SQUAD',
  'Ezékiel': 'EZEKIEL',
  'Frère Corbulo': 'BROTHER CORBULO',
  'Gardes Victrix': 'VICTRIX HONOUR GUARD',
  'Gladiator Lancer': 'GLADIATOR LANCER',
  'Gladiator Reaper': 'GLADIATOR REAPER',
  'Gladiator Valiant': 'GLADIATOR VALIANT',
  'Heavy Intercessors': 'HEAVY INTERCESSOR SQUAD',
  Hellblasters: 'HELLBLASTER SQUAD',
  'Héros de Compagnie': 'COMPANY HEROES',
  Hunter: 'HUNTER',
  Impulsor: 'IMPULSOR',
  Inceptors: 'INCEPTOR SQUAD',
  Incursors: 'INCURSOR SQUAD',
  'Infernus Marines': 'INFERNUS SQUAD',
  Infiltrators: 'INFILTRATOR SQUAD',
  Intercessors: 'INTERCESSOR SQUAD',
  "Intercessors d'Assaut": 'ASSAULT INTERCESSOR SQUAD',
  "Intercessors d'Assaut avec Réacteurs Dorsaux": 'ASSAULT INTERCESSORS WITH JUMP PACKS',
  'Iron Father Feirros': 'IRON FATHER FEIRROS',
  Judiciar: 'JUDICIAR',
  'Land Raider classique': 'LAND RAIDER',
  'Land Raider Crusader': 'LAND RAIDER CRUSADER',
  'Land Raider Redeemer': 'LAND RAIDER REDEEMER',
  'Land Speeder': 'LAND SPEEDER',
  'Le Sanguinor': 'THE SANGUINOR',
  Lemartes: 'LEMARTES',
  Lieutenant: 'LIEUTENANT',
  "Lion El'Jonson": "LION EL'JONSON",
  Lysander: 'DARNATH LYSANDER',
  'Maître Archiviste Tigurius': 'CHIEF LIBRARIAN TIGURIUS',
  'Maître de Chapitre': 'CAPTAIN',
  'Maître des Exécutions': 'MASTER OF EXECUTIONS',
  'Marneus Calgar': 'MARNEUS CALGAR',
  'Motards classiques': 'BIKE SQUAD',
  Outriders: 'OUTRIDER SQUAD',
  Predator: 'PREDATOR ANNIHILATOR',
  'Predator Annihilator': 'PREDATOR ANNIHILATOR',
  'Predator Destructor': 'PREDATOR DESTRUCTOR',
  Razorback: 'RAZORBACK',
  Reivers: 'REIVER SQUAD',
  Repulsor: 'REPULSOR',
  'Repulsor Executioner': 'REPULSOR EXECUTIONER',
  Rhino: 'RHINO',
  'Roboute Guilliman': 'ROBOUTE GUILLIMAN',
  Scouts: 'SCOUT SQUAD',
  Stalker: 'STALKER',
  Techmarine: 'TECHMARINE',
  Terminators: 'TERMINATOR SQUAD',
  "Terminators d'Assaut": 'TERMINATOR ASSAULT SQUAD',
  'Terminators Reliques': 'RELIC TERMINATOR SQUAD',
  'Vétérans Bladeguard': 'BLADEGUARD VETERAN SQUAD',
  "Vétérans d'Avant-Garde avec Réacteurs Dorsaux": 'VANGUARD VETERAN SQUAD WITH JUMP PACKS',
  'Vétérans Sternguard': 'STERNGUARD VETERAN SQUAD',
  Vindicator: 'VINDICATOR',
  "Vulkan He'stan": "VULKAN HE'STAN",
  Whirlwind: 'WHIRLWIND'
};

function slug(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'inconnu';
}

function fingerprintRaw(raw) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${raw.length}`;
}

function normalizedName(value) {
  return value
    .replaceAll('â€™', "'")
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function parseLegacyCsv(raw) {
  const lines = raw.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.shift() !== 'Nom_datasheet,ID_figurine,Type') {
    throw new Error('Ce script ne migre que le format historique Nom_datasheet,ID_figurine,Type.');
  }
  return lines.map((line, index) => {
    const [name, figureId, type] = line.split(',');
    if (!name || !/^\d+$/.test(figureId) || (type !== 'real' && type !== 'proxy')) {
      throw new Error(`Ligne historique invalide ${index + 2}.`);
    }
    return { name, figureId: Number(figureId), type };
  });
}

function quoted(value) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const masterPath = resolve(import.meta.dirname, '../../master_warorgan.json');
const [legacyRaw, masterBytes] = await Promise.all([readFile(source, 'utf8'), readFile(masterPath)]);
const masterRaw = new TextDecoder().decode(masterBytes);
const legacyRows = parseLegacyCsv(legacyRaw);
const books = JSON.parse(masterRaw);
const targetsByName = new Map();
for (const [bookIndex, book] of books.entries()) {
  const bookId = `book-${bookIndex}-${slug((book.Id ?? book.Name ?? '').trim())}`;
  for (const [unitIndex, unit] of (book.Units ?? []).entries()) {
    const name = unit.Name?.trim();
    if (!name) continue;
    const key = normalizedName(name);
    const entries = targetsByName.get(key) ?? [];
    entries.push({ unitId: `${bookId}:unit:${unitIndex}`, displayName: name });
    targetsByName.set(key, entries);
  }
}

const unresolved = [...new Set(legacyRows.map((row) => row.name).filter((name) => !LEGACY_TARGETS[name]))];
if (unresolved.length > 0) throw new Error(`Correspondances de migration manquantes : ${unresolved.join(', ')}.`);

const fingerprint = fingerprintRaw(masterRaw);
const migrated = new Map();
for (const row of legacyRows) {
  const targets = targetsByName.get(normalizedName(LEGACY_TARGETS[row.name]));
  if (!targets?.length) throw new Error(`Aucun UnitId de catalogue pour ${row.name} → ${LEGACY_TARGETS[row.name]}.`);
  for (const target of targets) {
    const key = `${row.figureId}\u0000${target.unitId}`;
    const previous = migrated.get(key);
    // The new format forbids an exact duplicate. If legacy aliases converge on
    // the same catalog unit, the physical model remains real when either row is real.
    if (!previous || (previous.type === 'proxy' && row.type === 'real')) {
      migrated.set(key, { figureId: row.figureId, unitId: target.unitId, type: row.type, displayName: target.displayName });
    }
  }
}

const rows = [...migrated.values()].sort((left, right) =>
  left.figureId - right.figureId || left.unitId.localeCompare(right.unitId) || left.type.localeCompare(right.type)
);
const output = [
  'DatabaseFingerprint,UnitId,ID_figurine,Type,Nom_datasheet',
  ...rows.map((row) => [fingerprint, row.unitId, row.figureId, row.type, row.displayName].map((value) => quoted(String(value))).join(','))
].join('\n').concat('\n');

await writeFile(source, output, 'utf8');
console.log(`CSV migré : ${rows.length} associations UnitId, empreinte ${fingerprint}.`);
