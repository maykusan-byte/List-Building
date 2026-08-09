
import { useEffect, useState } from 'react';
import type { NormalizedDatabase } from '../../domain/types';
import { detachmentBrief, detachmentSynergies, loadStrategyKnowledge, unitBriefs, unitSynergies } from '../../domain/strategy-knowledge';
import type { StrategyAxisRating, StrategyDetachmentProfile, StrategyKnowledge, StrategySynergy, StrategyUnitProfile } from '../../domain/strategy-knowledge';
import { StratagemCard, EnhancementCard } from '../components';

export interface ReferenceFactionsPageProps {
  database: NormalizedDatabase | null;
  locale: 'en' | 'fr';
}

const AXIS_LABELS: Record<string, { fr: string; en: string }> = {
  'primary-scoring': { fr: 'Score principal', en: 'Primary scoring' },
  'secondary-scoring': { fr: 'Score secondaire', en: 'Secondary scoring' },
  'board-control': { fr: 'Contrôle de table', en: 'Board control' },
  tempo: { fr: 'Tempo', en: 'Tempo' },
  mobility: { fr: 'Mobilité', en: 'Mobility' },
  durability: { fr: 'Endurance', en: 'Durability' },
  'damage-projection': { fr: 'Projection de dégâts', en: 'Damage projection' },
  'resource-efficiency': { fr: 'Efficience des ressources', en: 'Resource efficiency' },
  denial: { fr: 'Déni', en: 'Denial' },
  trading: { fr: 'Échanges', en: 'Trading' }
};

const ROLE_LABELS: Record<string, { fr: string; en: string }> = {
  'charge-insertion': { fr: 'Insertion en charge', en: 'Charge insertion' },
  'post-combat-repositioning': { fr: 'Redéploiement après combat', en: 'Post-combat repositioning' },
  'plasma-amplification': { fr: 'Amplification plasma', en: 'Plasma amplification' },
  'overwatch-deterrence': { fr: 'Dissuasion par tir en état d’alerte', en: 'Overwatch deterrence' },
  'movement-denial': { fr: 'Frein au mouvement adverse', en: 'Movement denial' },
  'character-led-assault': { fr: 'Assaut mené par un personnage', en: 'Character-led assault' },
  'advance-and-charge': { fr: 'Avance et charge', en: 'Advance and charge' },
  'character-protection': { fr: 'Protection de personnage', en: 'Character protection' },
  'objective-anchor': { fr: 'Ancrage d’objectif', en: 'Objective anchor' },
  'order-enabled-durability': { fr: 'Endurance soutenue par les ordres', en: 'Order-enabled durability' },
  'reactive-repositioning': { fr: 'Redéploiement réactif', en: 'Reactive repositioning' },
  'pre-game-board-presence': { fr: 'Présence de table avant la partie', en: 'Pre-game board presence' },
  'boyz-pressure': { fr: 'Pression des Boyz', en: 'Boyz pressure' },
  'screen-pressure': { fr: 'Pression par écrans', en: 'Screen pressure' },
  'action-enabled-scoring': { fr: 'Action compatible avec le score', en: 'Action-enabled scoring' },
  'objective-security': { fr: 'Sécurisation d’objectif', en: 'Objective security' },
  'stealth-survivability': { fr: 'Survie sous cachette', en: 'Stealth survivability' },
  'psyker-supported-firepower': { fr: 'Puissance de feu soutenue par Psyker', en: 'Psyker-supported firepower' },
  'aura-coordination': { fr: 'Coordination par auras', en: 'Aura coordination' },
  'objective-pressure': { fr: 'Pression sur objectif', en: 'Objective pressure' },
  'fly-charge-insertion': { fr: 'Insertion VOL en charge', en: 'Fly charge insertion' },
  'plasma-pressure': { fr: 'Pression plasma', en: 'Plasma pressure' },
  'reactive-movement-denial': { fr: 'Frein de mouvement réactif', en: 'Reactive movement denial' },
  'character-charge-access': { fr: 'Accès à la charge de personnage', en: 'Character charge access' },
  'character-triggered-offense': { fr: 'Offensive déclenchée par personnage', en: 'Character-triggered offense' },
  'abhuman-objective-hold': { fr: 'Maintien abhumain sur objectif', en: 'Abhuman objective holding' },
  'abhuman-order-support': { fr: 'Relais d’ordre abhumain', en: 'Abhuman order support' },
  'character-support': { fr: 'Soutien de personnage', en: 'Character support' },
  'scout-screening': { fr: 'Écran d’éclaireur', en: 'Scout screening' },
  'hidden-unit-offense': { fr: 'Offensive d’unité cachée', en: 'Hidden-unit offense' },
  'action-with-fire-support': { fr: 'Action compatible avec le tir', en: 'Action with fire support' },
  'secured-objective-support': { fr: 'Soutien de sécurisation d’objectif', en: 'Secured-objective support' },
  'hidden-unit-resilience': { fr: 'Résilience d’unité cachée', en: 'Hidden-unit resilience' },
  'detection-support': { fr: 'Soutien de détection', en: 'Detection support' },
  'psyker-linked-firepower': { fr: 'Puissance de feu reliée au Psyker', en: 'Psyker-linked firepower' },
  'robot-support-anchor': { fr: 'Relais de soutien robotique', en: 'Robot support anchor' },
  'psyker-positioning': { fr: 'Positionnement Psyker', en: 'Psyker positioning' }
};

