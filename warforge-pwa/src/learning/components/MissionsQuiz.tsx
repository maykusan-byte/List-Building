import { useEffect, useMemo, useRef, useState } from 'react';
import { activeMissionPack, formatMissionSourceDate, isTrustedWebMissionPack, MISSION_DATA_URL, missionAssetUrl, missionSourceDate, missionSourceFilename } from '../../domain/mission-packs';
import type { MissionPack, MissionScoreTier, PrimaryMissionCard, SecondaryMissionCard } from '../../domain/mission-packs';
import { createMissionQuizQuestion, matchingLayouts, missionDispositionLabel, missionQuizFilters, nextMissionQuizRetryRound } from '../mission-quiz';
import type { MissionQuizFilter, MissionQuizQuestion } from '../mission-quiz';

interface Retry {
  id: number;
  dueAtRound: number;
  question: MissionQuizQuestion;
}

function hasContent(value: string | undefined): value is string {
  return Boolean(value && value !== '$undefined');
}

function isPrimaryMissionCard(card: PrimaryMissionCard | SecondaryMissionCard): card is PrimaryMissionCard {
  return 'deck' in card;
}

function MissionText({ value }: { value: string }): React.JSX.Element {
  const normalized = value.replace(/<\/?span(?:\s[^>]*)?>/gi, '');
  const tokens = normalized.split(/(<(?:b|u)>.*?<\/(?:b|u)>|\*\*.*?\*\*)/gi);
  return <>{tokens.map((token, index) => {
    const bold = token.match(/^<b>(.*?)<\/b>$/i) ?? token.match(/^\*\*(.*?)\*\*$/);
    if (bold) return <strong key={index}>{bold[1].replace(/<[^>]+>/g, '')}</strong>;
    const underline = token.match(/^<u>(.*?)<\/u>$/i);
    if (underline) return <span key={index} className="mission-text-underline">{underline[1].replace(/<[^>]+>/g, '')}</span>;
    return <span key={index}>{token.replace(/<[^>]+>/g, '')}</span>;
  })}</>;
}

function ScoreLine({ tier }: { tier: MissionScoreTier }): React.JSX.Element {
  return <li className="mission-score-line"><span><MissionText value={tier.text} /></span><strong>{tier.vp} VP</strong></li>;
}

function MissionRules({ card, compact = false }: { card: PrimaryMissionCard | SecondaryMissionCard; compact?: boolean }): React.JSX.Element {
  const isPrimary = isPrimaryMissionCard(card);
  return (
    <div className={compact ? 'mission-quiz-rules mission-quiz-rules--compact' : 'mission-quiz-rules'}>
      {isPrimary ? <>
        {hasContent(card.rule) && <p className="mission-when-drawn"><MissionText value={card.rule} /></p>}
        {card.sections.map((section, index) => (
          <section className="mission-rule-section" key={`${section.when}-${index}`}>
            <strong>{section.when}</strong>
            {hasContent(section.trigger) && <small><MissionText value={section.trigger} /></small>}
            <ul>{section.tiers.map((tier, tierIndex) => <ScoreLine key={`${tier.text}-${tierIndex}`} tier={tier} />)}</ul>
          </section>
        ))}
      </> : <>
        {hasContent(card.whenDrawn) && <p className="mission-when-drawn"><MissionText value={card.whenDrawn} /></p>}
        {card.sections.map((section, index) => (
          <section className="mission-rule-section" key={`${section.chip ?? section.when}-${index}`}>
            <strong>{section.chip ?? section.when}</strong>
            {hasContent(section.trigger) && <small><MissionText value={section.trigger} /></small>}
            <ul>{section.rows.map((row, rowIndex) => <ScoreLine key={`${row.text}-${rowIndex}`} tier={row} />)}</ul>
          </section>
        ))}
      </>}
    </div>
  );
}

function Matchup({ card }: { card: PrimaryMissionCard }): React.JSX.Element {
  return (
    <div className="mission-quiz-matchup" aria-label={`Matchup: ${card.deck} versus ${card.vs ?? 'unknown'}`}>
      <div className="mission-quiz-force mission-quiz-force--friendly">
        <span>Votre disposition</span>
        <strong>{missionDispositionLabel(card.deck)}</strong>
      </div>
      <span className="mission-quiz-versus">VS</span>
      <div className="mission-quiz-force mission-quiz-force--opponent">
        <span>Disposition adverse</span>
        <strong>{card.vs ? missionDispositionLabel(card.vs) : '—'}</strong>
      </div>
    </div>
  );
}

