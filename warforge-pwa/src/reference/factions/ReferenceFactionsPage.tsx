
import { useState } from 'react';
import type { NormalizedDatabase, FactionSummary, NormalizedDetachment } from '../../domain/types';
import { StratagemCard, EnhancementCard } from '../components';

export interface ReferenceFactionsPageProps {
  database: NormalizedDatabase | null;
  locale: 'en' | 'fr';
}

export function ReferenceFactionsPage({ database, locale }: ReferenceFactionsPageProps) {
  const [selectedFactionId, setSelectedFactionId] = useState<string | null>(null);
  const [selectedDetachmentId, setSelectedDetachmentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'detachments' | 'units'>('detachments');

  if (!database) {
    return (
      <section className="rules-loading">
        <h2>{locale === 'en' ? 'Loading database...' : 'Chargement des données...'}</h2>
      </section>
    );
  }

  const { factions, detachments, units } = database;

  // Sorting factions alphabetically
  const sortedFactions = [...factions].sort((a, b) => a.name.localeCompare(b.name));

  const handleSelectFaction = (factionId: string) => {
    setSelectedFactionId(factionId);
    setSelectedDetachmentId(null);
    setActiveTab('detachments');
  };

  if (!selectedFactionId) {
    return (
      <div style={{ padding: '0 1.5rem 2rem' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>{locale === 'en' ? 'Select a Faction' : 'Sélectionnez une Faction'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {sortedFactions.map((faction) => (
            <button
              key={faction.id}
              className="secondary"
              style={{ padding: '1rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
              onClick={() => handleSelectFaction(faction.id)}
            >
              <strong style={{ fontSize: '1.125rem' }}>{faction.name}</strong>
              <span style={{ fontSize: '0.875rem', color: 'var(--ink-soft)' }}>
                {faction.detachmentCount} détachement(s) • {faction.unitCount} unité(s)
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const selectedFaction = factions.find((f) => f.id === selectedFactionId);
  const factionDetachments = detachments.filter((d) => d.factionName === selectedFaction?.name);
  const factionUnits = units.filter((u) => u.factionName === selectedFaction?.name).sort((a, b) => (a.displayName || a.Name || '').localeCompare(b.displayName || b.Name || ''));
  const activeDetachment = detachments.find((d) => d.id === selectedDetachmentId);

  return (
    <div style={{ padding: '0 1.5rem 2rem' }}>
      <button className="secondary" style={{ marginBottom: '1.5rem' }} onClick={() => setSelectedFactionId(null)}>
        ← {locale === 'en' ? 'Back to Factions' : 'Retour aux Factions'}
      </button>

      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>{selectedFaction?.name}</h2>
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)' }}>
          <button 
            style={{ padding: '0.75rem 1rem', background: 'none', border: 'none', borderBottom: activeTab === 'detachments' ? '2px solid var(--ink)' : '2px solid transparent', fontWeight: activeTab === 'detachments' ? 700 : 400, cursor: 'pointer' }}
            onClick={() => setActiveTab('detachments')}
          >
            {locale === 'en' ? 'Detachments' : 'Détachements'} ({factionDetachments.length})
          </button>
          <button 
            style={{ padding: '0.75rem 1rem', background: 'none', border: 'none', borderBottom: activeTab === 'units' ? '2px solid var(--ink)' : '2px solid transparent', fontWeight: activeTab === 'units' ? 700 : 400, cursor: 'pointer' }}
            onClick={() => setActiveTab('units')}
          >
            {locale === 'en' ? 'Units' : 'Unités'} ({factionUnits.length})
          </button>
        </div>
      </div>

      {activeTab === 'detachments' && (
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <aside style={{ flex: '0 0 250px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {factionDetachments.map((detachment) => (
              <button
                key={detachment.id}
                className={selectedDetachmentId === detachment.id ? 'primary' : 'secondary'}
                style={{ textAlign: 'left', padding: '0.75rem' }}
                onClick={() => setSelectedDetachmentId(detachment.id)}
              >
                {detachment.displayName || detachment.Name}
              </button>
            ))}
            {factionDetachments.length === 0 && (
              <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                {locale === 'en' ? 'No detachments found.' : 'Aucun détachement trouvé.'}
              </p>
            )}
          </aside>

          <main style={{ flex: '1 1 500px' }}>
            {!activeDetachment && factionDetachments.length > 0 && (
              <div style={{ padding: '2rem', background: 'var(--surface)', borderRadius: '0.5rem', textAlign: 'center' }}>
                <p>{locale === 'en' ? 'Select a detachment to view its rules.' : 'Sélectionnez un détachement pour voir ses règles.'}</p>
              </div>
            )}

            {activeDetachment && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{activeDetachment.displayName || activeDetachment.Name}</h3>
                  {activeDetachment.Rule && (
                    <div style={{ background: 'var(--surface)', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                      <h4 style={{ marginBottom: '0.5rem', fontSize: '1.125rem' }}>Règle de Détachement : {activeDetachment.Rule.Title}</h4>
                      <p style={{ whiteSpace: 'pre-line' }}>{activeDetachment.Rule.Text}</p>
                      {activeDetachment.Rule.Restrictions && (
                        <p style={{ marginTop: '1rem', fontStyle: 'italic', fontSize: '0.875rem' }}>
                          <strong>Restrictions: </strong>
                          {activeDetachment.Rule.Restrictions}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {activeDetachment.Stratagems && activeDetachment.Stratagems.length > 0 && (
                  <section>
                    <h4 style={{ fontSize: '1.25rem', marginBottom: '1rem', borderBottom: '2px solid var(--ink)', paddingBottom: '0.25rem' }}>Stratagèmes</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                      {activeDetachment.Stratagems.map((strat, idx) => (
                        <StratagemCard 
                          key={idx}
                          name={strat.Name || 'Stratagème'}
                          cpCost={strat.CPCost}
                          category={strat.Category}
                          phase={strat.Phase}
                          when={strat.When}
                          target={strat.Target}
                          effect={strat.Effect}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {activeDetachment.Enhancements && activeDetachment.Enhancements.length > 0 && (
                  <section>
                    <h4 style={{ fontSize: '1.25rem', marginBottom: '1rem', borderBottom: '2px solid var(--ink)', paddingBottom: '0.25rem' }}>Améliorations</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                      {activeDetachment.Enhancements.map((enhancement, idx) => (
                        <EnhancementCard 
                          key={idx}
                          name={enhancement.Name || 'Amélioration'}
                          cost={enhancement.Cost}
                          description={enhancement.Description}
                          features={enhancement.Features}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {activeTab === 'units' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {factionUnits.map((unit) => (
            <div key={unit.id} style={{ padding: '1rem', background: 'var(--surface)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>{unit.displayName || unit.Name}</h4>
              <div style={{ fontSize: '0.875rem', color: 'var(--ink-soft)', marginBottom: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {unit.Keywords?.map(kw => (
                  <span key={kw} style={{ background: 'var(--border)', padding: '0.125rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>{kw}</span>
                ))}
              </div>
              {unit.CoreAbilities && unit.CoreAbilities.length > 0 && (
                <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  <strong>{locale === 'en' ? 'Core: ' : 'Base: '}</strong>
                  {unit.CoreAbilities.join(', ')}
                </p>
              )}
              {unit.UnitAbilities && unit.UnitAbilities.length > 0 && (
                <div style={{ fontSize: '0.875rem' }}>
                  <strong>{locale === 'en' ? 'Abilities: ' : 'Aptitudes: '}</strong>
                  <ul style={{ paddingLeft: '1rem', margin: '0.25rem 0' }}>
                    {unit.UnitAbilities.map((ab, idx) => (
                      <li key={idx}><strong>{ab.Title}:</strong> {ab.Text?.substring(0, 80)}...</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {factionUnits.length === 0 && (
            <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>
              {locale === 'en' ? 'No units found.' : 'Aucune unité trouvée.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
