import { useEffect, useState } from 'react';
import type { RulesDocument } from '../core/types';
import { MissionCard } from '../components';

const RULES_URL = `${import.meta.env.BASE_URL}data/rules/core-rules-fr.json`;

export interface ReferenceMissionsPageProps {
  locale: 'en' | 'fr';
}

export function ReferenceMissionsPage({ locale }: ReferenceMissionsPageProps) {
  const [document, setDocument] = useState<RulesDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(RULES_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: RulesDocument) => {
        setDocument(data);
      })
      .catch((err) => {
        console.error('Failed to load missions data', err);
        setError('Impossible de charger les données de missions.');
      });
  }, []);

  if (error) {
    return (
      <section className="rules-loading">
        <h2 style={{ color: 'var(--ink)' }}>{locale === 'en' ? 'Error' : 'Erreur'}</h2>
        <p className="error-text">{error}</p>
      </section>
    );
  }

  if (!document) {
    return (
      <section className="rules-loading">
        <h2 style={{ color: 'var(--ink)' }}>{locale === 'en' ? 'Loading missions...' : 'Chargement des missions...'}</h2>
      </section>
    );
  }

  const { missionFramework } = document;

  if (!missionFramework) {
    return (
      <div style={{ padding: '0 1.5rem' }}>
        <p>{locale === 'en' ? 'No missions found.' : 'Aucune mission trouvée.'}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 1.5rem 2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{missionFramework.packName}</h2>
        <p style={{ color: 'var(--ink-soft)' }}>{missionFramework.status === 'public-summary' ? 'Résumé Public' : missionFramework.status}</p>
      </header>

      {missionFramework.unavailableNotice && (
        <div style={{ padding: '1rem', background: '#ffebee', color: '#c62828', borderRadius: '0.5rem', marginBottom: '2rem' }}>
          <strong>Attention: </strong>
          {missionFramework.unavailableNotice}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
        <section>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', borderBottom: '2px solid var(--ink)', paddingBottom: '0.5rem' }}>
            {locale === 'en' ? 'Primary Missions' : 'Missions Principales'}
          </h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingLeft: '1.5rem' }}>
            {missionFramework.primary?.map((rule, idx) => (
              <li key={idx}>{rule}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', borderBottom: '2px solid var(--ink)', paddingBottom: '0.5rem' }}>
            {locale === 'en' ? 'Secondary Missions' : 'Missions Secondaires'}
          </h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingLeft: '1.5rem' }}>
            {missionFramework.secondary?.map((rule, idx) => (
              <li key={idx}>{rule}</li>
            ))}
          </ul>
        </section>
      </div>

      {missionFramework.sources && missionFramework.sources.length > 0 && (
        <section style={{ marginTop: '3rem' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>{locale === 'en' ? 'Sources & Links' : 'Sources & Liens'}</h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '1.5rem' }}>
            {missionFramework.sources.map((source, idx) => (
              <li key={idx}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--interactive)' }}>
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