function QuestionBrief({ question, isFrench }: { question: MissionQuizQuestion; isFrench: boolean }): React.JSX.Element {
  switch (question.format) {
    case 'primary-composition':
      return <Matchup card={question.target} />;
    case 'primary-opponent':
      return <MissionRules card={question.target} />;
    case 'primary-rules':
      return (
        <div className="mission-quiz-brief-card">
          <span className="eyebrow">{isFrench ? 'MISSION PRINCIPALE' : 'PRIMARY MISSION'}</span>
          <h3>{question.target.name}</h3>
          <Matchup card={question.target} />
        </div>
      );
    case 'secondary-recognition':
      return <MissionRules card={question.target} />;
  }
}

function questionPrompt(question: MissionQuizQuestion, isFrench: boolean): string {
  if (question.format === 'primary-composition') return isFrench ? 'Quelle mission principale résout cette confrontation ?' : 'Which primary mission resolves this matchup?';
  if (question.format === 'primary-opponent') return isFrench ? 'Contre quelle disposition adverse se joue cette mission ?' : 'Which opposing disposition is this mission played against?';
  if (question.format === 'primary-rules') return isFrench ? `Quel barème correspond à « ${question.target.name} » ?` : `Which scoring rules belong to “${question.target.name}”?`;
  return isFrench ? 'Quelle mission secondaire correspond à cet objectif ?' : 'Which secondary mission matches this objective?';
}

function optionId(option: string | PrimaryMissionCard | SecondaryMissionCard): string {
  return typeof option === 'string' ? option : option.sourcePath;
}

function optionLabel(option: string | PrimaryMissionCard | SecondaryMissionCard): string {
  return typeof option === 'string' ? missionDispositionLabel(option) : option.name;
}

function QuestionOptions({ question, selectedAnswer, onChoose }: { question: MissionQuizQuestion; selectedAnswer: string | null; onChoose: (answer: string) => void }): React.JSX.Element {
  const options = question.options;
  return (
    <div className={question.format === 'primary-rules' ? 'mission-quiz-options mission-quiz-options--rules' : 'mission-quiz-options'}>
      {options.map((option) => {
        const id = optionId(option);
        const isCorrect = id === question.correctOptionId;
        const isSelected = id === selectedAnswer;
        const state = selectedAnswer === null ? '' : isCorrect ? ' mission-quiz-option--correct' : isSelected ? ' mission-quiz-option--wrong' : ' mission-quiz-option--muted';
        return (
          <button key={id} type="button" disabled={selectedAnswer !== null} className={`mission-quiz-option${state}`} onClick={() => onChoose(id)}>
            {question.format === 'primary-rules' && typeof option !== 'string' ? <MissionRules card={option} compact /> : <span>{optionLabel(option)}</span>}
            {selectedAnswer !== null && isCorrect && <span aria-label="Correct">✓</span>}
            {selectedAnswer !== null && isSelected && !isCorrect && <span aria-label="Incorrect">×</span>}
          </button>
        );
      })}
    </div>
  );
}

function AnswerReview({ question, cards, isFrench }: { question: MissionQuizQuestion; cards: NonNullable<MissionPack['cards']>; isFrench: boolean }): React.JSX.Element {
  const primaryCard = isPrimaryMissionCard(question.target) ? question.target : null;
  const layouts = primaryCard ? matchingLayouts(cards, primaryCard) : [];
  const image = missionAssetUrl(question.target.asset);
  return (
    <div className="mission-quiz-review">
      <div className="mission-quiz-review__heading">
        <span className="eyebrow">{isFrench ? 'RÉVISION' : 'REVIEW'}</span>
        <h3>{question.target.name}</h3>
      </div>
      <MissionRules card={question.target} />
      {image && <img className="mission-quiz-card-image" src={image} alt={`GDM 2026 — ${question.target.name}`} loading="lazy" />}
      {primaryCard && layouts.length > 0 && (
        <section className="mission-quiz-layouts">
          <h4>{isFrench ? 'Layouts recommandés' : 'Recommended layouts'}</h4>
          <div className="mission-quiz-layout-grid">
            {layouts.map((layout) => <figure key={layout.number} className="mission-layout-card"><img src={missionAssetUrl(layout.image) ?? undefined} alt={`${layout.name} — ${primaryCard.deck} vs ${primaryCard.vs}`} loading="lazy" /><figcaption>{layout.name}</figcaption></figure>)}
          </div>
        </section>
      )}
    </div>
  );
}

