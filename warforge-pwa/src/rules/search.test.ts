import { describe, expect, it } from 'vitest';
import { normalizeRulesSearch, rulesSectionById, searchRules } from './search';
import type { RulesDocument } from './types';

const document: RulesDocument = {
  schemaVersion: 'warforge-rules/v1',
  title: 'Règles de base',
  source: { title: 'Source', language: 'fr', filename: 'source.pdf', pdfPageCount: 1, modifiedAt: '2026-06-05', version: null },
  missionFramework: { packName: 'Pack', language: 'fr', status: 'public-summary', sources: [], primary: [], secondary: [], unavailableNotice: '' },
  chapters: [{
    id: 'objectifs', title: 'Objectifs', sourcePages: [52, 53], sections: [{
      id: 'controle', reference: '14.02', title: 'Niveau de contrôle', sourcePages: [52, 53], pages: [{
        id: 'p-52', printedPage: 52, blocks: [{ kind: 'text', text: 'Une unité ébranlée ne contrôle pas l’objectif.' }]
      }]
    }]
  }]
};

describe('rules search', () => {
  it('normalises accents and punctuation', () => {
    expect(normalizeRulesSearch('Ébranlée, l’objectif !')).toBe('ebranlee l objectif');
  });

  it('finds content independently of accents', () => {
    const results = searchRules(document, 'ebranlee objectif');
    expect(results).toHaveLength(1);
    expect(results[0].section.id).toBe('controle');
  });

  it('resolves stable section links', () => {
    expect(rulesSectionById(document, 'controle')?.reference).toBe('14.02');
    expect(rulesSectionById(document, 'missing')).toBeNull();
  });
});
