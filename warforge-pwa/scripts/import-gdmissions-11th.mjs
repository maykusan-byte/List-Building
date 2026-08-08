import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(projectRoot, 'data/missions/gdmissions-11th');
const stagingRoot = resolve(projectRoot, 'data/missions/.gdmissions-11th-staging');
const backupRoot = resolve(projectRoot, 'data/missions/.gdmissions-11th-backup');
const siteUrl = 'https://gdmissions.app';
const sitemapUrl = `${siteUrl}/sitemap.xml`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeAssetPath(pathname, targetAssetRoot) {
  if (!pathname.startsWith('/assets/11th/')) return null;
  const absolute = resolve(targetAssetRoot, pathname.slice('/assets/11th/'.length));
  const fromRoot = relative(targetAssetRoot, absolute);
  if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === '..') return null;
  return absolute;
}

function readBalancedJson(text, marker, fromIndex = 0) {
  const markerIndex = text.indexOf(marker, fromIndex);
  if (markerIndex === -1) return null;
  const start = markerIndex + marker.length;
  const opening = text[start];
  if (opening !== '{' && opening !== '[') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{' || character === '[') depth += 1;
    if (character === '}' || character === ']') depth -= 1;
    if (depth === 0) {
      const raw = text.slice(start, index + 1);
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function extractRscPayload(html) {
  const calls = [...html.matchAll(/self\.__next_f\.push\((.*?)\)<\/script>/gs)];
  return calls
    .map((match) => {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    })
    .filter((value) => Array.isArray(value) && typeof value[1] === 'string')
    .map((value) => value[1])
    .join('');
}

function htmlMetadata(html, name) {
  const expression = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i');
  return html.match(expression)?.[1] ?? null;
}

function titleFromHtml(html) {
  return html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? null;
}

function assetPaths(html, payload) {
  const paths = new Set();
  for (const content of [html, payload]) {
    for (const match of content.matchAll(/\/assets\/11th\/[A-Za-z0-9_./-]+\.(?:png|webp|jpg|jpeg|svg)/g)) {
      paths.add(match[0]);
    }
  }
  return [...paths].sort();
}

function pagePath(url) {
  return new URL(url).pathname;
}

function extractMissionData(payload, path) {
  const primary = readBalancedJson(payload, '"primary":');
  const primaryBack = readBalancedJson(payload, '"primaryBack":');
  const secondary = readBalancedJson(payload, '"secondary":');
  const layouts = readBalancedJson(payload, '"layouts":');
  if (primary && path.includes('/primary-missions/')) return { kind: 'primary', data: { ...primary, back: primaryBack } };
  if (secondary && path.includes('/secondary-missions/')) return { kind: 'secondary', data: secondary };
  if (layouts && path.includes('/layouts/')) return { kind: 'layouts', data: layouts };
  return null;
}

export function parseSitemap(xml) {
  return [...xml.matchAll(/<loc>(https:\/\/gdmissions\.app\/11th(?:\/[^<]+)?)<\/loc>/g)]
    .map((match) => match[1])
    .filter((url) => !url.endsWith('/tracker/play'))
    .sort();
}

async function fetchChecked(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Warforge development importer (+https://gdmissions.app/robots.txt)' } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

async function mapWithConcurrency(values, concurrency, iteratee) {
  const results = new Array(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await iteratee(values[index], index);
    }
  }));
  return results;
}

async function downloadAsset(pathname, targetAssetRoot, targetRoot) {
  const destination = safeAssetPath(pathname, targetAssetRoot);
  if (!destination) throw new Error(`Unsafe GDM asset path: ${pathname}`);
  const response = await fetchChecked(new URL(pathname, siteUrl));
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return {
    sourcePath: pathname,
    relativePath: relative(targetRoot, destination).replaceAll('\\', '/'),
    bytes: bytes.length,
    sha256: sha256(bytes),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream'
  };
}

export async function importGdMissions11th() {
  const sitemap = await (await fetchChecked(sitemapUrl)).text();
  const urls = parseSitemap(sitemap);
  if (urls.length === 0) throw new Error('The GDM sitemap did not expose any 11th edition page.');

  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true });
  const stagingAssetRoot = resolve(stagingRoot, 'assets');

  const pages = await mapWithConcurrency(urls, 4, async (url) => {
    const html = await (await fetchChecked(url)).text();
    const payload = extractRscPayload(html);
    const path = pagePath(url);
    return {
      path,
      url,
      title: titleFromHtml(html),
      description: htmlMetadata(html, 'description'),
      sha256: sha256(html),
      content: payload,
      assets: assetPaths(html, payload),
      missionData: extractMissionData(payload, path)
    };
  });

  const assetPathsToDownload = [...new Set(pages.flatMap((page) => page.assets))].sort();
  const assets = await mapWithConcurrency(assetPathsToDownload, 4, (pathname) => downloadAsset(pathname, stagingAssetRoot, stagingRoot));
  const cards = {
    primary: pages.flatMap((page) => page.missionData?.kind === 'primary' ? [{
      ...page.missionData.data,
      sourcePath: page.path,
      asset: page.assets.find((asset) => asset.endsWith('.png')) ?? null
    }] : []),
    secondary: pages.flatMap((page) => page.missionData?.kind === 'secondary' ? [{
      ...page.missionData.data,
      sourcePath: page.path,
      asset: page.assets.find((asset) => asset.endsWith('.png')) ?? null
    }] : []),
    layouts: pages.flatMap((page) => page.missionData?.kind === 'layouts' ? [{ sourcePath: page.path, layouts: page.missionData.data }] : []),
    forceDispositions: pages
      .filter((page) => /^\/11th\/force-disposition\/[^/]+$/.test(page.path))
      .map((page) => ({
        sourcePath: page.path,
        title: page.title,
        asset: page.assets.find((asset) => asset.endsWith('.png')) ?? null
      })),
    matrix: pages.find((page) => page.path === '/11th/matrix')
      ? { sourcePath: '/11th/matrix' }
      : null
  };
  const retrievedAt = new Date().toISOString();
  const archive = {
    schemaVersion: 'warforge-gdmissions-11th/v1',
    source: {
      title: 'GDM 2026 — 11th Edition',
      baseUrl: `${siteUrl}/11th`,
      sitemapUrl,
      retrievedAt,
      crawlPolicy: `${siteUrl}/robots.txt`
    },
    pages: pages.map(({ missionData, ...page }) => page),
    assets,
    cards
  };
  await writeFile(resolve(stagingRoot, 'archive.json'), `${JSON.stringify(archive, null, 2)}\n`, 'utf8');

  await rm(backupRoot, { recursive: true, force: true });
  let movedExistingArchive = false;
  try {
    await rename(sourceRoot, backupRoot);
    movedExistingArchive = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  try {
    await rename(stagingRoot, sourceRoot);
    if (movedExistingArchive) await rm(backupRoot, { recursive: true, force: true });
  } catch (error) {
    await rm(sourceRoot, { recursive: true, force: true });
    if (movedExistingArchive) await rename(backupRoot, sourceRoot);
    throw error;
  }
  console.log(`GDM V11 import complete: ${pages.length} pages, ${assets.length} assets, ${cards.primary.length} primary cards, ${cards.secondary.length} secondary cards.`);
  return archive;
}

if (process.argv.includes('--run')) await importGdMissions11th();
