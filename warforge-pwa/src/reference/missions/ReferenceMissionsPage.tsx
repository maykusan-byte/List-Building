import { useEffect, useState } from 'react';
import { activeMissionPack, formatMissionSourceDate, MISSION_DATA_URL, missionSourceFilename } from '../../domain/mission-packs';
import type { MissionPack } from '../../domain/mission-packs';

export interface ReferenceMissionsPageProps {
  locale: 'en' | 'fr';
}

export function ReferenceMissionsPage({ locale }: ReferenceMissionsPageProps): React.JSX.Element {
  const [pack, setPack] = useState<MissionPack | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void fetch(MISSION_DATA_URL, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const value: unknown = await response.json();
        const nextPack = activeMissionPack(value);
        if (!nextPack) throw new Error('invalid-schema');
        setPack(nextPack);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(locale === 'fr' ? 'Impossible de charger le pack de missions.' : 'Unable to load the mission pack.');
      });
    return () => controller.abort();
  }, [locale]);

  if (error) {
    return <section className="rules-loading"><h2>{locale === 'fr' ? 'Erreur' : 'Error'}</h2><p className="error-text">{error}</p></section>;
  }
  if (!pack) {
    return <section className="rules-loading"><h2>{locale === 'fr' ? 'Chargement des missions…' : 'Loading missions…'}</h2></section>;
  }

  return (
    <div style={{ padding: '0 1.5rem 2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <span className="eyebrow">{locale === 'fr' ? 'SOURCE OFFICIELLE ARCHIVÉE' : 'ARCHIVED OFFICIAL SOURCE'}</span>
        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{pack.title}</h2>
        <p className="muted">
          {missionSourceFilename(pack.source.relativePath)} · {formatMissionSourceDate(pack.source.createdAt, locale)} · {pack.source.pageCount} {locale === 'fr' ? 'pages' : 'pages'}
        </p>
      </header>

      <aside className="mission-unavailable"><strong>{locale === 'fr' ? 'Cartes détaillées non intégrées' : 'Detailed cards are not integrated'}</strong><p>{pack.unavailableNotice}</p></aside>

      <div className="mission-score-grid">
        <article>
          <h3>{locale === 'fr' ? 'Mission principale' : 'Primary mission'}</h3>
          <ul>{pack.summary.primary.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </article>
        <article>
          <h3>{locale === 'fr' ? 'Missions secondaires' : 'Secondary missions'}</h3>
          <ul>{pack.summary.secondary.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </article>
      </div>
    </div>
  );
}
