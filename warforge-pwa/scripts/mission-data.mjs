import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

export const MISSION_CATALOG_SCHEMA = 'warforge-mission-packs/v1';
export const GDMISSIONS_ARCHIVE_SCHEMA = 'warforge-gdmissions-11th/v1';
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

function missionSourcePath(relativePath) {
  return resolve(workspaceRoot, relativePath);
}

function isTrustedWebSource(source) {
  return isRecord(source) && source.kind === 'trusted-web';
}

export function validateGdMissionsArchive(value) {
  const errors = [];
  if (!isRecord(value)) return ['L’archive GDM doit être un objet JSON.'];
  if (value.schemaVersion !== GDMISSIONS_ARCHIVE_SCHEMA) errors.push(`schemaVersion doit être ${GDMISSIONS_ARCHIVE_SCHEMA}.`);
  if (!isRecord(value.source) || value.source.baseUrl !== 'https://gdmissions.app/11th') errors.push('La source GDM doit cibler https://gdmissions.app/11th.');
  if (!isRecord(value.source) || !/^\d{4}-\d{2}-\d{2}T/.test(String(value.source.retrievedAt ?? ''))) errors.push('La date de récupération GDM est requise.');
  if (!Array.isArray(value.pages) || value.pages.length === 0) errors.push('L’archive GDM doit contenir des pages.');
  else {
    value.pages.forEach((page, index) => {
      if (!isRecord(page) || typeof page.path !== 'string' || !page.path.startsWith('/11th') || typeof page.url !== 'string' || !page.url.startsWith('https://gdmissions.app/11th') || typeof page.content !== 'string' || !page.content || !/^[a-f0-9]{64}$/i.test(String(page.sha256 ?? ''))) {
        errors.push(`pages[${index}] est invalide.`);
      }
    });
  }
  if (!Array.isArray(value.assets)) errors.push('L’archive GDM doit lister ses ressources.');
  else {
    value.assets.forEach((asset, index) => {
      if (!isRecord(asset) || typeof asset.sourcePath !== 'string' || !asset.sourcePath.startsWith('/assets/11th/') || typeof asset.relativePath !== 'string' || !asset.relativePath.startsWith('assets/') || !/^[a-f0-9]{64}$/i.test(String(asset.sha256 ?? ''))) {
        errors.push(`assets[${index}] est invalide.`);
      }
    });
  }
  if (!isRecord(value.cards) || !Array.isArray(value.cards.primary) || !Array.isArray(value.cards.secondary) || !Array.isArray(value.cards.layouts) || !Array.isArray(value.cards.forceDispositions)) {
    errors.push('L’archive GDM doit contenir les cartes, layouts et dispositions.');
  } else {
    if (value.cards.primary.length === 0 || value.cards.secondary.length === 0 || value.cards.layouts.length === 0 || value.cards.forceDispositions.length === 0) errors.push('Les ressources GDM de mission sont incomplètes.');
    value.cards.primary.forEach((card, index) => {
      if (!isRecord(card) || typeof card.name !== 'string' || typeof card.deck !== 'string' || !Array.isArray(card.sections) || typeof card.sourcePath !== 'string') errors.push(`cards.primary[${index}] est invalide.`);
    });
    value.cards.secondary.forEach((card, index) => {
      if (!isRecord(card) || typeof card.name !== 'string' || !Array.isArray(card.sections) || typeof card.sourcePath !== 'string') errors.push(`cards.secondary[${index}] est invalide.`);
    });
  }
  return errors;
}

async function loadGdMissionsArchive(relativePath) {
  if (!sourceIsInsideWorkspace(relativePath)) throw new Error('L’archive GDM est hors du dépôt.');
  const raw = await readFile(missionSourcePath(relativePath), 'utf8');
  const value = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const errors = validateGdMissionsArchive(value);
  if (errors.length) throw new Error(`Archive GDM invalide : ${errors.join(' ')}`);
  return value;
}

