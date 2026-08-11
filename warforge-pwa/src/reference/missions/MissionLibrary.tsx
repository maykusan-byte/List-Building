import { useMemo, useState } from 'react';
import { claimsForGuide, claimsForSecondaryMissionGuide, forceDispositionBrief, layoutContextBrief, matchupGuideForDispositions, matchupGuides, missionBrief, secondaryDecisionExamplesForGuide, secondaryMissionFamilies, secondaryMissionGuide, workedExampleForGuide } from '../../domain/strategy-knowledge';
import type { StrategyEvidence, StrategyKnowledge, StrategyMatchupGuide } from '../../domain/strategy-knowledge';
import { missionAssetUrl } from '../../domain/mission-packs';
import type { MissionPack, MissionScoreTier, PrimaryMissionCard, SecondaryMissionCard } from '../../domain/mission-packs';

type LibrarySection = 'primary' | 'secondary' | 'secondary-strategy' | 'dispositions' | 'layouts' | 'matrix' | 'guides';

const AXIS_LABELS: Record<string, { fr: string; en: string }> = {
  'primary-scoring': { fr: 'Score principal', en: 'Primary scoring' },
  'secondary-scoring': { fr: 'Score secondaire', en: 'Secondary scoring' },
  'board-control': { fr: 'Contrôle de table', en: 'Board control' },
  mobility: { fr: 'Mobilité', en: 'Mobility' },
  tempo: { fr: 'Tempo', en: 'Tempo' },
  'damage-projection': { fr: 'Projection de dégâts', en: 'Damage projection' },
};

function humanize(value: string): string {
  return value.split('-').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
}

function MissionText({ value }: { value: string }): React.JSX.Element {
  const tokens = value.split(/(<(?:b|u)>.*?<\/(?:b|u)>|\*\*.*?\*\*)/gi);
  return <>{tokens.map((token, index) => {
    const bold = token.match(/^<b>(.*?)<\/b>$/i) ?? token.match(/^\*\*(.*?)\*\*$/);
    if (bold) return <strong key={index}>{bold[1]}</strong>;
    const underline = token.match(/^<u>(.*?)<\/u>$/i);
    if (underline) return <span key={index} style={{ textDecoration: 'underline' }}>{underline[1]}</span>;
    return <span key={index}>{token}</span>;
  })}</>;
}

function ScoreLine({ tier }: { tier: MissionScoreTier }): React.JSX.Element {
  return (
    <li className="mission-score-line">
      <span><MissionText value={tier.text} /></span>
      <strong>{tier.vp} VP</strong>
    </li>
  );
}

