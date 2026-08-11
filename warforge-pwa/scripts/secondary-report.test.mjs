import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderSecondaryMissionReport } from './secondary-report.mjs';

const projectRoot = resolve(import.meta.dirname, '..');

describe('secondary mission report generator', () => {
  it('renders the versioned report deterministically with every archived title once', async () => {
    const knowledge = JSON.parse(await readFile(resolve(projectRoot, 'data/strategy/knowledge-base.json'), 'utf8'));
    const archive = JSON.parse(await readFile(resolve(projectRoot, 'data/missions/gdmissions-11th/archive.json'), 'utf8'));
    const actual = await readFile(resolve(projectRoot, 'docs/ANALYSE_MISSIONS_SECONDAIRES_GDM_2026.md'), 'utf8');
    const rendered = renderSecondaryMissionReport(knowledge);
    const titles = [...rendered.matchAll(/^### (.+)$/gm)].map((match) => match[1]);

    expect(rendered).toBe(actual);
    expect(titles).toHaveLength(18);
    for (const card of archive.cards.secondary) expect(titles.filter((title) => title === card.name)).toHaveLength(1);
  });
});
