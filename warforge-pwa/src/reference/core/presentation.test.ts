import { describe, expect, it } from 'vitest';
import { coreRuleContexts, sectionsForRuleContext } from './presentation';
import type { RulesDocument } from './types';

const document: RulesDocument = {
  schemaVersion: 'warforge-rules/v1',
  title: 'Règles de base',
  source: { title: 'Source', language: 'fr', filename: 'source.pdf', pdfPageCount: 1, modifiedAt: '2026-06-05', version: null },
  missionFramework: { packName: 'Pack', language: 'fr', status: 'public-summary', sources: [], primary: [], secondary: [], unavailableNotice: '' },
  chapters: [{
    id: 'round', title: 'Round', sourcePages: [1, 2], sections: [
      { id: 'round-de-bataille', title: 'Le round de bataille', sourcePages: [1, 1], pages: [] },
      { id: 'objectifs', title: 'Objectifs', sourcePages: [2, 2], pages: [] },
      { id: 'stratagemes', title: 'Stratagèmes', sourcePages: [2, 2], pages: [] }
    ]
  }]
};

describe('rule presentation contexts', () => {
  it('keeps the battle round references in their intended order', () => {
    const round = coreRuleContexts.find((context) => context.id === 'round');
    expect(round).toBeDefined();
    expect(sectionsForRuleContext(document, round!).primary.map((section) => section.id)).toEqual(['round-de-bataille']);
    expect(sectionsForRuleContext(document, round!).supporting.map((section) => section.id)).toEqual(['objectifs', 'stratagemes']);
  });

  it('does not render a reference twice when it is in both groups', () => {
    const context = { ...coreRuleContexts[1], supportingSectionIds: ['round-de-bataille', 'objectifs'] };
    const groups = sectionsForRuleContext(document, context);
    expect(groups.primary.map((section) => section.id)).toEqual(['round-de-bataille']);
    expect(groups.supporting.map((section) => section.id)).toEqual(['objectifs']);
  });
});
