import { formatSaveDisplay } from "../domain/catalog";
import type { NormalizedDatabase, NormalizedUnit } from "../domain/types";
export function sanitizeStratagemCategoryForQuiz(category: string | undefined, detachmentNames: string[]): string | null {
  if (!category) return null;
  let result = category;
  for (const name of detachmentNames) {
    if (!name || name.trim().length < 2) continue;
    const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    result = result.replace(regex, '');
  }
  result = result.replace(/^[\s\-–—·:]+|[\s\-–—·:]+$/g, '').trim();
  result = result.replace(/\s*[\-–—·:]\s*/g, ' - ').trim();
  if (!result || result === '-') {
    return null;
  }
  return result;
}

export function sanitizeStratagemTextForQuiz(text: string | undefined, detachmentNames: string[], isFrench: boolean): string | undefined {
  if (!text) return text;
  let result = text;
  for (const name of detachmentNames) {
    if (!name || name.trim().length < 3) continue;
    const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    result = result.replace(regex, isFrench ? '[Détachement]' : '[Detachment]');
  }
  return result;
}

export function generateStatOptions(statKey: string, correctVal: string): string[] {
  const norm = correctVal.trim();
  const optionsSet = new Set<string>();
  optionsSet.add(norm);

  if (statKey === 'Movement') {
    const num = parseInt(norm);
    if (!isNaN(num)) {
      [num - 2, num - 1, num + 1, num + 2, num + 3].forEach((v) => {
        if (v > 0) optionsSet.add(`${v}"`);
      });
    }
    ['5"', '6"', '7"', '8"', '10"', '12"'].forEach((s) => optionsSet.add(s));
  } else if (statKey === 'Toughness' || statKey === 'Wounds' || statKey === 'OC') {
    const num = parseInt(norm);
    if (!isNaN(num)) {
      [num - 2, num - 1, num + 1, num + 2, num + 3].forEach((v) => {
        if (v > 0 || norm === '0') optionsSet.add(String(v));
      });
    }
    ['1', '2', '3', '4', '5', '6', '8', '10', '12'].forEach((s) => optionsSet.add(s));
    if (norm === '0') optionsSet.add('0');
  } else if (statKey === 'Save' || statKey === 'Leadership') {
    if (norm.includes('/')) {
      const parts = norm.split('/');
      const reg = parts[0];
      const inv = parts[1];
      const rNum = parseInt(reg);
      const iNum = parseInt(inv);

      if (!isNaN(rNum) && !isNaN(iNum)) {
        optionsSet.add(`${rNum}+/${iNum}++`);
        optionsSet.add(`${rNum}+/${iNum + 1}++`);
        optionsSet.add(`${rNum + 1}+/${iNum}++`);
        optionsSet.add(`${rNum + 1}+/${iNum + 1}++`);
        optionsSet.add(`${rNum}+`);
      }
    } else {
      const num = parseInt(norm);
      if (!isNaN(num)) {
        [num - 2, num - 1, num + 1, num + 2].forEach((v) => {
          if (v >= 2 && v <= 10) optionsSet.add(`${v}+`);
        });
      }
      ['2+', '3+', '4+', '5+', '6+', '7+'].forEach((s) => optionsSet.add(s));
    }
  }

  const pool = Array.from(optionsSet);
  // Pick up to 4 options including correct. Never propose "0" or "0\"" unless correct value is "0" or "0\""
  const isNormZero = norm === '0' || norm === '0"';
  const distractors = pool.filter((o) => o !== norm && (isNormZero || (o !== '0' && o !== '0"')));
  distractors.sort(() => Math.random() - 0.5);
  const selectedOptions = [norm, ...distractors.slice(0, 3)];
  selectedOptions.sort((a, b) => {
    const na = parseInt(a);
    const nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  return selectedOptions;
}

export function getExpectedStatValue(line: Record<string, unknown>, key: string): string {
  if (key === 'Save') {
    return formatSaveDisplay(line).displaySave;
  }
  return String(line[key] ?? '—').trim();
}

export function shuffleArray<T>(arr: readonly T[]): T[] {
  const res = [...arr];
  for (let i = res.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [res[i], res[j]] = [res[j], res[i]];
  }
  return res;
}

export function unitHasKeyword(unit: NormalizedUnit, targetKw: string): boolean {
  const normTarget = targetKw.toUpperCase().trim();
  const allKws = [...(unit.Keywords ?? []), ...(unit.FactionKeywords ?? [])].map((k) => k.toUpperCase().trim());
  return allKws.includes(normTarget);
}

const EXCLUDED_EXPLICIT_KEYWORDS = new Set([
  'IMPERIUM',
  'ADEPTUS ASTARTES',
  'CHAOS',
  'TYRANIDS',
  'AELDARI',
  'NECRONS',
  'TAU EMPIRE',
  'ORKS',
  'LEAGUES OF VOTANN'
]);

export function isForbiddenKeyword(kw: string, database: NormalizedDatabase): boolean {
  const normKw = kw.trim().toUpperCase();
  if (!normKw || normKw.startsWith('FACTION:') || normKw.includes('FACTION')) return true;
  if (EXCLUDED_EXPLICIT_KEYWORDS.has(normKw)) return true;

  // Check against Factions
  for (const f of database.factions) {
    const names = [f.name, f.id, f.sourceKey].filter((s): s is string => Boolean(s));
    for (const name of names) {
      const fn = name.trim().toUpperCase();
      if (fn.length >= 2 && (normKw === fn || normKw.includes(fn) || fn.includes(normKw))) {
        return true;
      }
    }
  }

  // Check against Units
  for (const u of database.units) {
    if (u.factionName) {
      const fn = u.factionName.trim().toUpperCase();
      if (fn.length >= 2 && (normKw === fn || normKw.includes(fn) || fn.includes(normKw))) {
        return true;
      }
    }
    const uName = (u.Name ?? u.displayName ?? '').trim().toUpperCase();
    if (uName.length >= 2 && (normKw === uName || normKw.includes(uName))) {
      return true;
    }
  }

  return false;
}

export function getUnitAbilityTitles(unit: NormalizedUnit): string[] {
  const titles: string[] = [];
  if (unit.CoreAbilities) {
    for (const ca of unit.CoreAbilities) {
      if (ca && ca.trim()) titles.push(ca.trim());
    }
  }
  if (unit.UnitAbilities) {
    for (const ua of unit.UnitAbilities) {
      if (ua.Title && ua.Title.trim() && !ua.Title.toLowerCase().includes('designer')) {
        titles.push(ua.Title.trim());
      }
    }
  }
  return Array.from(new Set(titles));
}

export function getAbilityDescription(
  title: string,
  currentUnit: NormalizedUnit | null,
  database: NormalizedDatabase,
  isFrench: boolean
): string | null {
  if (!title) return null;
  const normTitle = title.trim().toUpperCase();

  // 1. Check in currentUnit.UnitAbilities
  if (currentUnit?.UnitAbilities) {
    for (const ua of currentUnit.UnitAbilities) {
      if (ua.Title && ua.Title.trim().toUpperCase() === normTitle && ua.Text) {
        return ua.Text.trim();
      }
    }
  }

  // 2. Check in database.units for matching unit ability title
  for (const u of database.units) {
    if (u.UnitAbilities) {
      for (const ua of u.UnitAbilities) {
        if (ua.Title && ua.Title.trim().toUpperCase() === normTitle && ua.Text) {
          return ua.Text.trim();
        }
      }
    }
  }

  // 3. Check in currentUnit.Infos
  if (currentUnit?.Infos) {
    for (const info of currentUnit.Infos) {
      if (info.Title && info.Title.trim().toUpperCase() === normTitle && info.Text) {
        return info.Text.trim();
      }
    }
  }

  // 4. Fallback core abilities definitions
  if (normTitle.startsWith('FEEL NO PAIN')) {
    return isFrench
      ? 'Insensible à la douleur X+ : Lorsqu’une figurine subit des dégâts, jetez un D6 pour chaque PV perdu. Sur X+, ce PV n’est pas perdu.'
      : 'Feel No Pain X+: Each time a model with this ability loses a wound, roll a D6. On an X+, that wound is not lost.';
  }
  if (normTitle.startsWith('DEADLY DEMISE')) {
    return isFrench
      ? 'Mort Mortelle X : Lorsque cette figurine est détruite, jetez un D6. Sur un 6, chaque unité à 6" subit X blessures mortelles.'
      : 'Deadly Demise X: When this model is destroyed, roll one D6. On a 6, each unit within 6" suffers X mortal wounds.';
  }
  if (normTitle.startsWith('SCOUTS')) {
    return isFrench
      ? 'Éclaireurs X" : Cette unité peut effectuer un mouvement normal de X" maximum avant le premier tour.'
      : 'Scouts X": This unit can make a Normal move of up to X" before the first turn begins.';
  }
  if (normTitle.startsWith('FIRING DECK')) {
    return isFrench
      ? 'Poste de tir X : Jusqu’à X figurines embarquées dans ce Transport peuvent effectuer des attaques à distance.'
      : 'Firing Deck X: Up to X models embarked inside this Transport can shoot ranged weapons.';
  }
  if (normTitle === 'DEEP STRIKE') {
    return isFrench
      ? 'Frappe en Profondeur : Cette unité peut être placée en Réserve Stratégique et arriver à plus de 9" des figurines ennemies.'
      : 'Deep Strike: This unit can be set up in Reserves and arrive anywhere more than 9" away from enemy models.';
  }
  if (normTitle === 'INFILTRATORS') {
    return isFrench
      ? 'Infiltrateurs : Cette unité peut être déployée n’importe où sur le champ de bataille à plus de 9" de la zone de déploiement et des figurines ennemies.'
      : 'Infiltrators: This unit can be set up anywhere on the battlefield more than 9" from the enemy deployment zone and models.';
  }
  if (normTitle === 'LEADER') {
    return isFrench
      ? 'Meneur : Ce personnage peut être rattaché à une unité d’Escorte éligible au début de la bataille.'
      : 'Leader: This character model can be attached to an eligible Bodyguard unit at the start of the battle.';
  }
  if (normTitle === 'STEALTH') {
    return isFrench
      ? 'Discrétion : Soustrayez 1 aux jets de touche des attaques à distance qui ciblent cette unité.'
      : 'Stealth: Subtract 1 from Hit rolls for ranged attacks targeting this unit.';
  }
  if (normTitle === 'LONE OPERATIVE') {
    return isFrench
      ? 'Agent Solitaire : Ne peut pas être ciblé par des attaques à distance à moins que le tireur ne soit à 12" ou moins.'
      : 'Lone Operative: Cannot be targeted by ranged attacks unless the attacking model is within 12".';
  }
  if (normTitle === 'FIGHTS FIRST') {
    return isFrench
      ? 'Frappe en Premier : Cette unité combat au début de la phase de Combat, avant les unités normales.'
      : 'Fights First: This unit fights at the start of the Fight phase, before normal units.';
  }
  if (normTitle === 'HOVER') {
    return isFrench
      ? 'Statique : Cet aéronef peut choisir le mode Statique au début du round de bataille (Mouvement 20", perd le mot-clé Aéronef).'
      : 'Hover: This Aircraft can choose Hover mode at the start of the battle round (Move 20", loses Aircraft keyword).';
  }

  return null;
}

export const STAT_KEYS = [
  { key: 'Movement', label: 'M', nameFr: 'Mouvement', nameEn: 'Movement' },
  { key: 'Toughness', label: 'E', nameFr: 'Endurance', nameEn: 'Toughness' },
  { key: 'Save', label: 'Svg', nameFr: 'Sauvegarde', nameEn: 'Save' },
  { key: 'Wounds', label: 'PV', nameFr: 'Points de vie', nameEn: 'Wounds' },
  { key: 'Leadership', label: 'Cd', nameFr: 'Commandement', nameEn: 'Leadership' },
  { key: 'OC', label: 'OC', nameFr: 'Contrôle d’objectif', nameEn: 'Objective Control' }
] as const;

export const SCENARIO_OPTIONS = [
  { id: 'TAKE AND HOLD', fr: 'Prise de position', en: 'Take and Hold' },
  { id: 'PRIORITY ASSETS', fr: 'Objectifs prioritaires', en: 'Priority Assets' },
  { id: 'DISRUPTION', fr: 'Perturbation', en: 'Disruption' },
  { id: 'REPOSITION', fr: 'Repositionnement', en: 'Reposition' },
  { id: 'RECONNAISSANCE', fr: 'Reconnaissance', en: 'Reconnaissance' }
];

export function generateWeaponStatOptions(statKey: string, correctVal: string): string[] {
  const norm = correctVal.trim();
  const optionsSet = new Set<string>();
  optionsSet.add(norm);

  if (statKey === 'Range') {
    if (norm === 'Melee') {
      optionsSet.add('12"');
      optionsSet.add('18"');
      optionsSet.add('24"');
    } else {
      const num = parseInt(norm);
      if (!isNaN(num)) {
        [num - 6, num - 3, num + 6, num + 12].forEach((v) => {
          if (v > 0) optionsSet.add(`${v}"`);
        });
      }
      optionsSet.add('Melee');
      ['12"', '18"', '24"', '36"', '48"'].forEach((s) => optionsSet.add(s));
    }
  } else if (statKey === 'Attacks' || statKey === 'Damage') {
    const num = parseInt(norm);
    if (!isNaN(num)) {
      [num - 2, num - 1, num + 1, num + 2].forEach((v) => {
        if (v > 0 || norm === '0') optionsSet.add(String(v));
      });
    }
    const dStr = norm.toUpperCase();
    if (dStr.includes('D')) {
      optionsSet.add('D3');
      optionsSet.add('D6');
      optionsSet.add('D6+1');
      optionsSet.add('D6+3');
    }
    ['1', '2', '3', '4', '6', 'D3', 'D6'].forEach((s) => optionsSet.add(s));
  } else if (statKey === 'ToHit') {
    if (norm === 'N/A') {
      optionsSet.add('2+');
      optionsSet.add('3+');
      optionsSet.add('4+');
    } else {
      const num = parseInt(norm);
      if (!isNaN(num)) {
        [num - 1, num + 1, num + 2].forEach((v) => {
          if (v >= 2 && v <= 6) optionsSet.add(`${v}+`);
        });
      }
      ['2+', '3+', '4+', '5+', '6+', 'N/A'].forEach((s) => optionsSet.add(s));
    }
  } else if (statKey === 'Strength') {
    const num = parseInt(norm);
    if (!isNaN(num)) {
      [num - 2, num - 1, num + 1, num + 2].forEach((v) => {
        if (v > 0) optionsSet.add(String(v));
      });
    }
    ['3', '4', '5', '6', '8', '9', '10', '12', '14'].forEach((s) => optionsSet.add(s));
  } else if (statKey === 'AP') {
    const num = parseInt(norm);
    if (!isNaN(num)) {
      [num - 1, num + 1].forEach((v) => {
        if (v <= 0 && v >= -5) optionsSet.add(String(v));
      });
    }
    ['0', '-1', '-2', '-3', '-4'].forEach((s) => optionsSet.add(s));
  } else if (statKey === 'Keywords') {
    if (norm === '-' || norm === '') {
      ['-', 'ASSAULT', 'HEAVY', 'IGNORES COVER', 'BLAST', 'TWIN-LINKED', 'LETHAL HITS'].forEach(s => optionsSet.add(s));
    } else {
      const kw = norm.split(',').map(s => s.trim().toUpperCase());
      const allPossible = ['ASSAULT', 'HEAVY', 'IGNORES COVER', 'BLAST', 'LETHAL HITS', 'TWIN-LINKED', 'SUSTAINED HITS 1', 'DEVASTATING WOUNDS', 'PRECISION', 'MELTA 2'];
      allPossible.forEach(s => {
        if (!kw.includes(s)) {
          // add some variants, maybe mixing one of the keywords
          if (kw.length === 1) {
             optionsSet.add(s);
             optionsSet.add(kw[0] + ', ' + s);
          } else {
             optionsSet.add(s);
          }
        }
      });
      optionsSet.add('-');
    }
  }

  const pool = Array.from(optionsSet);
  const distractors = pool.filter((o) => o !== norm);
  distractors.sort(() => Math.random() - 0.5);
  const selectedOptions = [norm, ...distractors.slice(0, 3)];
  
  selectedOptions.sort((a, b) => {
    // Custom sort logic to keep it nice like generateStatOptions
    if (a === 'Melee' || a === 'N/A') return 1;
    if (b === 'Melee' || b === 'N/A') return -1;
    
    // Sort by number first
    const na = parseInt(a);
    const nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb)) {
      if (na !== nb) return na - nb;
    }
    
    // Then string comparison
    return a.localeCompare(b);
  });
  
  return selectedOptions;
}