async function validateGdMissionsAssets(relativePath, archive) {
  const archiveRoot = dirname(missionSourcePath(relativePath));
  const errors = [];
  for (const asset of archive.assets) {
    const absolutePath = resolve(archiveRoot, asset.relativePath);
    const fromArchive = relative(archiveRoot, absolutePath);
    if (!fromArchive || fromArchive.startsWith(`..${sep}`) || fromArchive === '..') {
      errors.push(`La ressource GDM ${asset.relativePath} est hors de l’archive.`);
      continue;
    }
    try {
      const hash = createHash('sha256').update(await readFile(absolutePath)).digest('hex');
      if (hash !== asset.sha256.toLowerCase()) errors.push(`Le SHA-256 de la ressource GDM ${asset.relativePath} ne correspond pas à l’archive.`);
    } catch {
      errors.push(`La ressource GDM ${asset.relativePath} est introuvable.`);
    }
  }
  return errors;
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
    if (pack.status !== 'summary-only' && pack.status !== 'verified-cards' && pack.status !== 'trusted-web-cards') errors.push(`${prefix}.status est invalide.`);
    if (!isRecord(pack.source)) errors.push(`${prefix}.source est requis.`);
    else {
      if (pack.source.kind === 'official-pdf') {
        if (!sourceIsInsideWorkspace(pack.source.relativePath)) errors.push(`${prefix}.source.relativePath doit cibler un fichier du dépôt.`);
        if (!/^[a-f0-9]{64}$/i.test(String(pack.source.sha256 ?? ''))) errors.push(`${prefix}.source.sha256 doit être un SHA-256.`);
        if (!/^\d{4}-\d{2}-\d{2}T/.test(String(pack.source.createdAt ?? ''))) errors.push(`${prefix}.source.createdAt doit être une date ISO.`);
        if (!Number.isInteger(pack.source.pageCount) || pack.source.pageCount < 1) errors.push(`${prefix}.source.pageCount doit être positif.`);
      } else if (isTrustedWebSource(pack.source)) {
        if (pack.source.url !== 'https://gdmissions.app/11th') errors.push(`${prefix}.source.url doit cibler GDM 11th.`);
        if (!sourceIsInsideWorkspace(pack.source.archivePath)) errors.push(`${prefix}.source.archivePath doit cibler une archive du dépôt.`);
      } else {
        errors.push(`${prefix}.source.kind est invalide.`);
      }
    }
    if (!isRecord(pack.summary) || !isStringList(pack.summary.primary) || !isStringList(pack.summary.secondary)) {
      errors.push(`${prefix}.summary doit contenir les listes primary et secondary.`);
    }
    if (typeof pack.unavailableNotice !== 'string' || !pack.unavailableNotice.trim()) errors.push(`${prefix}.unavailableNotice est requis.`);
    const hasCards = isRecord(pack.cards) && (Array.isArray(pack.cards.primary) || Array.isArray(pack.cards.secondary));
    if (pack.status === 'summary-only' && hasCards) errors.push(`${prefix} ne peut pas contenir de cartes tant que son statut est summary-only.`);
    if (pack.status === 'verified-cards' && !hasCards) errors.push(`${prefix} doit contenir des cartes vérifiées.`);
    if (pack.status === 'trusted-web-cards' && !isTrustedWebSource(pack.source)) errors.push(`${prefix} doit utiliser une archive web approuvée.`);
  });
  if (!identifiers.has(value.activePackId)) errors.push('activePackId doit correspondre à un pack existant.');
  return errors;
}

async function validateSourceFile(pack) {
  if (isTrustedWebSource(pack.source)) {
    try {
      const archive = await loadGdMissionsArchive(pack.source.archivePath);
      return validateGdMissionsAssets(pack.source.archivePath, archive);
    } catch (error) {
      return [error instanceof Error ? error.message : `L’archive GDM de ${pack.id} est introuvable.`];
    }
  }
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
  const packs = await Promise.all(value.packs.map(async (pack) => {
    if (!isTrustedWebSource(pack.source)) return pack;
    const archive = await loadGdMissionsArchive(pack.source.archivePath);
    return {
      ...pack,
      source: {
        ...pack.source,
        title: archive.source.title,
        retrievedAt: archive.source.retrievedAt,
        pageCount: archive.pages.length,
        assetCount: archive.assets.length
      },
      cards: archive.cards
    };
  }));
  return { ...value, packs };
}

if (process.argv.includes('--check')) {
  const catalog = await loadValidatedMissionCatalog();
  console.log(`Missions validées : ${catalog.packs.length} pack(s), pack actif ${catalog.activePackId}.`);
}
