
import { useEffect, useState, useMemo } from 'react';
import type { NormalizedDatabase } from '../../domain/types';
import type { RulesDocument } from '../core/types';
import { searchRules, normalizeRulesSearch } from '../core/search';
import { StratagemCard, EnhancementCard } from '../components';

const RULES_URL = `${import.meta.env.BASE_URL}data/rules/core-rules-fr.json`;

export interface ReferenceSearchPageProps {
  database: NormalizedDatabase | null;
  locale: 'en' | 'fr';
}

export function ReferenceSearchPage({ database, locale }: ReferenceSearchPageProps) {
  const [query, setQuery] = useState('');
  const [document, setDocument] = useState<RulesDocument | null>(null);

  useEffect(() => {
    fetch(RULES_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: RulesDocument) => setDocument(data))
      .catch((err) => console.error('Failed to load rules for search', err));
  }, []);

  const ruleResults = useMemo(() => {
    if (!document || !query.trim()) return [];
    return searchRules(document, query).slice(0, 15);
  }, [document, query]);

  const factionResults = useMemo(() => {
    if (!database || !query.trim()) return [];
    const normalizedQuery = normalizeRulesSearch(query);
    const results: { type: string, match: any, detachment?: any, unit?: any }[] = [];

    database.detachments.forEach(detachment => {
      // Check Detachment Rule
      const detRule = detachment.Rule?.Title + ' ' + detachment.Rule?.Text;
      if (normalizeRulesSearch(detRule).includes(normalizedQuery) || normalizeRulesSearch(detachment.Name || '').includes(normalizedQuery)) {
        results.push({ type: 'detachment', match: detachment.Rule, detachment });
      }

      // Check Stratagems
      detachment.Stratagems?.forEach(strat => {
        const stratStr = [strat.Name, strat.When, strat.Target, strat.Effect].join(' ');
        if (normalizeRulesSearch(stratStr).includes(normalizedQuery)) {
          results.push({ type: 'stratagem', match: strat, detachment });
        }
      });

      // Check Enhancements
      detachment.Enhancements?.forEach(enh => {
        const enhStr = [enh.Name, enh.Description, enh.Features].join(' ');
        if (normalizeRulesSearch(enhStr).includes(normalizedQuery)) {
          results.push({ type: 'enhancement', match: enh, detachment });
        }
      });
    });
    
    database.units.forEach(unit => {
      const unitName = unit.displayName || unit.Name || '';
      const unitKeywords = (unit.Keywords || []).join(' ');
      const unitAbilities = (unit.UnitAbilities || []).map(a => a.Title + ' ' + a.Text).join(' ');
      const unitCore = (unit.CoreAbilities || []).join(' ');
      const unitStr = [unitName, unitKeywords, unitAbilities, unitCore].join(' ');
      
      if (normalizeRulesSearch(unitStr).includes(normalizedQuery)) {
        results.push({ type: 'unit', match: unit, unit });
      }
    });

    return results.slice(0, 30);
  }, [database, query]);

  return (
    <div style={{ padding: '0 1.5rem 2rem' }}>
      <label className="rules-search" style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
          {locale === 'en' ? 'Global Search (Rules, Stratagems, Enhancements, Units...)' : 'Recherche Globale (Règles, Stratagèmes, Améliorations, Unités...)'}
        </span>
        <input 
          value={query} 
          onChange={(event) => setQuery(event.target.value)} 
          placeholder={locale === 'en' ? 'e.g., charge, objective, intercessor' : 'Ex. objectif sécurisé, charge, intercessor'} 
          style={{ padding: '1rem', fontSize: '1rem', border: '1px solid var(--border)', borderRadius: '0.5rem', width: '100%', maxWidth: '600px' }}
        />
      </label>

      {!query.trim() && (
        <div style={{ padding: '2rem', background: 'var(--surface)', borderRadius: '0.5rem', textAlign: 'center' }}>
          <p>{locale === 'en' ? 'Start typing to search across all rules and codex data.' : 'Commencez à taper pour rechercher dans toutes les règles et données de codex.'}</p>
        </div>
      )}

      {query.trim() && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
          
          <section>
            <h3 style={{ fontSize: '1.5rem', borderBottom: '2px solid var(--ink)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
              {locale === 'en' ? `Core Rules (${ruleResults.length})` : `Règles de Base (${ruleResults.length})`}
            </h3>
            {ruleResults.length === 0 ? (
              <p style={{ color: 'var(--ink-soft)' }}>{locale === 'en' ? 'No core rules found.' : 'Aucune règle trouvée.'}</p>
            ) : (
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '1rem', listStyle: 'none', padding: 0 }}>
                {ruleResults.map((result) => (
                  <li key={`${result.section.id}-${result.page.id}`} style={{ padding: '1rem', background: 'var(--surface)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <strong>{result.section.reference} · {result.section.title}</strong>
                      <span style={{ fontSize: '0.875rem', color: 'var(--ink-soft)' }}>p. {result.page.printedPage}</span>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--ink)' }}>...{result.snippet}...</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 style={{ fontSize: '1.5rem', borderBottom: '2px solid var(--ink)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
              {locale === 'en' ? `Codex Data (${factionResults.length})` : `Données Codex (${factionResults.length})`}
            </h3>
            {factionResults.length === 0 ? (
              <p style={{ color: 'var(--ink-soft)' }}>{locale === 'en' ? 'No stratagems, enhancements or units found.' : 'Aucun stratagème, amélioration ou unité trouvé.'}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {factionResults.map((res, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    
                    {res.type === 'stratagem' && (
                      <>
                        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: '0.25rem', fontWeight: 700 }}>
                          {res.detachment.factionName} - {res.detachment.displayName || res.detachment.Name}
                        </div>
                        <StratagemCard 
                          name={res.match.Name || 'Stratagème'}
                          cpCost={res.match.CPCost}
                          category={res.match.Category}
                          phase={res.match.Phase}
                          when={res.match.When}
                          target={res.match.Target}
                          effect={res.match.Effect}
                        />
                      </>
                    )}
                    {res.type === 'enhancement' && (
                      <>
                        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: '0.25rem', fontWeight: 700 }}>
                          {res.detachment.factionName} - {res.detachment.displayName || res.detachment.Name}
                        </div>
                        <EnhancementCard 
                          name={res.match.Name || 'Amélioration'}
                          cost={res.match.Cost}
                          description={res.match.Description}
                          features={res.match.Features}
                        />
                      </>
                    )}
                    {res.type === 'detachment' && (
                      <>
                        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: '0.25rem', fontWeight: 700 }}>
                          {res.detachment.factionName} - {res.detachment.displayName || res.detachment.Name}
                        </div>
                        <div style={{ padding: '1rem', background: 'var(--surface)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                          <h4 style={{ marginBottom: '0.5rem' }}>Règle de Détachement</h4>
                          <strong>{res.match.Title}</strong>
                          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>{res.match.Text}</p>
                        </div>
                      </>
                    )}
                    {res.type === 'unit' && (
                      <>
                        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: '0.25rem', fontWeight: 700 }}>
                          {res.unit.factionName} - Datasheet
                        </div>
                        <div style={{ padding: '1rem', background: 'var(--surface)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                          <h4 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>{res.unit.displayName || res.unit.Name}</h4>
                          <div style={{ fontSize: '0.875rem', color: 'var(--ink-soft)', marginBottom: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {res.unit.Keywords?.slice(0, 4).map((kw: string) => (
                              <span key={kw} style={{ background: 'var(--border)', padding: '0.125rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>{kw}</span>
                            ))}
                            {res.unit.Keywords && res.unit.Keywords.length > 4 && (
                              <span style={{ fontSize: '0.75rem' }}>+{res.unit.Keywords.length - 4}</span>
                            )}
                          </div>
                          {res.unit.CoreAbilities && res.unit.CoreAbilities.length > 0 && (
                            <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                              <strong>{locale === 'en' ? 'Core: ' : 'Base: '}</strong>
                              {res.unit.CoreAbilities.join(', ')}
                            </p>
                          )}
                          {res.unit.UnitAbilities && res.unit.UnitAbilities.length > 0 && (
                            <div style={{ fontSize: '0.875rem' }}>
                              <strong>{locale === 'en' ? 'Abilities: ' : 'Aptitudes: '}</strong>
                              <ul style={{ paddingLeft: '1rem', margin: '0.25rem 0' }}>
                                {res.unit.UnitAbilities.slice(0, 2).map((ab: any, idx: number) => (
                                  <li key={idx}><strong>{ab.Title}:</strong> {ab.Text?.substring(0, 50)}...</li>
                                ))}
                                {res.unit.UnitAbilities.length > 2 && (
                                  <li><em>+{res.unit.UnitAbilities.length - 2} plus...</em></li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      )}
    </div>
  );
}
