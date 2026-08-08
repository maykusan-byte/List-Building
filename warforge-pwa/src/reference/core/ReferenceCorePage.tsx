import { useEffect, useMemo, useState } from 'react';
import { coreRuleContexts, sectionsForRuleContext, type RuleReadingContext } from './presentation';
import { rulesSectionById, searchRules } from './search';
import type { RulesBlock, RulesDocument, RulesSection } from './types';

const RULES_URL = `${import.meta.env.BASE_URL}data/rules/core-rules-fr.json`;

type CoreView = 'play' | 'reference';

function sectionIdFromHash(): string | null {
  const match = window.location.hash.match(/^#rules\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function sourcePageLabel(sourcePages: [number, number]): string {
  return sourcePages[0] === sourcePages[1] ? `p. ${sourcePages[0]}` : `p. ${sourcePages[0]}–${sourcePages[1]}`;
}

function goToRule(id: string): void {
  window.location.hash = `rules/${encodeURIComponent(id)}`;
}

function renderBlock(block: RulesBlock, index: number): React.JSX.Element {
  if (block.kind === 'text') return <p className="rules-text" key={index}>{block.text}</p>;
  if (block.kind === 'callout') return <aside className="rules-callout" key={index}><h4>{block.title}</h4><p>{block.text}</p></aside>;
  if (block.kind === 'diagram') {
    return (
      <figure className="rules-diagram" key={index}>
        <div aria-hidden="true" className="rules-diagram-grid">{(block.labels ?? []).map((label) => <span key={label}>{label}</span>)}</div>
        <figcaption><strong>{block.title}</strong><br />{block.description}</figcaption>
      </figure>
    );
  }
  return (
    <section className="rules-table-wrap" key={index}>
      {block.title && <h4>{block.title}</h4>}
      <div><table><thead><tr>{block.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
      <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
    </section>
  );
}

function sectionExcerpt(section: RulesSection): string | null {
  const text = section.pages.flatMap((page) => page.blocks.flatMap((block) => {
    if (block.kind === 'text' || block.kind === 'callout') return [block.text];
    if (block.kind === 'diagram') return [block.description];
    return block.title ? [block.title] : [];
  })).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 430 ? `${text.slice(0, 427).trimEnd()}…` : text;
}

function RuleQuickCard({ section, locale, kind }: { section: RulesSection; locale: 'fr' | 'en'; kind: 'primary' | 'supporting' }): React.JSX.Element {
  const excerpt = sectionExcerpt(section);
  const isFrench = locale === 'fr';
  return (
    <article className={`rules-quick-card ${kind}`}>
      <div className="rules-quick-card-heading">
        <span className="rules-source-chip">{section.reference ?? (isFrench ? 'Règle de base' : 'Core rule')}</span>
        <span className="rules-page-chip">{sourcePageLabel(section.sourcePages)}</span>
      </div>
      <h3>{section.title}</h3>
      {excerpt && <p><span className="rules-excerpt-label">{isFrench ? 'Extrait source' : 'Source excerpt'}</span>{excerpt}</p>}
      <button className="secondary rules-open-reference" type="button" onClick={() => goToRule(section.id)}>
        {isFrench ? 'Lire la règle complète' : 'Read the complete rule'}
      </button>
    </article>
  );
}

function RulesContent({ document, selectedSectionId }: { document: RulesDocument; selectedSectionId: string | null }): React.JSX.Element {
  return (
    <div className="rules-content">
      {document.chapters.map((chapter) => (
        <section className="rules-chapter" key={chapter.id} aria-labelledby={`chapter-${chapter.id}`}>
          <div className="rules-chapter-heading"><span>{sourcePageLabel(chapter.sourcePages)}</span><h2 id={`chapter-${chapter.id}`}>{chapter.title}</h2></div>
          {chapter.sections.map((section) => (
            <article id={`rule-${section.id}`} className={`rules-section ${selectedSectionId === section.id ? 'targeted' : ''}`} key={section.id} tabIndex={-1}>
              <div className="rules-section-heading">
                <div><span>{section.reference ?? 'RÉFÉRENCE'}</span><h3>{section.title}</h3></div>
                <a href={`#rules/${encodeURIComponent(section.id)}`} aria-label={`Lien direct vers ${section.title}`}>#{sourcePageLabel(section.sourcePages)}</a>
              </div>
              {section.pages.map((page) => (
                <section className="rules-page" key={page.id} aria-label={`Page source ${page.printedPage}`}>
                  <span className="rules-page-number">Source p. {page.printedPage}</span>
                  {page.blocks.map(renderBlock)}
                </section>
              ))}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function RulePlaybook({ document, locale }: { document: RulesDocument; locale: 'fr' | 'en' }): React.JSX.Element {
  const [contextId, setContextId] = useState<RuleReadingContext['id']>('round');
  const context = coreRuleContexts.find((candidate) => candidate.id === contextId) ?? coreRuleContexts[1];
  const { primary, supporting } = useMemo(() => sectionsForRuleContext(document, context), [document, context]);
  const isFrench = locale === 'fr';

  return (
    <section id="rules-playbook" className="rules-playbook" role="tabpanel" aria-labelledby="rules-playbook-title">
      <div className="rules-playbook-heading">
        <div>
          <span className="eyebrow">{isFrench ? 'PARTIE EN COURS' : 'DURING THE GAME'}</span>
          <h2 id="rules-playbook-title">{isFrench ? 'Trouver la bonne règle au bon moment' : 'Find the right rule at the right moment'}</h2>
          <p>{isFrench ? 'Choisissez le moment de jeu, puis ouvrez la référence complète si un cas précis se présente.' : 'Choose the moment of play, then open the complete reference for a specific case.'}</p>
        </div>
        <span className="rules-source-note">{isFrench ? 'Chaque carte renvoie au texte source.' : 'Every card links to the source text.'}</span>
      </div>

      <div className="rules-context-rail" role="tablist" aria-label={isFrench ? 'Moment de jeu' : 'Moment of play'}>
        {coreRuleContexts.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={candidate.id === context.id}
            aria-controls="rules-context-panel"
            className={candidate.id === context.id ? 'active' : ''}
            onClick={() => setContextId(candidate.id)}
          >
            {candidate.label[locale]}
          </button>
        ))}
      </div>

      <section id="rules-context-panel" className="rules-context-panel" role="tabpanel" aria-label={context.label[locale]}>
        <div className="rules-context-introduction">
          <span className="rules-source-chip">{context.label[locale]}</span>
          <p>{context.description[locale]}</p>
        </div>
        <div className="rules-quick-grid">
          {primary.map((section) => <RuleQuickCard key={section.id} section={section} locale={locale} kind="primary" />)}
        </div>
        {supporting.length > 0 && (
          <section className="rules-supporting-references" aria-labelledby="rules-supporting-title">
            <div>
              <span className="eyebrow">{isFrench ? 'RENVOIS UTILES' : 'RELATED REFERENCES'}</span>
              <h3 id="rules-supporting-title">{isFrench ? 'À consulter selon la situation' : 'Consult when relevant'}</h3>
            </div>
            <div className="rules-quick-grid supporting">
              {supporting.map((section) => <RuleQuickCard key={section.id} section={section} locale={locale} kind="supporting" />)}
            </div>
          </section>
        )}
      </section>
    </section>
  );
}

export function ReferenceCorePage({ locale }: { locale: 'fr' | 'en' }): React.JSX.Element {
  const [document, setDocument] = useState<RulesDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(() => sectionIdFromHash());
  const [tocOpen, setTocOpen] = useState(false);
  const [view, setView] = useState<CoreView>(() => sectionIdFromHash() ? 'reference' : 'play');
  const isFrench = locale === 'fr';

  useEffect(() => {
    let active = true;
    void fetch(RULES_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error('La référence des règles est indisponible.');
        return response.json() as Promise<RulesDocument>;
      })
      .then((nextDocument) => {
        if (!active || nextDocument.schemaVersion !== 'warforge-rules/v1' || !Array.isArray(nextDocument.chapters)) return;
        setDocument(nextDocument);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'La référence des règles est indisponible.');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onHashChange = (): void => {
      const nextSectionId = sectionIdFromHash();
      setSelectedSectionId(nextSectionId);
      if (nextSectionId) setView('reference');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!document || !selectedSectionId || view !== 'reference') return;
    const target = window.document.getElementById(`rule-${selectedSectionId}`);
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [document, selectedSectionId, view]);

  const results = useMemo(() => document ? searchRules(document, query).slice(0, 30) : [], [document, query]);
  const selectedSection = document ? rulesSectionById(document, selectedSectionId) : null;
  const openSection = (section: RulesSection): void => {
    setTocOpen(false);
    goToRule(section.id);
  };
  const openPlaybook = (): void => {
    setSelectedSectionId(null);
    setView('play');
    if (window.location.hash !== '#reference/core') window.location.hash = 'reference/core';
  };

  return (
    <div className="rules-shell-content">
      {!document && <section className="rules-loading"><h2>{isFrench ? 'Chargement de la référence…' : 'Loading reference…'}</h2>{error && <p className="error-text">{error}</p>}</section>}
      {document && (
        <>
          <section className="rules-core-header">
            <div>
              <span className="eyebrow">{isFrench ? 'RÈGLES DE BASE · SOURCE HORS LIGNE' : 'CORE RULES · OFFLINE SOURCE'}</span>
              <h2>{document.source.title}</h2>
              <p>{document.source.filename} · {document.source.pdfPageCount} {isFrench ? 'pages' : 'pages'} · {isFrench ? 'métadonnée PDF' : 'PDF metadata'} : {document.source.modifiedAt}</p>
            </div>
            <div className="rules-core-controls">
              <div className="rules-view-switch" role="tablist" aria-label={isFrench ? 'Mode de lecture' : 'Reading mode'}>
                <button type="button" role="tab" aria-selected={view === 'play'} aria-controls="rules-playbook" className={view === 'play' ? 'active' : ''} onClick={openPlaybook}>{isFrench ? 'Partie en cours' : 'During the game'}</button>
                <button type="button" role="tab" aria-selected={view === 'reference'} aria-controls="rules-reference" className={view === 'reference' ? 'active' : ''} onClick={() => setView('reference')}>{isFrench ? 'Référence complète' : 'Full reference'}</button>
              </div>
              <label className="rules-search"><span>{isFrench ? 'Rechercher dans les règles' : 'Search rules'}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isFrench ? 'Ex. objectif sécurisé, charge, ébranlé' : 'E.g. objective secured, charge, battle-shocked'} /></label>
            </div>
          </section>

          {query.trim() && <section className="rules-results" aria-live="polite"><h2>{results.length} {isFrench ? `résultat${results.length === 1 ? '' : 's'}` : `result${results.length === 1 ? '' : 's'}`}</h2>{results.length === 0 ? <p>{isFrench ? 'Aucune règle ne correspond à cette recherche.' : 'No rule matches this search.'}</p> : <ul>{results.map((result) => <li key={`${result.section.id}-${result.page.id}`}><button className="secondary" onClick={() => openSection(result.section)}><strong>{result.section.reference} · {result.section.title}</strong><span>{isFrench ? 'p.' : 'p.'} {result.page.printedPage} · {result.snippet}</span></button></li>)}</ul>}</section>}

          {view === 'play' ? <RulePlaybook document={document} locale={locale} /> : (
            <section id="rules-reference" className="rules-reference-view" role="tabpanel" aria-label={isFrench ? 'Référence complète des règles de base' : 'Complete core rules reference'}>
              <div className="rules-reference-view-heading">
                <div><span className="eyebrow">{isFrench ? 'TEXTE STRUCTURÉ' : 'STRUCTURED TEXT'}</span><h2>{isFrench ? 'Référence complète' : 'Complete reference'}</h2><p>{isFrench ? 'Le corpus intégral reste disponible, avec sa pagination source et des liens directs pérennes.' : 'The complete corpus remains available with source pagination and stable direct links.'}</p></div>
                <button className="secondary rules-toc-toggle" type="button" aria-expanded={tocOpen} onClick={() => setTocOpen((open) => !open)}>{isFrench ? 'Sommaire' : 'Contents'}</button>
              </div>
              <div className="rules-layout">
                <aside className={`rules-toc ${tocOpen ? 'open' : ''}`} aria-label={isFrench ? 'Sommaire des règles' : 'Rules contents'}>
                  <div className="rules-toc-heading"><h2>{isFrench ? 'Sommaire' : 'Contents'}</h2><button className="secondary" type="button" onClick={() => setTocOpen(false)}>{isFrench ? 'Fermer' : 'Close'}</button></div>
                  {document.chapters.map((chapter) => <section key={chapter.id}><h3>{chapter.title}</h3><ul>{chapter.sections.map((section) => <li key={section.id}><button className={selectedSection?.id === section.id ? 'active' : ''} onClick={() => openSection(section)}>{section.reference && <span>{section.reference}</span>}{section.title}<small>{sourcePageLabel(section.sourcePages)}</small></button></li>)}</ul></section>)}
                </aside>
                <RulesContent document={document} selectedSectionId={selectedSectionId} />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
