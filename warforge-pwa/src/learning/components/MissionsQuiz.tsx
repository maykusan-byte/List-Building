import { useEffect, useState } from 'react';
import { activeMissionPack, formatMissionSourceDate, MISSION_DATA_URL, missionSourceFilename } from '../../domain/mission-packs';
import type { MissionPack } from '../../domain/mission-packs';

export function MissionsQuiz({ isFrench }: { isFrench: boolean }): React.JSX.Element {
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
        setError(isFrench ? 'Le pack de missions est indisponible.' : 'The mission pack is unavailable.');
      });
    return () => controller.abort();
  }, [isFrench]);

  if (error) {
    return <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }}><p className="error-text">{error}</p></section>;
  }

  if (!pack) {
    return <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }}><p>{isFrench ? 'Chargement du pack de missions…' : 'Loading mission pack…'}</p></section>;
  }

  return (
    <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }} aria-labelledby="missions-summary-title">
      <span className="eyebrow">{isFrench ? 'SOURCE VÉRIFIÉE' : 'VERIFIED SOURCE'}</span>
      <h2 id="missions-summary-title">{pack.title}</h2>
      <p className="notice-text">{pack.unavailableNotice}</p>
      <p className="muted">
        {isFrench ? 'Document archivé : ' : 'Archived document: '}
        <strong>{missionSourceFilename(pack.source.relativePath)}</strong>
        {' · '}{formatMissionSourceDate(pack.source.createdAt, isFrench ? 'fr' : 'en')}
        {' · '}{pack.source.pageCount} {isFrench ? 'pages' : 'pages'}
      </p>
      <div className="mission-score-grid">
        <article>
          <h3>{isFrench ? 'Mission principale' : 'Primary mission'}</h3>
          <ul>{pack.summary.primary.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </article>
        <article>
          <h3>{isFrench ? 'Missions secondaires' : 'Secondary missions'}</h3>
          <ul>{pack.summary.secondary.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </article>
      </div>
    </section>
  );
}
