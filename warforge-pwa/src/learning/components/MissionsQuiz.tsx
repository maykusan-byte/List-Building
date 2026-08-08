import { useEffect, useMemo, useState } from 'react';
import { activeMissionPack, formatMissionSourceDate, isTrustedWebMissionPack, MISSION_DATA_URL, missionAssetUrl, missionSourceDate, missionSourceFilename } from '../../domain/mission-packs';
import type { MissionPack, PrimaryMissionCard } from '../../domain/mission-packs';

function deckLabel(deck: string): string {
  return deck.split('-').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
}

function MissionTraining({ pack, isFrench }: { pack: MissionPack & { cards: NonNullable<MissionPack['cards']> }; isFrench: boolean }): React.JSX.Element {
  const cards = pack.cards.primary;
  const decks = useMemo(() => [...new Set(cards.map((card) => card.deck))].sort(), [cards]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const card: PrimaryMissionCard = cards[index % cards.length];
  const options = useMemo(() => {
    const remaining = decks.filter((deck) => deck !== card.deck);
    const offset = index % remaining.length;
    return [card.deck, ...remaining.slice(offset), ...remaining.slice(0, offset)].slice(0, 4).sort((left, right) => left.localeCompare(right));
  }, [card.deck, decks, index]);
  const isCorrect = answer === card.deck;

  const choose = (deck: string) => {
    if (answer) return;
    setAnswer(deck);
    setScore((previous) => ({ correct: previous.correct + (deck === card.deck ? 1 : 0), total: previous.total + 1 }));
  };
  const next = () => {
    setIndex((previous) => previous + 1);
    setAnswer(null);
  };

  return (
    <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }} aria-labelledby="mission-training-title">
      <span className="eyebrow">{isFrench ? 'ENTRAÎNEMENT · ARCHIVE LOCALE GDM' : 'TRAINING · LOCAL GDM ARCHIVE'}</span>
      <h2 id="mission-training-title">{isFrench ? 'À quelle disposition appartient cette mission ?' : 'Which Force Disposition deck contains this mission?'}</h2>
      <p className="muted">{card.name} · {isFrench ? `Score : ${score.correct}/${score.total}` : `Score: ${score.correct}/${score.total}`}</p>
      <div className="mission-library-tabs" style={{ marginTop: '1rem' }}>
        {options.map((deck) => <button key={deck} type="button" className={answer ? (deck === card.deck ? 'active' : deck === answer ? 'mission-answer-wrong' : '') : ''} onClick={() => choose(deck)}>{deckLabel(deck)}</button>)}
      </div>
      {answer && <div className={isCorrect ? 'notice-text' : 'error-text'} style={{ marginTop: '0.85rem' }}>
        {isCorrect ? (isFrench ? 'Correct.' : 'Correct.') : (isFrench ? `Réponse : ${deckLabel(card.deck)}.` : `Answer: ${deckLabel(card.deck)}.`)}
      </div>}
      {answer && <div className="mission-rule-section"><strong>{isFrench ? 'Barème archivé' : 'Archived scoring'}</strong>{card.sections.map((section, sectionIndex) => <p key={`${section.when}-${sectionIndex}`} className="muted"><b>{section.when}</b>{section.trigger && <> · {section.trigger}</>} · {section.tiers.map((tier) => `${tier.vp} VP: ${tier.text.replaceAll('**', '')}`).join(' / ')}</p>)}</div>}
      {answer && missionAssetUrl(card.asset) && <img src={missionAssetUrl(card.asset) ?? undefined} alt={`GDM 2026 — ${card.name}`} loading="lazy" style={{ display: 'block', margin: '1rem auto 0', maxHeight: '32rem', maxWidth: '100%' }} />}
      {answer && <button type="button" className="secondary" style={{ marginTop: '1rem' }} onClick={next}>{isFrench ? 'Mission suivante' : 'Next mission'}</button>}
    </section>
  );
}

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
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(isFrench ? 'Le pack de missions est indisponible.' : 'The mission pack is unavailable.');
      });
    return () => controller.abort();
  }, [isFrench]);

  if (error) return <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }}><p className="error-text">{error}</p></section>;
  if (!pack) return <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }}><p>{isFrench ? 'Chargement du pack de missions…' : 'Loading mission pack…'}</p></section>;
  if (isTrustedWebMissionPack(pack)) return <MissionTraining pack={pack} isFrench={isFrench} />;

  return (
    <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }} aria-labelledby="missions-summary-title">
      <span className="eyebrow">{isFrench ? 'SOURCE VÉRIFIÉE' : 'VERIFIED SOURCE'}</span>
      <h2 id="missions-summary-title">{pack.title}</h2>
      <p className="notice-text">{pack.unavailableNotice}</p>
      <p className="muted"><strong>{missionSourceFilename(pack.source)}</strong>{' · '}{formatMissionSourceDate(missionSourceDate(pack.source), isFrench ? 'fr' : 'en')}{' · '}{pack.source.pageCount} {isFrench ? 'pages' : 'pages'}</p>
      <div className="mission-score-grid">
        <article><h3>{isFrench ? 'Mission principale' : 'Primary mission'}</h3><ul>{pack.summary.primary.map((rule) => <li key={rule}>{rule}</li>)}</ul></article>
        <article><h3>{isFrench ? 'Missions secondaires' : 'Secondary missions'}</h3><ul>{pack.summary.secondary.map((rule) => <li key={rule}>{rule}</li>)}</ul></article>
      </div>
    </section>
  );
}
