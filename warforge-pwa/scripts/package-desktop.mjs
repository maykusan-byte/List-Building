import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const projectRoot = process.cwd();
const stagingDirectory = await mkdtemp(join(tmpdir(), 'warforge-desktop-'));
const releaseDirectory = resolve(projectRoot, 'release');
const builderCli = resolve(
  projectRoot,
  'node_modules',
  'electron-builder',
  'cli.js'
);

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit'
    });

    child.once('error', rejectPromise);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`electron-builder a terminé avec le code ${code ?? 'inconnu'}.`));
    });
  });
}

try {
  await run(process.execPath, [builderCli, '--win', 'nsis', `--config.directories.output=${stagingDirectory}`]);

  const artifacts = await readdir(stagingDirectory, { withFileTypes: true });
  const installer = artifacts.find((artifact) => artifact.isFile()
    && artifact.name.startsWith('Warforge 40k Setup ')
    && artifact.name.endsWith('.exe')
    && !artifact.name.includes('.__'));

  if (!installer) throw new Error('L’installeur Windows n’a pas été généré.');

  await mkdir(releaseDirectory, { recursive: true });
  const installerPath = join(releaseDirectory, installer.name);
  await copyFile(join(stagingDirectory, installer.name), installerPath);

  const blockMapName = `${installer.name}.blockmap`;
  if (artifacts.some((artifact) => artifact.isFile() && artifact.name === blockMapName)) {
    await copyFile(join(stagingDirectory, blockMapName), join(releaseDirectory, blockMapName));
  }

  console.log(`Installeur Windows prêt : ${installerPath}`);
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}
