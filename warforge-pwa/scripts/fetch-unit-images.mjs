import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const seedPath = resolve(projectRoot, 'data/unit-image-seeds.json');
const sourceDirectory = resolve(projectRoot, 'data/unit-image-sources');
const write = process.argv.includes('--write');

const seeds = JSON.parse(await readFile(seedPath, 'utf8'));
const downloads = seeds.entries.filter((seed) => typeof seed.sourceImageUrl === 'string' && seed.sourceImageUrl.length > 0);

if (!write) {
  console.log(`${downloads.length} source(s) externe(s) prête(s) à télécharger. Lancez avec --write pour les enregistrer.`);
  process.exit(0);
}

await mkdir(sourceDirectory, { recursive: true });
let downloaded = 0;
let preserved = 0;
for (const seed of downloads) {
  const target = resolve(sourceDirectory, seed.sourceAsset);
  const targetRelativePath = relative(sourceDirectory, target);
  if (!targetRelativePath || targetRelativePath === '..' || targetRelativePath.startsWith(`..${sep}`) || isAbsolute(targetRelativePath)) {
    throw new Error(`Nom de fichier non sûr : ${seed.sourceAsset}`);
  }
  try {
    await access(target);
    preserved += 1;
    continue;
  } catch {
    // La source n'est pas encore présente localement.
  }
  const response = await fetch(seed.sourceImageUrl);
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}) : ${seed.sourceImageUrl}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) throw new Error(`Type de média inattendu (${contentType}) : ${seed.sourceImageUrl}`);
  await writeFile(target, new Uint8Array(await response.arrayBuffer()));
  downloaded += 1;
}

console.log(`${downloaded} source(s) téléchargée(s), ${preserved} déjà présente(s).`);
