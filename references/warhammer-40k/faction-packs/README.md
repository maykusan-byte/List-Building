import fs from 'fs';
import path from 'path';

const baseDir = path.join(process.cwd(), 'references/warhammer-40k/faction-packs');
if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir, { recursive: true });
}

console.log('Faction packs directory ready:', baseDir);
