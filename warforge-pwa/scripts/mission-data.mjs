import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

export const MISSION_CATALOG_SCHEMA = 'warforge-mission-packs/v1';
const projectRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(projectRoot, '..');
const sourcePath = resolve(projectRoot, 'data/missions/mission-packs.json');

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringList(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

function sourceIsInsideWorkspace(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) return false;
  const resolved = resolve(workspaceRoot, relativePath);
  const pathFromWorkspace = relative(workspaceRoot, resolved);
  return pathFromWorkspace && !pathFromWorkspace.startsWith(`..${sep}`) && pathFromWorkspace !== '..';
}

export function validateMissionCatalog(value) {
  const errors = [];
  if (!isRecord(value)) return ['Le catalogue de missions doit être un objet JSON.'];
  if (value.schemaVersion !== MISSION_CATALOG_SCHEMA) errors.push(`schemaVersion doit être ${MISSION_CATALOG_SCHEMA}.`);
  if (typeof value.activePackId !== 'string' || !value.activePackId.trim()) errors.push('activePackId est requis.');
  if (!Array.isArray(value.packs) || value.packs.length === 0) return [...errors, 'Au moins un pack de mission est requis.'];

  const identifiers = new Set();
  value.packs.forEach((pack, index) => {
    const prefix = `packs[${index}]`;
    if (!isRecord(pack)) {
      errors.push(`${prefix} doit être un objet.`);
      return;
    }
    if (typeof pack.id !== 'string' || !pack.id.trim()) errors.push(`${prefix}.id est requis.`);
    else if (identifiers.has(pack.id)) errors.push(`${prefix}.id est dupliqué.`);
    else identifiers.add(pack.id);
    if (typeof pack.title !== 'string' || !pack.title.trim()) errors.push(`${prefix}.title est requis.`);
    if (pack.language !== 'fr' && pack.language !== 'en') errors.push(`${prefix}.language doit être fr ou en.`);
    if (pack.status !== 'summary-only' && pack.status !== 'verified-cards') errors.push(`${prefix}.status est invalide.`);
    if (!isRecord(pack.source)) errors.push(`${prefix}.source est requis.`);
    else {
      if (pack.source.kind !== 'official-pdf') errors.push(`${prefix}.source.kind doit être official-pdf.`);
      if (!sourceIsInsideWorkspace(pack.source.relativePath)) errors.push(`${prefix}.source.relativePath doit cibler un fichier du dépôt.`);
      if (!/^[a-f0-9]{64}$/i.test(String(pack.source.sha256 ?? ''))) errors.push(`${prefix}.source.sha256 doit être un SHA-256.`);
      if (!/^\d{4}-\d{2}-\d{2}T/.test(String(pack.source.createdAt ?? ''))) errors.push(`${prefix}.source.createdAt doit être une date ISO.`);
      if (!Number.isInteger(pack.source.pageCount) || pack.source.pageCount < 1) errors.push(`${prefix}.source.pageCount doit être positif.`);
    }
    if (!isRecord(pack.summary) || !isStringList(pack.summary.primary) || !isStringList(pack.summary.secondary)) {
      errors.push(`${prefix}.summary doit contenir les listes primary et secondary.`);
    }
    if (typeof pack.unavailableNotice !== 'string' || !pack.unavailableNotice.trim()) errors.push(`${prefix}.unavailableNotice est requis.`);
    const hasCards = isRecord(pack.cards) && (Array.isArray(pack.cards.primary) || Array.isArray(pack.cards.secondary));
    if (pack.status === 'summary-only' && hasCards) errors.push(`${prefix} ne peut pas contenir de cartes tant que son statut est summary-only.`);
    if (pack.status === 'verified-cards' && !hasCards) errors.push(`${prefix} doit contenir des cartes vérifiées.`);
  });
  if (!identifiers.has(value.activePackId)) errors.push('activePackId doit correspondre à un pack existant.');
  return errors;
}

async function validateSourceFile(pack) {
  const relativePath = pack.source.relativePath;
  if (!sourceIsInsideWorkspace(relativePath)) return [`La source de ${pack.id} est hors du dépôt.`];
  const absolutePath = resolve(workspaceRoot, relativePath);
  try {
    await access(absolutePath);
    const hash = createHash('sha256').update(await readFile(absolutePath)).digest('hex');
    return hash === pack.source.sha256.toLowerCase() ? [] : [`Le SHA-256 de la source ${relativePath} ne correspond pas au catalogue.`];
  } catch {
    return [`La source ${relativePath} est introuvable.`];
  }
}

export async function loadValidatedMissionCatalog() {
  const raw = await readFile(sourcePath, 'utf8');
  const value = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const errors = validateMissionCatalog(value);
  if (errors.length) throw new Error(`Catalogue de missions invalide : ${errors.join(' ')}`);
  const sourceErrors = (await Promise.all(value.packs.map(validateSourceFile))).flat();
  if (sourceErrors.length) throw new Error(`Sources de missions invalides : ${sourceErrors.join(' ')}`);
  return value;
}

if (process.argv.includes('--check')) {
  const catalog = await loadValidatedMissionCatalog();
  console.log(`Missions validées : ${catalog.packs.length} pack(s), pack actif ${catalog.activePackId}.`);
}