function MissionTraining({ pack, isFrench }: { pack: MissionPack & { cards: NonNullable<MissionPack['cards']> }; isFrench: boolean }): React.JSX.Element {
  const [filter, setFilter] = useState<MissionQuizFilter>('all');
  const [round, setRound] = useState(0);
  const [seed, setSeed] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0, streak: 0 });
  const [retries, setRetries] = useState<Retry[]>([]);
  const retryId = useRef(0);
  const filters = useMemo(() => missionQuizFilters(pack.cards), [pack.cards]);
  const dueRetry = retries.find((retry) => retry.dueAtRound <= round) ?? null;
  const question = useMemo(() => dueRetry?.question ?? createMissionQuizQuestion(pack.cards, filter), [dueRetry, filter, pack.cards, seed]);

  const reset = (nextFilter: MissionQuizFilter) => {
    setFilter(nextFilter);
    setRound(0);
    setSeed((previous) => previous + 1);
    setSelectedAnswer(null);
    setScore({ correct: 0, total: 0, streak: 0 });
    setRetries([]);
  };

  if (!question) return <section className="library-panel mission-quiz"><p className="error-text">{isFrench ? 'Aucune mission ne correspond à ce filtre.' : 'No mission matches this filter.'}</p></section>;

  const isCorrect = selectedAnswer === question.correctOptionId;
  const choose = (answer: string) => {
    if (selectedAnswer !== null) return;
    const correct = answer === question.correctOptionId;
    setSelectedAnswer(answer);
    setScore((previous) => ({ correct: previous.correct + Number(correct), total: previous.total + 1, streak: correct ? previous.streak + 1 : 0 }));
  };
  const next = () => {
    if (selectedAnswer === null) return;
    setRetries((previous) => {
      const remaining = dueRetry ? previous.filter((retry) => retry.id !== dueRetry.id) : previous;
      if (isCorrect) return remaining;
      return [...remaining, { id: retryId.current += 1, dueAtRound: nextMissionQuizRetryRound(round), question }];
    });
    setRound((previous) => previous + 1);
    setSeed((previous) => previous + 1);
    setSelectedAnswer(null);
  };

  return (
    <section className="library-panel mission-quiz" aria-labelledby="mission-training-title">
      <header className="mission-quiz-header">
        <div>
          <span className="eyebrow">{isFrench ? 'ENTRAÎNEMENT · ARCHIVE LOCALE GDM' : 'TRAINING · LOCAL GDM ARCHIVE'}</span>
          <h2 id="mission-training-title">{isFrench ? 'Quiz des missions' : 'Mission quiz'}</h2>
        </div>
        <p className="mission-quiz-score">{isFrench ? `Score : ${score.correct}/${score.total}` : `Score: ${score.correct}/${score.total}`}{score.streak > 1 && ` · ${score.streak} ${isFrench ? 'd’affilée' : 'in a row'}`}</p>
      </header>
      <label className="mission-quiz-filter">
        <span>{isFrench ? 'Réviser' : 'Review'}</span>
        <select value={filter} onChange={(event) => reset(event.target.value)}>
          <option value="all">{isFrench ? 'Toutes les missions' : 'All missions'}</option>
          <optgroup label={isFrench ? 'Par type' : 'By type'}>
            <option value="primary">{isFrench ? 'Missions principales' : 'Primary missions'}</option>
            <option value="secondary">{isFrench ? 'Missions secondaires' : 'Secondary missions'}</option>
          </optgroup>
          <optgroup label={isFrench ? 'Par disposition' : 'By disposition'}>
            {filters.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </optgroup>
        </select>
      </label>
      <div className="mission-quiz-question">
        <QuestionBrief question={question} isFrench={isFrench} />
        <h3>{questionPrompt(question, isFrench)}</h3>
        <QuestionOptions question={question} selectedAnswer={selectedAnswer} onChoose={choose} />
      </div>
      {selectedAnswer !== null && (
        <>
          <p className={isCorrect ? 'mission-quiz-feedback mission-quiz-feedback--correct' : 'mission-quiz-feedback mission-quiz-feedback--wrong'} role="status">
            {isCorrect
              ? (isFrench ? 'Correct. Continue comme ça.' : 'Correct. Keep going.')
              : (isFrench ? `Réponse : ${question.format === 'primary-opponent' ? missionDispositionLabel(question.correctOptionId) : question.target.name}. Cette mission sera revue dans cinq questions.` : `Answer: ${question.format === 'primary-opponent' ? missionDispositionLabel(question.correctOptionId) : question.target.name}. This mission will return in five questions.`)}
          </p>
          <AnswerReview question={question} cards={pack.cards} isFrench={isFrench} />
          <button type="button" className="primary mission-quiz-next" onClick={next}>{isFrench ? 'Question suivante' : 'Next question'} →</button>
        </>
      )}
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
        if (!controller.signal.aborted) setError(isFrench ? 'Le pack de missions est indisponible.' : 'The mission pack is unavailable.');
      });
    return () => controller.abort();
  }, [isFrench]);

  if (error) return <section className="library-panel mission-quiz"><p className="error-text">{error}</p></section>;
  if (!pack) return <section className="library-panel mission-quiz"><p>{isFrench ? 'Chargement du pack de missions…' : 'Loading mission pack…'}</p></section>;
  if (isTrustedWebMissionPack(pack)) return <MissionTraining pack={pack} isFrench={isFrench} />;

  return (
    <section className="library-panel mission-quiz" aria-labelledby="missions-summary-title">
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
