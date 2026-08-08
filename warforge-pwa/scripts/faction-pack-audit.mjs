import { createHash } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

export const FACTION_PACK_AUDIT_SCHEMA = 'warforge-faction-pack-audit/v1';

const projectRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(projectRoot, '..');
const manifestPath = resolve(projectRoot, 'data/faction-packs/manifest.json');
const sourceDirectory = resolve(workspaceRoot, 'references/warhammer-40k/faction-packs');
const auditStatuses = new Set(['pending', 'catalog-audited', 'catalog-audited-with-known-gaps']);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isIsoDateTime(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function isPathInside(root, candidate) {
  const fromRoot = relative(root, candidate);
  return Boolean(fromRoot) && fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`);
}

function resolveWorkspacePath(relativePath) {
  return resolve(workspaceRoot, relativePath);
}

function resolveProjectPath(relativePath) {
  return resolve(projectRoot, relativePath);
}

function auditPrefix(index) {
  return `packs[${index}]`;
}

export function validateFactionPackManifest(value) {
  const errors = [];
  if (!isRecord(value)) return ['Le manifeste des packs de faction doit être un objet JSON.'];
  if (value.schemaVersion !== FACTION_PACK_AUDIT_SCHEMA) errors.push(`schemaVersion doit être ${FACTION_PACK_AUDIT_SCHEMA}.`);

  if (!isRecord(value.catalog)) {
    errors.push('catalog est requis.');
  } else {
    if (value.catalog.dataInfoPath !== 'data/units/DataInfo.json') errors.push('catalog.dataInfoPath doit cibler data/units/DataInfo.json.');
    if (typeof value.catalog.version !== 'string' || !value.catalog.version.trim()) errors.push('catalog.version est requis.');
    if (!isIsoDateTime(value.catalog.publishedAt)) errors.push('catalog.publishedAt doit être une date ISO.');
  }

  if (!Array.isArray(value.packs) || value.packs.length === 0) return [...errors, 'Au moins un pack de faction est requis.'];

  const ids = new Set();
  const sourcePaths = new Set();
  value.packs.forEach((pack, index) => {
    const prefix = auditPrefix(index);
    if (!isRecord(pack)) {
      errors.push(`${prefix} doit être un objet.`);
      return;
    }
    if (typeof pack.id !== 'string' || !pack.id.trim()) errors.push(`${prefix}.id est requis.`);
    else if (ids.has(pack.id)) errors.push(`${prefix}.id est dupliqué.`);
    else ids.add(pack.id);
    if (typeof pack.faction !== 'string' || !pack.faction.trim()) errors.push(`${prefix}.faction est requis.`);
    if (typeof pack.catalogFile !== 'string' || !pack.catalogFile.startsWith('data/units/') || !isPathInside(projectRoot, resolveProjectPath(pack.catalogFile))) errors.push(`${prefix}.catalogFile doit cibler une source du catalogue.`);

    if (!isRecord(pack.source)) {
      errors.push(`${prefix}.source est requis.`);
    } else {
      const { relativePath, language, version, effectiveAt, pageCount, sha256 } = pack.source;
      if (typeof relativePath !== 'string' || !relativePath.startsWith('references/warhammer-40k/faction-packs/') || !isPathInside(workspaceRoot, resolveWorkspacePath(relativePath))) errors.push(`${prefix}.source.relativePath doit cibler un PDF de faction du dépôt.`);
      else if (sourcePaths.has(relativePath)) errors.push(`${prefix}.source.relativePath est dupliqué.`);
      else sourcePaths.add(relativePath);
      if (language !== 'fr') errors.push(`${prefix}.source.language doit être fr.`);
      if (typeof version !== 'string' || !/^\d+\.\d+$/.test(version)) errors.push(`${prefix}.source.version est invalide.`);
      if (!isIsoDate(effectiveAt)) errors.push(`${prefix}.source.effectiveAt doit être une date ISO.`);
      if (!Number.isInteger(pageCount) || pageCount < 1) errors.push(`${prefix}.source.pageCount doit être positif.`);
      if (!isSha256(sha256)) errors.push(`${prefix}.source.sha256 doit être un SHA-256.`);
    }

    if (!isRecord(pack.audit)) {
      errors.push(`${prefix}.audit est requis.`);
      return;
    }
    if (!auditStatuses.has(pack.audit.status)) errors.push(`${prefix}.audit.status est invalide.`);
    if (!isIsoDate(pack.audit.auditedAt)) errors.push(`${prefix}.audit.auditedAt doit être une date ISO.`);
    const hasKnownGaps = Array.isArray(pack.audit.knownGaps) && pack.audit.knownGaps.every((gap) => typeof gap === 'string' && gap.trim());
    if (pack.audit.status === 'catalog-audited-with-known-gaps' && (!hasKnownGaps || pack.audit.knownGaps.length === 0)) errors.push(`${prefix}.audit.knownGaps est requis pour un audit avec écarts connus.`);
    if (pack.audit.status !== 'catalog-audited-with-known-gaps' && pack.audit.knownGaps !== undefined) errors.push(`${prefix}.audit.knownGaps n'est autorisé que pour un audit avec écarts connus.`);

    if (isRecord(value.catalog) && isIsoDate(value.catalog.publishedAt?.slice(0, 10)) && isRecord(pack.source) && isIsoDate(pack.source.effectiveAt) && pack.source.effectiveAt > value.catalog.publishedAt.slice(0, 10) && pack.audit.status === 'pending') {
      errors.push(`${prefix} est plus récent que le catalogue et doit être audité avant publication.`);
    }
  });
  return errors;
}

