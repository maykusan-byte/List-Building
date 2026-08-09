import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = process.cwd();
const source = resolve(projectRoot, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const releaseDirectory = resolve(projectRoot, 'release');
const version = process.env.npm_package_version ?? 'test';
const target = resolve(releaseDirectory, `Warforge 40K ${version} Android-test.apk`);

await mkdir(releaseDirectory, { recursive: true });
await copyFile(source, target);
console.log(`APK Android de test prêt : ${target}`);