const EVIDENCE_KIND_LABELS: Record<StrategySynergy['evidenceKind'], { fr: string; en: string }> = {
  'rules-supported': { fr: 'règles officielles à l’appui', en: 'official rules support' },
  tested: { fr: 'testée', en: 'tested' },
  hypothesis: { fr: 'hypothèse', en: 'hypothesis' }
};

function strategySourceTitles(knowledge: StrategyKnowledge, sourceIds: string[]): string {
  return [...new Set([...sourceIds, knowledge.catalogProvenanceSourceId])]
    .map((id) => knowledge.sources.find((source) => source.id === id)?.title ?? id)
    .join(' · ');
}

function AxisRatings({ ratings, locale }: { ratings: StrategyAxisRating[]; locale: 'en' | 'fr' }): React.JSX.Element {
  return (
    <ul className="strategy-axis-ratings">
      {ratings.map((rating) => (
        <li key={rating.axis}>
          <strong>{AXIS_LABELS[rating.axis]?.[locale] ?? rating.axis} · {rating.score}/4</strong>
          <span>{rating.basis}</span>
        </li>
      ))}
    </ul>
  );
}

function SynergyBrief({ synergy, locale }: { synergy: StrategySynergy; locale: 'en' | 'fr' }): React.JSX.Element {
  return (
    <article className="strategy-synergy">
      <h5>{synergy.title}</h5>
      <p>{synergy.claim}</p>
      <div className="strategy-synergy__columns">
        <section>
          <h6>{locale === 'fr' ? 'Préconditions' : 'Preconditions'}</h6>
          <ul>{synergy.preconditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>
        </section>
        <section>
          <h6>{locale === 'fr' ? 'Contre-jeu' : 'Counterplay'}</h6>
          <ul>{synergy.counterplay.map((counter) => <li key={counter}>{counter}</li>)}</ul>
        </section>
        <section>
          <h6>{locale === 'fr' ? 'Compromis' : 'Trade-offs'}</h6>
          <ul>{synergy.tradeoffs.map((tradeoff) => <li key={tradeoff}>{tradeoff}</li>)}</ul>
        </section>
      </div>
      <p><strong>{locale === 'fr' ? 'Timing : ' : 'Timing: '}</strong>{synergy.timing}</p>
      <AxisRatings ratings={synergy.axisEffects} locale={locale} />
      <p className="strategy-brief__evidence">{locale === 'fr' ? 'Niveau de preuve : ' : 'Evidence: '}{EVIDENCE_KIND_LABELS[synergy.evidenceKind][locale]} · {locale === 'fr' ? 'Révision : ' : 'Review: '}{synergy.reviewBy}</p>
      <ul className="strategy-brief__limits">{synergy.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
    </article>
  );
}

function DetachmentStrategyBrief({ profile, synergies, knowledge, locale }: {
  profile: StrategyDetachmentProfile;
  synergies: StrategySynergy[];
  knowledge: StrategyKnowledge;
  locale: 'en' | 'fr';
}): React.JSX.Element {
  const sourceTitles = strategySourceTitles(knowledge, profile.sourceIds);
  return (
    <details className="strategy-brief strategy-detachment-brief">
      <summary>
        <span>{locale === 'fr' ? 'Analyse stratégique sourcée' : 'Sourced strategy analysis'}</span>
        <span className="strategy-brief__tier">{locale === 'fr' ? 'Inférence sourcée' : 'Sourced inference'}</span>
      </summary>
      <div className="strategy-brief__content">
        <p>{profile.rationale}</p>
        <section>
          <h4>{locale === 'fr' ? 'Rôles' : 'Roles'}</h4>
          <ul className="strategy-brief__axes">{profile.roles.map((role) => <li key={role}>{ROLE_LABELS[role]?.[locale] ?? role.replaceAll('-', ' ')}</li>)}</ul>
        </section>
        <section>
          <h4>{locale === 'fr' ? 'Contribution aux axes' : 'Axis contribution'}</h4>
          <AxisRatings ratings={profile.axisRatings} locale={locale} />
        </section>
        <section>
          <h4>{locale === 'fr' ? 'Préconditions' : 'Preconditions'}</h4>
          <ul>{profile.preconditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>
        </section>
        {synergies.length > 0 && (
          <section className="strategy-synergy-list">
            <h4>{locale === 'fr' ? 'Interactions validées' : 'Reviewed interactions'}</h4>
            {synergies.map((synergy) => <SynergyBrief key={synergy.id} synergy={synergy} locale={locale} />)}
          </section>
        )}
        <p className="strategy-brief__evidence">
          {locale === 'fr' ? 'Sources : ' : 'Sources: '}{sourceTitles} · {locale === 'fr' ? 'Pages : ' : 'Pages: '}{profile.sourcePages.join(', ')} · {locale === 'fr' ? 'Révision : ' : 'Review: '}{profile.reviewBy}.
        </p>
        <section className="strategy-brief__limits">
          <h4>{locale === 'fr' ? 'Limites' : 'Limits'}</h4>
          <ul>{profile.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
        </section>
      </div>
    </details>
  );
}

function UnitStrategyBrief({ profile, synergies, knowledge, locale }: {
  profile: StrategyUnitProfile;
  synergies: StrategySynergy[];
  knowledge: StrategyKnowledge;
  locale: 'en' | 'fr';
}): React.JSX.Element {
  const sourceTitles = strategySourceTitles(knowledge, profile.sourceIds);
  const detachmentTitles = profile.detachmentProfileIds.map((id) => knowledge.detachmentProfiles.find((detachment) => detachment.id === id)?.title ?? id);
  return (
    <details className="strategy-brief strategy-unit-brief">
      <summary>
        <span>{locale === 'fr' ? 'Rôle stratégique sourcé' : 'Sourced strategic role'}</span>
        <span className="strategy-brief__tier">{locale === 'fr' ? 'Inférence conditionnelle' : 'Conditional inference'}</span>
      </summary>
      <div className="strategy-brief__content">
        <p>{profile.rationale}</p>
        <section>
          <h5>{locale === 'fr' ? 'Applicable dans' : 'Applies in'}</h5>
          <ul className="strategy-brief__axes">{detachmentTitles.map((title) => <li key={title}>{title}</li>)}</ul>
        </section>
        <section>
          <h5>{locale === 'fr' ? 'Rôles dans ces détachements' : 'Roles in these detachments'}</h5>
          <ul className="strategy-brief__axes">{profile.roles.map((role) => <li key={role}>{ROLE_LABELS[role]?.[locale] ?? role.replaceAll('-', ' ')}</li>)}</ul>
        </section>
        <section>
          <h5>{locale === 'fr' ? 'Contribution aux axes' : 'Axis contribution'}</h5>
          <AxisRatings ratings={profile.axisRatings} locale={locale} />
        </section>
        <section>
          <h5>{locale === 'fr' ? 'Préconditions' : 'Preconditions'}</h5>
          <ul>{profile.preconditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>
        </section>
        {synergies.length > 0 && (
          <section>
            <h5>{locale === 'fr' ? 'Interactions revues' : 'Reviewed interactions'}</h5>
            <ul>{synergies.map((synergy) => <li key={synergy.id}>{synergy.title}</li>)}</ul>
          </section>
        )}
        <p className="strategy-brief__evidence">{locale === 'fr' ? 'Sources : ' : 'Sources: '}{sourceTitles} · {locale === 'fr' ? 'Pages : ' : 'Pages: '}{profile.sourcePages.join(', ')} · {locale === 'fr' ? 'Révision : ' : 'Review: '}{profile.reviewBy}.</p>
        <section className="strategy-brief__limits">
          <h5>{locale === 'fr' ? 'Limites' : 'Limits'}</h5>
          <ul>{profile.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
        </section>
      </div>
    </details>
  );
}

export function ReferenceFactionsPage({ database, locale }: ReferenceFactionsPageProps) {
  const [selectedFactionId, setSelectedFactionId] = useState<string | null>(null);
  const [selectedDetachmentId, setSelectedDetachmentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'detachments' | 'units'>('detachments');
  const [strategy, setStrategy] = useState<StrategyKnowledge | null>(null);

  useEffect(() => {
    let active = true;
    void loadStrategyKnowledge().then((knowledge) => {
      if (active) setStrategy(knowledge);
    });
    return () => { active = false; };
  }, []);

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
  const activeProfile = activeDetachment ? detachmentBrief(strategy, activeDetachment.id) : null;
  const activeSynergies = activeDetachment ? detachmentSynergies(strategy, activeDetachment.id) : [];

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
                  {activeProfile && strategy && <DetachmentStrategyBrief profile={activeProfile} synergies={activeSynergies} knowledge={strategy} locale={locale} />}
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
          {factionUnits.map((unit) => {
            const profiles = unitBriefs(strategy, unit.id);
            const synergies = unitSynergies(strategy, unit.id);
            return (
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
              {strategy && profiles.map((profile) => <UnitStrategyBrief key={profile.id} profile={profile} synergies={synergies} knowledge={strategy} locale={locale} />)}
            </div>
            );
          })}
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
