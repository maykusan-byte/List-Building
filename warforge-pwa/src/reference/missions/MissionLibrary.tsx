import { useMemo, useState } from 'react';
import { missionAssetUrl } from '../../domain/mission-packs';
import type { MissionPack, MissionScoreTier, PrimaryMissionCard, SecondaryMissionCard } from '../../domain/mission-packs';

type LibrarySection = 'primary' | 'secondary' | 'dispositions' | 'layouts' | 'matrix';

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

function PrimaryCard({ card }: { card: PrimaryMissionCard }): React.JSX.Element {
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
      </div>
    </article>
  );
}

function SecondaryCard({ card }: { card: SecondaryMissionCard }): React.JSX.Element {
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
      </div>
    </article>
  );
}

function Layouts({ pack, locale }: { pack: MissionPack; locale: 'en' | 'fr' }): React.JSX.Element {
  const matchups = pack.cards?.layouts ?? [];
  const [selectedSourcePath, setSelectedSourcePath] = useState(matchups[0]?.sourcePath ?? '');
  const [showMeasurements, setShowMeasurements] = useState(false);
  const selected = matchups.find((matchup) => matchup.sourcePath === selectedSourcePath) ?? matchups[0];

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

function Matrix({ pack, locale }: { pack: MissionPack; locale: 'en' | 'fr' }): React.JSX.Element {
  const cards = pack.cards?.primary ?? [];
  const decks = [...new Set(cards.map((card) => card.deck))].sort();
  return (
    <div className="mission-matrix-scroll">
      <table className="mission-matrix">
        <caption>{locale === 'fr' ? 'Matrice des dispositions des forces' : 'Force Disposition Matrix'}</caption>
        <thead><tr><th scope="col">{locale === 'fr' ? 'Votre disposition' : 'Your disposition'}</th>{decks.map((deck) => <th key={deck} scope="col">vs {humanize(deck)}</th>)}</tr></thead>
        <tbody>{decks.map((deck) => <tr key={deck}><th scope="row">{humanize(deck)}</th>{decks.map((opponent) => {
          const card = cards.find((entry) => entry.deck === deck && entry.vs === opponent);
          return <td key={opponent}>{card?.name ?? '—'}</td>;
        })}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function MissionLibrary({ pack, locale }: { pack: MissionPack; locale: 'en' | 'fr' }): React.JSX.Element {
  const hasCards = pack.cards && pack.cards.primary.length > 0;
  const [section, setSection] = useState<LibrarySection>('primary');
  const primaryCards = useMemo(() => [...(pack.cards?.primary ?? [])].sort((left, right) => left.name.localeCompare(right.name)), [pack.cards]);
  const secondaryCards = useMemo(() => [...(pack.cards?.secondary ?? [])].sort((left, right) => left.name.localeCompare(right.name)), [pack.cards]);

  if (!hasCards) return <aside className="mission-unavailable"><strong>{locale === 'fr' ? 'Cartes détaillées non intégrées' : 'Detailed cards are not integrated'}</strong><p>{pack.unavailableNotice}</p></aside>;

  const labels: Record<LibrarySection, string> = locale === 'fr'
    ? { primary: 'Missions principales', secondary: 'Secondaires', dispositions: 'Dispositions', layouts: 'Layouts', matrix: 'Matrice' }
    : { primary: 'Primary missions', secondary: 'Secondary missions', dispositions: 'Dispositions', layouts: 'Layouts', matrix: 'Matrix' };

  return (
    <section className="mission-library" aria-label={locale === 'fr' ? 'Bibliothèque de missions' : 'Mission library'}>
      <div className="mission-library-tabs" role="tablist" aria-label={locale === 'fr' ? 'Catégories de missions' : 'Mission categories'}>
        {(Object.keys(labels) as LibrarySection[]).map((entry) => <button key={entry} type="button" role="tab" aria-selected={section === entry} className={section === entry ? 'active' : ''} onClick={() => setSection(entry)}>{labels[entry]}</button>)}
      </div>
      {section === 'primary' && <div className="mission-reference-grid">{primaryCards.map((card) => <PrimaryCard key={card.sourcePath} card={card} />)}</div>}
      {section === 'secondary' && <div className="mission-reference-grid">{secondaryCards.map((card) => <SecondaryCard key={card.sourcePath} card={card} />)}</div>}
      {section === 'dispositions' && <div className="mission-disposition-grid">{pack.cards?.forceDispositions.map((card) => <figure key={card.sourcePath} className="mission-layout-card">{missionAssetUrl(card.asset) && <img src={missionAssetUrl(card.asset) ?? undefined} alt={card.title ?? card.sourcePath} loading="lazy" />}<figcaption>{card.title?.replace(' - 11th Edition | GDM 2026', '') ?? card.sourcePath}</figcaption></figure>)}</div>}
      {section === 'layouts' && <Layouts pack={pack} locale={locale} />}
      {section === 'matrix' && <Matrix pack={pack} locale={locale} />}
    </section>
  );
}