async function fileHash(absolutePath) {
  return createHash('sha256').update(await readFile(absolutePath)).digest('hex');
}

async function validateManifestFiles(manifest) {
  const errors = [];
  const declaredSourcePaths = new Set(manifest.packs.map((pack) => pack.source.relativePath));
  const declaredPdfNames = new Set([...declaredSourcePaths].map((relativePath) => relative(sourceDirectory, resolveWorkspacePath(relativePath))));

  for (const pack of manifest.packs) {
    const sourcePath = resolveWorkspacePath(pack.source.relativePath);
    const catalogPath = resolveProjectPath(pack.catalogFile);
    try {
      await access(sourcePath);
      const actualHash = await fileHash(sourcePath);
      if (actualHash !== pack.source.sha256.toLowerCase()) errors.push(`Le SHA-256 de ${pack.source.relativePath} ne correspond pas au manifeste.`);
    } catch {
      errors.push(`La source ${pack.source.relativePath} est introuvable.`);
    }
    try {
      const catalog = JSON.parse((await readFile(catalogPath, 'utf8')).replace(/^\uFEFF/, ''));
      if (catalog.Name !== pack.faction) errors.push(`La faction déclarée pour ${pack.catalogFile} ne correspond pas à son catalogue.`);
    } catch {
      errors.push(`La source de catalogue ${pack.catalogFile} est introuvable ou invalide.`);
    }
  }

  try {
    const catalogInfoPath = resolveProjectPath(manifest.catalog.dataInfoPath);
    const catalogInfo = JSON.parse((await readFile(catalogInfoPath, 'utf8')).replace(/^\uFEFF/, ''));
    if (catalogInfo.Version !== manifest.catalog.version) errors.push('La version du catalogue ne correspond pas au manifeste des packs de faction.');
    if (catalogInfo.PublishDate !== manifest.catalog.publishedAt) errors.push('La date de publication du catalogue ne correspond pas au manifeste des packs de faction.');
  } catch {
    errors.push('Le fichier DataInfo du catalogue est introuvable ou invalide.');
  }

  try {
    const actualPdfNames = (await readdir(sourceDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
      .map((entry) => entry.name);
    for (const pdfName of actualPdfNames) {
      if (!declaredPdfNames.has(pdfName)) errors.push(`Le PDF de faction ${pdfName} n'est pas suivi par le manifeste.`);
    }
    for (const declaredPdfName of declaredPdfNames) {
      if (!actualPdfNames.includes(declaredPdfName)) errors.push(`Le PDF de faction déclaré ${declaredPdfName} est introuvable.`);
    }
  } catch {
    errors.push('Le dossier des packs de faction est introuvable.');
  }
  return errors;
}

export async function loadValidatedFactionPackManifest() {
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const shapeErrors = validateFactionPackManifest(manifest);
  if (shapeErrors.length) throw new Error(`Manifeste des packs de faction invalide : ${shapeErrors.join(' ')}`);
  const fileErrors = await validateManifestFiles(manifest);
  if (fileErrors.length) throw new Error(`Sources des packs de faction invalides : ${fileErrors.join(' ')}`);
  return manifest;
}

if (process.argv.includes('--check')) {
  const manifest = await loadValidatedFactionPackManifest();
  const knownGaps = manifest.packs.flatMap((pack) => pack.audit.knownGaps ?? []);
  console.log(`Packs de faction validés : ${manifest.packs.length} source(s), ${knownGaps.length} écart(s) connu(s) suivi(s).`);
}
