import type { RulesDocument, RulesPage, RulesSection } from './types';

export interface RulesSearchResult {
  chapterTitle: string;
  section: RulesSection;
  page: RulesPage;
  snippet: string;
}

export function normalizeRulesSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function pageText(page: RulesPage): string {
  return page.blocks.map((block) => {
    if (block.kind === 'table') return [block.title ?? '', ...block.columns, ...block.rows.flat()].join(' ');
    if (block.kind === 'diagram') return [block.title, block.description, ...(block.labels ?? [])].join(' ');
    return block.kind === 'callout' ? `${block.title} ${block.text}` : block.text;
  }).join('\n');
}

function makeSnippet(text: string, query: string): string {
  const normalizedText = normalizeRulesSearch(text);
  const matchIndex = normalizedText.indexOf(query);
  if (matchIndex < 0) return text.slice(0, 190).trim();

  const words = text.split(/\s+/);
  let running = '';
  let wordIndex = 0;
  while (wordIndex < words.length && normalizeRulesSearch(`${running} ${words[wordIndex]}`).length < matchIndex) {
    running += ` ${words[wordIndex]}`;
    wordIndex += 1;
  }
  const start = Math.max(0, wordIndex - 12);
  return `${start > 0 ? '… ' : ''}${words.slice(start, wordIndex + 25).join(' ')}${wordIndex + 25 < words.length ? ' …' : ''}`;
}

export function searchRules(document: RulesDocument, input: string): RulesSearchResult[] {
  const query = normalizeRulesSearch(input);
  if (!query) return [];

  const results: RulesSearchResult[] = [];
  document.chapters.forEach((chapter) => {
    chapter.sections.forEach((section) => {
      section.pages.forEach((page) => {
        const text = pageText(page);
        const corpus = `${chapter.title} ${section.reference ?? ''} ${section.title} ${text}`;
        const normalizedCorpus = normalizeRulesSearch(corpus);
        if (!query.split(' ').every((term) => normalizedCorpus.includes(term))) return;
        results.push({ chapterTitle: chapter.title, section, page, snippet: makeSnippet(text, query.split(' ')[0]) });
      });
    });
  });
  return results;
}

export function rulesSectionById(document: RulesDocument, id: string | null): RulesSection | null {
  if (!id) return null;
  for (const chapter of document.chapters) {
    const section = chapter.sections.find((candidate) => candidate.id === id);
    if (section) return section;
  }
  return null;
}
