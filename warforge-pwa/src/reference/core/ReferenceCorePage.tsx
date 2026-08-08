import { useEffect, useMemo, useState } from 'react';
import { BrandMark } from '../../components/BrandMark';
import { rulesSectionById, searchRules } from './search';
import type { RulesBlock, RulesDocument, RulesSection } from './types';

const RULES_URL = `${import.meta.env.BASE_URL}data/rules/core-rules-fr.json`;

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
  if (block.kind === 'callout') {
    return <aside className="rules-callout" key={index}><h4>{block.title}</h4><p>{block.text}</p></aside>;
  }
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

function MissionFramework({ document }: { document: RulesDocument }): React.JSX.Element {
  const framework = document.missionFramework;
  return (
    <section className="mission-framework" aria-labelledby="mission-framework-title">
      <span className="eyebrow">MISSIONS ET SCORE</span>
      <h2 id="mission-framework-title">{framework.packName}</h2>
      <p>Les cinq choix proposés dans le créateur de liste sont des Dispositions des Forces. Le barème du primaire est défini par la carte de Mission Principale jouée, et non par la Disposition seule.</p>
      <div className="mission-score-grid">
        <article><h3>Mission principale</h3><ul>{framework.primary.map((rule) => <li key={rule}>{rule}</li>)}</ul></article>
        <article><h3>Missions secondaires</h3><ul>{framework.secondary.map((rule) => <li key={rule}>{rule}</li>)}</ul></article>
      </div>
      <aside className="mission-unavailable"><strong>Cartes détaillées non intégrées</strong><p>{framework.unavailableNotice}</p></aside>
      <p className="rules-sources">Sources officielles publiques&nbsp;: {framework.sources.map((source, index) => <span key={source.url}>{index > 0 && ' · '}<a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></span>)}</p>
    </section>
  );
}

export function ReferenceCorePage({
  locale
}: {
  locale: 'fr' | 'en';
}): React.JSX.Element {
  const [document, setDocument] = useState<RulesDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(() => sectionIdFromHash());
  const [tocOpen, setTocOpen] = useState(false);

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
    const onHashChange = (): void => setSelectedSectionId(sectionIdFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!document || !selectedSectionId) return;
    const target = window.document.getElementById(`rule-${selectedSectionId}`);
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [document, selectedSectionId]);

  const results = useMemo(() => document ? searchRules(document, query).slice(0, 30) : [], [document, query]);
  const selectedSection = document ? rulesSectionById(document, selectedSectionId) : null;
  const openSection = (section: RulesSection): void => {
    setTocOpen(false);
    goToRule(section.id);
  };

  return (
    <div className="rules-shell-content" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      

      {!document && <section className="rules-loading"><h2>Chargement de la référence…</h2>{error && <p className="error-text">{error}</p>}</section>}
      {document && (
        <>
          <section className="rules-introduction">
            <div><span className="eyebrow">SOURCE OFFICIELLE</span><h2>{document.source.title}</h2><p>{document.source.filename} · {document.source.pdfPageCount} pages · métadonnée PDF&nbsp;: {document.source.modifiedAt} · version&nbsp;: non indiquée.</p></div>
            <button className="secondary rules-toc-toggle" aria-expanded={tocOpen} onClick={() => setTocOpen((open) => !open)}>Sommaire</button>
            <label className="rules-search"><span>Rechercher dans les règles</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex. objectif sécurisé, charge, ébranlé" /></label>
          </section>

          {query.trim() && <section className="rules-results" aria-live="polite"><h2>{results.length} résultat{results.length === 1 ? '' : 's'}</h2>{results.length === 0 ? <p>Aucune règle ne correspond à cette recherche.</p> : <ul>{results.map((result) => <li key={`${result.section.id}-${result.page.id}`}><button className="secondary" onClick={() => openSection(result.section)}><strong>{result.section.reference} · {result.section.title}</strong><span>p. {result.page.printedPage} · {result.snippet}</span></button></li>)}</ul>}</section>}

          <div className="rules-layout">
            <aside className={`rules-toc ${tocOpen ? 'open' : ''}`} aria-label="Sommaire des règles">
              <div className="rules-toc-heading"><h2>Sommaire</h2><button className="secondary" onClick={() => setTocOpen(false)}>Fermer</button></div>
              {document.chapters.map((chapter) => <section key={chapter.id}><h3>{chapter.title}</h3><ul>{chapter.sections.map((section) => <li key={section.id}><button className={selectedSection?.id === section.id ? 'active' : ''} onClick={() => openSection(section)}>{section.reference && <span>{section.reference}</span>}{section.title}<small>{sourcePageLabel(section.sourcePages)}</small></button></li>)}</ul></section>)}
            </aside>
            <div>
              <MissionFramework document={document} />
              <RulesContent document={document} selectedSectionId={selectedSectionId} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