function StrategyBrief({ brief, knowledge, locale }: {
  brief: StrategyEvidence & Partial<{ victoryAxes: string[]; scoringWindows: string[] }>;
  knowledge: StrategyKnowledge;
  locale: 'en' | 'fr';
}): React.JSX.Element {
  const sourceTitles = brief.sourceIds
    .map((sourceId) => knowledge.sources.find((source) => source.id === sourceId)?.title ?? sourceId)
    .join(' · ');
  const confidence = brief.confidence === 'high'
    ? (locale === 'fr' ? 'élevée' : 'high')
    : brief.confidence === 'medium'
      ? (locale === 'fr' ? 'moyenne' : 'medium')
      : (locale === 'fr' ? 'limitée' : 'limited');
  const isArchive = brief.sourceTier === 'trusted-archive';
  const axes = brief.victoryAxes ?? [];
  const windows = brief.scoringWindows ?? [];

  return (
    <details className="strategy-brief">
      <summary>
        <span>{locale === 'fr' ? 'Briefing stratégique neutre' : 'Neutral strategy briefing'}</span>
        <span className="strategy-brief__tier">{isArchive ? (locale === 'fr' ? 'Archive GDM' : 'GDM archive') : brief.sourceTier}</span>
      </summary>
      <div className="strategy-brief__content">
        {brief.summary && <p>{brief.summary}</p>}
        {axes.length > 0 && (
          <section>
            <h4>{locale === 'fr' ? 'Axes de victoire' : 'Victory axes'}</h4>
            <ul className="strategy-brief__axes">
              {axes.map((axis) => <li key={axis}>{AXIS_LABELS[axis]?.[locale] ?? axis}</li>)}
            </ul>
          </section>
        )}
        {windows.length > 0 && (
          <section>
            <h4>{locale === 'fr' ? 'Fenêtres de score' : 'Scoring windows'}</h4>
            <ul>{windows.map((window) => <li key={window}>{window}</li>)}</ul>
          </section>
        )}
        <p className="strategy-brief__evidence">
          {locale === 'fr' ? 'Source : ' : 'Source: '}{sourceTitles}
          {' · '}{locale === 'fr' ? 'Confiance : ' : 'Confidence: '}{confidence}.
        </p>
        <section className="strategy-brief__limits">
          <h4>{locale === 'fr' ? 'Limites' : 'Limits'}</h4>
          <ul>{brief.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
        </section>
      </div>
    </details>
  );
}

function PrimaryCard({ card, brief, knowledge, locale }: {
  card: PrimaryMissionCard;
  brief: ReturnType<typeof missionBrief>;
  knowledge: StrategyKnowledge | null;
  locale: 'en' | 'fr';
}): React.JSX.Element {
  const image = missionAssetUrl(card.asset);
  return (
    <article className="mission-reference-card">
      {image && <img src={image} alt={`GDM 2026 — ${card.name}`} loading="lazy" />}
      <div className="mission-reference-card__body">
        <p className="eyebrow">{humanize(card.deck)} · {card.vs ? `vs ${humanize(card.vs)}` : 'Primary'}</p>
        <h3>{card.name}</h3>
        {card.sections.map((section, index) => (
          <section className="mission-rule-section" key={`${section.when}-${index}`}>
            <strong>{section.when}</strong>
            {section.trigger && <small>{section.trigger}</small>}
            <ul>{section.tiers.map((tier, tierIndex) => <ScoreLine key={`${tier.text}-${tierIndex}`} tier={tier} />)}</ul>
          </section>
        ))}
        {brief && knowledge && <StrategyBrief brief={brief} knowledge={knowledge} locale={locale} />}
      </div>
    </article>
  );
}

const SECONDARY_CLAIM_LABELS: Record<string, string> = {
  'scoring-model': 'Rendement tactique', 'list-construction': 'Construction de liste', advantage: 'Opportunité',
  pitfall: 'Mode d’échec', counterplay: 'Contre-jeu', 'play-pattern': 'Séquence', tradeoff: 'Arbitrage', 'decision-rule': 'Décision'
};

export function SecondaryStrategyPanel({ scenarioId, knowledge, locale }: { scenarioId: string; knowledge: StrategyKnowledge; locale: 'en' | 'fr' }): React.JSX.Element | null {
  const guide = secondaryMissionGuide(knowledge, scenarioId);
  if (!guide) return null;
  const claims = claimsForSecondaryMissionGuide(knowledge, guide.id);
  const examples = secondaryDecisionExamplesForGuide(knowledge, guide.id);
  const sourceTitles = guide.sourceIds.map((id) => knowledge.sources.find((source) => source.id === id)?.title ?? id);
  return (
    <details className="strategy-brief secondary-strategy-panel">
      <summary><span>{locale === 'fr' ? 'Analyse tactique détaillée' : 'Detailed tactical analysis (FR)'}</span><span className="strategy-brief__tier">{guide.status}</span></summary>
      <div className="strategy-brief__content">
        {locale === 'en' && <aside className="mission-unavailable"><strong>Contenu canonique français</strong><p>This reviewed strategic content is maintained in French.</p></aside>}
        <section><h4>Capacités requises</h4><ul>{guide.capabilityRequirements.map((entry) => <li key={entry.capability}><code>{entry.capability}</code> · {entry.importance} — {entry.rationale}</li>)}</ul></section>
        <div className="secondary-strategy-panel__claims">{claims.map((claim) => <section key={claim.id}><h4>{SECONDARY_CLAIM_LABELS[claim.kind] ?? claim.kind}</h4><p>{claim.statement}</p><small>{claim.rationale}</small>{claim.counterplay.length > 0 && <p><b>Menaces : </b>{claim.counterplay.join(' ')}</p>}{claim.tradeoffs.length > 0 && <p><b>Arbitrages : </b>{claim.tradeoffs.join(' ')}</p>}</section>)}</div>
        {examples.map((example) => <section className="secondary-strategy-panel__example" key={example.id}><h4>Exemple décisionnel</h4><p>{example.setup.join(' ')}</p><p><b>Décision : </b>{example.decisionPoint}</p><ul>{example.branches.map((branch) => <li key={branch.id}><b>Si {branch.condition}</b> {branch.line}</li>)}</ul></section>)}
        <p className="strategy-brief__evidence">Sources : {sourceTitles.join(' · ')} · confiance {guide.confidence} · revue avant le {guide.reviewBy}.</p>
      </div>
    </details>
  );
}

function SecondaryCard({ card, brief, knowledge, locale }: {
  card: SecondaryMissionCard;
  brief: ReturnType<typeof missionBrief>;
  knowledge: StrategyKnowledge | null;
  locale: 'en' | 'fr';
}): React.JSX.Element {
  const image = missionAssetUrl(card.asset);
  return (
    <article className="mission-reference-card">
      {image && <img src={image} alt={`GDM 2026 — ${card.name}`} loading="lazy" />}
      <div className="mission-reference-card__body">
        <p className="eyebrow">{card.kindLabel ?? 'Secondary Mission'}</p>
        <h3>{card.name}</h3>
        {card.whenDrawn && <p className="mission-when-drawn"><MissionText value={card.whenDrawn} /></p>}
        {card.sections.map((section, index) => (
          <section className="mission-rule-section" key={`${section.chip ?? section.when}-${index}`}>
            <strong>{section.chip ?? section.when}</strong>
            <small>{section.trigger}</small>
            <ul>{section.rows.map((row, rowIndex) => <ScoreLine key={`${row.text}-${rowIndex}`} tier={row} />)}</ul>
          </section>
        ))}
        {brief && knowledge && <StrategyBrief brief={brief} knowledge={knowledge} locale={locale} />}
        {brief && knowledge && <SecondaryStrategyPanel scenarioId={brief.id} knowledge={knowledge} locale={locale} />}
      </div>
    </article>
  );
}

export function SecondaryStrategyLibrary({ strategy, locale }: { strategy: StrategyKnowledge | null; locale: 'en' | 'fr' }): React.JSX.Element {
  const families = secondaryMissionFamilies(strategy);
  const capabilities = [...new Set(families.flatMap((family) => family.capabilityTags))].sort();
  const [capability, setCapability] = useState('');
  if (!strategy || families.length === 0) return <p className="muted">{locale === 'fr' ? 'Aucune analyse secondaire validée.' : 'No reviewed secondary analysis.'}</p>;
  const framework = strategy.secondaryMissionFrameworks.find((entry) => entry.status === 'reviewed' || entry.status === 'published');
  return <section className="secondary-strategy-library">
    {locale === 'en' && <aside className="mission-unavailable"><strong>Contenu canonique français</strong><p>The reviewed secondary mission knowledge is currently maintained in French.</p></aside>}
    {framework && <article className="mission-guide"><h3>Gestion du portefeuille actif</h3><p>Deux nouvelles cartes sont piochées à chaque phase de Commandement. Les cartes non accomplies et non défaussées restent actives : comparez leurs horizons et leur concurrence pour les mêmes unités.</p><p><b>Décisions : </b>conserver active · défausser en fin de son tour pour 1 PC · remplacement immédiat à 1 PC une fois par bataille.</p></article>}
    <div className="mission-library-controls"><label>Filtre de capacité<select value={capability} onChange={(event) => setCapability(event.target.value)}><option value="">Toutes</option>{capabilities.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label></div>
    {families.filter((family) => !capability || family.capabilityTags.includes(capability as never)).map((family) => {
      const familyClaims = strategy.tacticalClaims.filter((claim) => family.claimIds.includes(claim.id) && (claim.status === 'reviewed' || claim.status === 'published'));
      return <article className="mission-guide" key={family.id}><h3>{family.title}</h3><p><b>Capacités : </b>{family.capabilityTags.join(' · ')}</p>{familyClaims.map((claim) => <p key={claim.id}>{claim.statement}</p>)}<ul>{family.scenarioIds.map((id) => <li key={id}>{strategy.scenarios.find((entry) => entry.id === id)?.title.replace(/ — briefing GDM$/, '')}</li>)}</ul></article>;
    })}
  </section>;
}

function Layouts({ pack, strategy, locale }: { pack: MissionPack; strategy: StrategyKnowledge | null; locale: 'en' | 'fr' }): React.JSX.Element {
  const matchups = pack.cards?.layouts ?? [];
  const [selectedSourcePath, setSelectedSourcePath] = useState(matchups[0]?.sourcePath ?? '');
  const [showMeasurements, setShowMeasurements] = useState(false);
  const selected = matchups.find((matchup) => matchup.sourcePath === selectedSourcePath) ?? matchups[0];
  const brief = selected && strategy ? layoutContextBrief(strategy, pack.id, selected.sourcePath) : null;

  if (!selected) return <p className="muted">{locale === 'fr' ? 'Aucun layout de terrain n’a été importé.' : 'No terrain layout was imported.'}</p>;
  return (
    <section className="mission-layout-library">
      <div className="mission-library-controls">
        <label>
          {locale === 'fr' ? 'Confrontation des dispositions' : 'Layout matchup'}
          <select value={selected.sourcePath} onChange={(event) => setSelectedSourcePath(event.target.value)}>
            {matchups.map((matchup) => <option key={matchup.sourcePath} value={matchup.sourcePath}>{matchup.sourcePath.replace('/11th/layouts/', '').replaceAll('/', ' vs ')}</option>)}
          </select>
        </label>
        <label className="mission-checkbox"><input type="checkbox" checked={showMeasurements} onChange={(event) => setShowMeasurements(event.target.checked)} /> {locale === 'fr' ? 'Afficher les mesures' : 'Show measurements'}</label>
      </div>
      {brief && strategy && <StrategyBrief brief={brief} knowledge={strategy} locale={locale} />}
      <div className="mission-layout-grid">
        {selected.layouts.map((layout) => (
          <figure key={layout.number} className="mission-layout-card">
            <img src={missionAssetUrl(showMeasurements ? layout.measurementsImage : layout.image) ?? undefined} alt={`${layout.name} — ${selected.sourcePath}`} loading="lazy" />
            <figcaption>{layout.name}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function GuideLibrary({ pack, strategy, locale, selectedGuideId, onSelectGuide }: { pack: MissionPack; strategy: StrategyKnowledge | null; locale: 'en' | 'fr'; selectedGuideId: string; onSelectGuide: (id: string) => void }): React.JSX.Element {
  const guides = matchupGuides(strategy);
  const selected = guides.find((guide) => guide.id === selectedGuideId) ?? guides[0];
  if (!strategy || !selected) return <p className="muted">{locale === 'fr' ? 'Aucun guide validé.' : 'No validated guide.'}</p>;
  const claims = claimsForGuide(strategy, selected.id);
  const example = workedExampleForGuide(strategy, selected.id);
  const layoutContext = strategy.layoutContexts.find((entry) => entry.id === selected.layoutContextId);
  const layout = pack.cards?.layouts.find((entry) => entry.sourcePath === layoutContext?.sourcePath)?.layouts.find((entry) => entry.number === selected.selectedLayoutId);
  const sideLabel = (side: StrategyMatchupGuide['sides'][number]) => strategy.forceDispositions.find((entry) => entry.id === side.forceDispositionId)?.title ?? side.forceDispositionId;
  const sideClaims = (side: 'alpha' | 'beta' | 'global') => claims.filter((claim) => claim.side === side);
  return (
    <section className="mission-guide-library">
      {locale === 'en' && <aside className="mission-unavailable"><strong>French canonical content</strong><p>The strategic guide is currently reviewed and maintained in French.</p></aside>}
      <div className="mission-library-controls"><label>{locale === 'fr' ? 'Guide spécialisé' : 'Specialist guide'}<select value={selected.id} onChange={(event) => onSelectGuide(event.target.value)}>{guides.map((guide) => <option key={guide.id} value={guide.id}>{guide.title}</option>)}</select></label></div>
      <article className="mission-guide">
        <header><span className="eyebrow">GUIDE {guides.indexOf(selected) + 1}/15 · INFÉRENCE SOURCÉE</span><h3>{selected.title}</h3><p>{selected.overview}</p></header>
        {layout && <figure className="mission-guide__layout"><img src={missionAssetUrl(layout.measurementsImage ?? layout.image) ?? undefined} alt={`${selected.title} — ${layout.name}`} loading="lazy" /><figcaption>{layout.name}</figcaption></figure>}
        <div className="mission-guide__sides">{selected.sides.map((side) => <section key={side.side}><h4>{sideLabel(side)}</h4><p className="muted">{strategy.scenarios.find((entry) => entry.id === side.scenarioId)?.title}</p>{sideClaims(side.side).map((claim) => <article className="mission-guide__claim" key={claim.id}><strong>{claim.title}</strong><p>{claim.statement}</p><small>{claim.rationale}</small>{claim.counterplay.length > 0 && <p><b>Contre-jeu : </b>{claim.counterplay.join(' ')}</p>}</article>)}{side.referenceRosterIds.length > 0 && <div className="strategy-reference-roster"><strong>Listes validées</strong><span>{side.referenceRosterIds.map((id) => strategy.referenceRosters.find((roster) => roster.id === id)?.title ?? id).join(' · ')}</span></div>}</section>)}</div>
        <section><h4>Analyse globale</h4>{sideClaims('global').map((claim) => <article className="mission-guide__claim" key={claim.id}><strong>{claim.title}</strong><p>{claim.statement}</p><small>{claim.rationale}</small></article>)}</section>
        {example && <section><h4>Exemple pédagogique — primaire uniquement</h4><p className="muted">{example.assumptions.join(' ')}</p><div className="mission-matrix-scroll"><table className="mission-matrix"><thead><tr><th>Round</th><th>{sideLabel(selected.sides[0])}</th><th>{sideLabel(selected.sides[1])}</th></tr></thead><tbody>{example.rounds.map((round) => <tr key={round.round}><th>{round.round}</th><td>{round.turns[0].roundTotal} VP · cumul {round.turns[0].cumulativeTotal}</td><td>{round.turns[1].roundTotal} VP · cumul {round.turns[1].cumulativeTotal}</td></tr>)}</tbody><tfoot><tr><th>Final</th><td>{example.finalScores.alpha} VP</td><td>{example.finalScores.beta} VP</td></tr></tfoot></table></div></section>}
        <p className="strategy-brief__evidence">Archive GDM approuvée pour le contexte de mission · règles officielles pour le cadre événementiel · conseils classés comme inférences.</p>
      </article>
    </section>
  );
}

function Matrix({ pack, strategy, locale, onOpenGuide }: { pack: MissionPack; strategy: StrategyKnowledge | null; locale: 'en' | 'fr'; onOpenGuide: (guideId: string) => void }): React.JSX.Element {
  const cards = pack.cards?.primary ?? [];
  const decks = [...new Set(cards.map((card) => card.deck))].sort();
  return (
    <div className="mission-matrix-scroll">
      <table className="mission-matrix">
        <caption>{locale === 'fr' ? 'Matrice des dispositions des forces' : 'Force Disposition Matrix'}</caption>
        <thead><tr><th scope="col">{locale === 'fr' ? 'Votre disposition' : 'Your disposition'}</th>{decks.map((deck) => <th key={deck} scope="col">vs {humanize(deck)}</th>)}</tr></thead>
        <tbody>{decks.map((deck) => <tr key={deck}><th scope="row">{humanize(deck)}</th>{decks.map((opponent) => {
          const card = cards.find((entry) => entry.deck === deck && entry.vs === opponent);
          const guide = matchupGuideForDispositions(strategy, deck, opponent);
          return <td key={opponent}>{guide ? <button className="mission-matrix__guide-link" type="button" onClick={() => onOpenGuide(guide.id)}>{card?.name ?? '—'}</button> : (card?.name ?? '—')}</td>;
        })}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function MissionLibrary({ pack, strategy, locale }: { pack: MissionPack; strategy: StrategyKnowledge | null; locale: 'en' | 'fr' }): React.JSX.Element {
  const hasCards = pack.cards && pack.cards.primary.length > 0;
  const [section, setSection] = useState<LibrarySection>('primary');
  const [selectedGuideId, setSelectedGuideId] = useState('');
  const primaryCards = useMemo(() => [...(pack.cards?.primary ?? [])].sort((left, right) => left.name.localeCompare(right.name)), [pack.cards]);
  const secondaryCards = useMemo(() => [...(pack.cards?.secondary ?? [])].sort((left, right) => left.name.localeCompare(right.name)), [pack.cards]);

  if (!hasCards) return <aside className="mission-unavailable"><strong>{locale === 'fr' ? 'Cartes détaillées non intégrées' : 'Detailed cards are not integrated'}</strong><p>{pack.unavailableNotice}</p></aside>;

  const labels: Record<LibrarySection, string> = locale === 'fr'
    ? { primary: 'Missions principales', secondary: 'Secondaires', 'secondary-strategy': 'Analyse secondaires', dispositions: 'Dispositions', layouts: 'Layouts', matrix: 'Matrice', guides: 'Guides' }
    : { primary: 'Primary missions', secondary: 'Secondary missions', 'secondary-strategy': 'Secondary strategy (FR)', dispositions: 'Dispositions', layouts: 'Layouts', matrix: 'Matrix', guides: 'Guides (FR)' };

  return (
    <section className="mission-library" aria-label={locale === 'fr' ? 'Bibliothèque de missions' : 'Mission library'}>
      <div className="mission-library-tabs" role="tablist" aria-label={locale === 'fr' ? 'Catégories de missions' : 'Mission categories'}>
        {(Object.keys(labels) as LibrarySection[]).map((entry) => <button key={entry} type="button" role="tab" aria-selected={section === entry} className={section === entry ? 'active' : ''} onClick={() => setSection(entry)}>{labels[entry]}</button>)}
      </div>
      {section === 'primary' && <div className="mission-reference-grid">{primaryCards.map((card) => <PrimaryCard key={card.sourcePath} card={card} brief={missionBrief(strategy, pack.id, card.sourcePath)} knowledge={strategy} locale={locale} />)}</div>}
      {section === 'secondary' && <div className="mission-reference-grid">{secondaryCards.map((card) => <SecondaryCard key={card.sourcePath} card={card} brief={missionBrief(strategy, pack.id, card.sourcePath)} knowledge={strategy} locale={locale} />)}</div>}
      {section === 'secondary-strategy' && <SecondaryStrategyLibrary strategy={strategy} locale={locale} />}
      {section === 'dispositions' && <div className="mission-disposition-grid">{pack.cards?.forceDispositions.map((card) => {
        const brief = strategy ? forceDispositionBrief(strategy, pack.id, card.sourcePath) : null;
        return <div key={card.sourcePath} className="mission-disposition-entry"><figure className="mission-layout-card">{missionAssetUrl(card.asset) && <img src={missionAssetUrl(card.asset) ?? undefined} alt={card.title ?? card.sourcePath} loading="lazy" />}<figcaption>{card.title?.replace(' - 11th Edition | GDM 2026', '') ?? card.sourcePath}</figcaption></figure>{brief && strategy && <StrategyBrief brief={brief} knowledge={strategy} locale={locale} />}</div>;
      })}</div>}
      {section === 'layouts' && <Layouts pack={pack} strategy={strategy} locale={locale} />}
      {section === 'matrix' && <Matrix pack={pack} strategy={strategy} locale={locale} onOpenGuide={(guideId) => { setSelectedGuideId(guideId); setSection('guides'); }} />}
      {section === 'guides' && <GuideLibrary pack={pack} strategy={strategy} locale={locale} selectedGuideId={selectedGuideId} onSelectGuide={setSelectedGuideId} />}
    </section>
  );
}
