
import { SCENARIOS } from '../../domain/scenarios';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NormalizedDatabase, NormalizedDetachment } from '../../domain/types';
import type { CatalogLocalization } from '../../domain/catalog-localization';
import { getDetachmentCost } from "../../domain/calculations";
import {
  shuffleArray,

  sanitizeStratagemCategoryForQuiz,
  sanitizeStratagemTextForQuiz
} from '../learning-utils';

export interface StratagemsQuizProps {
  database: NormalizedDatabase;
  display: CatalogLocalization;
  isFrench: boolean;
  eligibleDetachments: NormalizedDetachment[];
  onAdvance: () => void;
  onScoreUpdate: (isCorrect: boolean) => void;
}

export function StratagemsQuiz({
  database,
  display,
  isFrench,
  eligibleDetachments,
  onAdvance,
  onScoreUpdate
}: StratagemsQuizProps) {
  const { t } = useTranslation();
  const [turn, setTurn] = useState<number>(0);
  const [failedSchedule, setFailedSchedule] = useState<any[]>([]);
  const [stratSeedIndex, setStratSeedIndex] = useState<number>(() => Math.floor(Math.random() * 100000));
  const [lastCorrect, setLastCorrect] = useState(false);
  const [selectedStratagemChoice, setSelectedStratagemChoice] = useState<string | null>(null);
  const [selectedStratagemNames, setSelectedStratagemNames] = useState<Set<string>>(new Set());
  const [selectedCost, setSelectedCost] = useState<number | null>(null);
  const [selectedForceDisposition, setSelectedForceDisposition] = useState<string | null>(null);
  const [inspectedStratagem, setInspectedStratagem] = useState<{
    Name?: string;
    Category?: string;
    CPCost?: number;
    Phase?: string;
    When?: string;
    Target?: string;
    Effect?: string;
  } | null>(null);
  const [stratChecked, setStratChecked] = useState<boolean>(false);

  const stratagemQuestion = useMemo<any>(() => {
    if (eligibleDetachments.length === 0) return null;
    const scheduled = failedSchedule.find((s: any) => s.turn === turn);
    if (scheduled) return scheduled.q as any;
    
    // Choose the question type: 'identify-detachment' or 'select-stratagems'
    const isIdentify = (Math.abs(stratSeedIndex) % 2) === 0;

    if (isIdentify) {
      // identify-detachment: Show a single stratagem and ask which detachment it belongs to
      const allStrats = eligibleDetachments.flatMap((d) =>
        (d.Stratagems ?? []).map((s: any) => ({ strat: s, detachment: d }))
      );
      if (allStrats.length === 0) return null;
      
      const targetPair = allStrats[Math.abs(stratSeedIndex) % allStrats.length];
      const otherDets = eligibleDetachments.filter((d) => d.id !== targetPair.detachment.id);
      const choices = shuffleArray(otherDets).slice(0, 3);
      
      return {
        type: 'identify-detachment' as const,
        targetStratagem: targetPair.strat,
        correctDetachment: targetPair.detachment,
        choices: shuffleArray([targetPair.detachment, ...choices])
      };
    } else {
      // select-stratagems: Show a detachment and ask to select its stratagems, cost, and FD
      const targetDet = eligibleDetachments[Math.abs(stratSeedIndex) % eligibleDetachments.length];
      const correctStrats = targetDet.Stratagems ?? [];
      
      const distractors = eligibleDetachments
        .filter((d) => d.id !== targetDet.id)
        .flatMap((d) => d.Stratagems ?? []);
        
      const numDistractors = Math.max(2, 6 - correctStrats.length);
      const chosenDistractors = shuffleArray(distractors).slice(0, numDistractors);
      
      return {
        type: 'select-stratagems' as const,
        targetDetachment: targetDet,
        correctStratagems: correctStrats,
        proposedStratagems: shuffleArray([...correctStrats, ...chosenDistractors])
      };
    }
  }, [eligibleDetachments, stratSeedIndex]);

  const validDetachmentIds = useMemo(() => {
    if (!stratagemQuestion || stratagemQuestion.type !== 'identify-detachment') return new Set<string>();
    const targetName = (stratagemQuestion.targetStratagem.Name ?? '').toUpperCase().trim();
    const validIds = new Set<string>();
    for (const choice of stratagemQuestion.choices) {
      const hasStrat = (choice.Stratagems ?? []).some(
        (s: any) => (s.Name ?? '').toUpperCase().trim() === targetName
      );
      if (hasStrat) {
        validIds.add(choice.id);
      }
    }
    return validIds;
  }, [stratagemQuestion]);

  const handleVerifyStrat = () => {
    if (!stratagemQuestion || stratChecked) return;
    setStratChecked(true);

    let isSuccess = false;
    if (stratagemQuestion.type === 'identify-detachment') {
      isSuccess = selectedStratagemChoice !== null && validDetachmentIds.has(selectedStratagemChoice);
    } else {
      const correctSet = new Set(stratagemQuestion.correctStratagems.map((s: any) => (s.Name ?? '').toUpperCase().trim()));
      const selectedSet = new Set([...selectedStratagemNames].map((s: any) => s.toUpperCase().trim()));
      const stratagemsSuccess = correctSet.size === selectedSet.size && [...correctSet].every((s: any) => selectedSet.has(s));

      const targetCost = getDetachmentCost(stratagemQuestion.targetDetachment);
      const costSuccess = selectedCost === targetCost;

      const targetFd = stratagemQuestion.targetDetachment.ForceDispositions ?? [];
      const expectedFd = (targetFd.length === 0 ? 'ALL' : targetFd[0]).toUpperCase().trim();
      const fdSuccess = selectedForceDisposition !== null && selectedForceDisposition.toUpperCase().trim() === expectedFd;

      isSuccess = stratagemsSuccess && costSuccess && fdSuccess;
    }

    onScoreUpdate(isSuccess);
  };

  const handleNextStrat = () => {
    setSelectedStratagemChoice(null);
    setSelectedStratagemNames(new Set());
    setSelectedCost(null);
    setSelectedForceDisposition(null);
    setInspectedStratagem(null);
    setStratChecked(false);
    setStratSeedIndex(Math.floor(Math.random() * 100000));
    onAdvance();
  };

  if (!stratagemQuestion) {
    return (
      <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }}>
        <div style={{ textAlign: 'center', padding: '1.5rem' }}>
          <h3>⚠️ {isFrench ? 'Aucun stratagème trouvé pour ce filtre' : 'No stratagems found for this filter'}</h3>
          <p style={{ color: 'var(--ink-soft)' }}>
            {isFrench ? 'Essayez de changer de faction ou de périmètre d’unités.' : 'Try selecting a different faction or unit pool.'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }}>
      {stratagemQuestion.type === 'identify-detachment' ? (
        <div>
          {/* Identify Detachment Quiz */}
          <div style={{ background: '#f8f4eb', border: '1px solid #e2d8c9', borderRadius: '0.85rem', padding: '1rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div>
              <span className="eyebrow" style={{ fontSize: '0.75rem', color: 'var(--gold-dark)', fontWeight: 800 }}>
                {isFrench ? 'IDENTIFICATION DE DÉTACHEMENT' : 'DETACHMENT IDENTIFICATION'}
              </span>
              <h2 style={{ fontSize: '1.25rem', margin: '0.2rem 0 0.15rem', fontWeight: 800 }}>
                {isFrench ? 'À quel détachement appartient ce stratagème ?' : 'Which detachment does this stratagem belong to?'}
              </h2>
              {stratChecked && (
                <div style={{ fontSize: '0.85rem', fontWeight: 800, marginTop: '0.25rem' }}>
                  {selectedStratagemChoice && validDetachmentIds.has(selectedStratagemChoice) ? (
                    <span style={{ color: '#0f5132' }}>🎉 {isFrench ? 'Excellente réponse !' : 'Correct answer!'}</span>
                  ) : (
                    <span style={{ color: '#842029' }}>
                      ❌ {isFrench
                        ? `Incorrect. Bon(s) détachement(s) : ${stratagemQuestion.choices
                            .filter((c: any) => validDetachmentIds.has(c.id))
                            .map((c: any) => display.detachmentName(c))
                            .join(' ou ')}`
                        : `Incorrect. Correct detachment(s): ${stratagemQuestion.choices
                            .filter((c: any) => validDetachmentIds.has(c.id))
                            .map((c: any) => display.detachmentName(c))
                            .join(' or ')}`}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {!stratChecked ? (
                <button
                  onClick={handleVerifyStrat}
                  disabled={selectedStratagemChoice === null}
                  style={{ padding: '0.45rem 1rem', fontSize: '0.9rem' }}
                >
                  ✓ {isFrench ? 'Vérifier' : 'Check'}
                </button>
              ) : null}
              <button onClick={handleNextStrat} className={stratChecked ? '' : 'secondary'} style={{ padding: '0.45rem 1rem', fontSize: '0.9rem' }}>
                ➔ {isFrench ? 'Suivant' : 'Next'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div style={{ background: '#fff', border: '1px solid #e3d8c7', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              {(() => {
                const detCandidateNames = [
                  stratagemQuestion.correctDetachment.displayName,
                  stratagemQuestion.correctDetachment.Name,
                  stratagemQuestion.correctDetachment.id,
                  ...stratagemQuestion.choices.flatMap((c: any) => [c.displayName, c.Name, c.id])
                ].filter((n): n is string => typeof n === 'string' && n.trim().length > 2);

                const cleanCategory = sanitizeStratagemCategoryForQuiz(
                  stratagemQuestion.targetStratagem.Category,
                  detCandidateNames
                );
                const cleanWhen = sanitizeStratagemTextForQuiz(
                  stratagemQuestion.targetStratagem.When,
                  detCandidateNames,
                  isFrench
                );
                const cleanTarget = sanitizeStratagemTextForQuiz(
                  stratagemQuestion.targetStratagem.Target,
                  detCandidateNames,
                  isFrench
                );
                const cleanEffect = sanitizeStratagemTextForQuiz(
                  stratagemQuestion.targetStratagem.Effect,
                  detCandidateNames,
                  isFrench
                );

                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem', borderBottom: '1px solid #e3d8c7', paddingBottom: '0.4rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--gold-dark)', fontWeight: 900 }}>
                        ⚡ {display.term(stratagemQuestion.targetStratagem.Name)}
                      </h3>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ background: 'var(--gold, #dcb15b)', color: '#322208', padding: '0.2rem 0.55rem', borderRadius: '0.4rem', fontWeight: 800, fontSize: '0.75rem' }}>
                          {stratagemQuestion.targetStratagem.CPCost ?? 1} {isFrench ? 'PC' : 'CP'}
                        </span>
                        {cleanCategory && (
                          <span style={{ background: '#e8e0d0', color: '#4a3f31', padding: '0.2rem 0.55rem', borderRadius: '0.4rem', fontWeight: 700, fontSize: '0.72rem' }}>
                            {display.term(cleanCategory)}
                          </span>
                        )}
                        {stratagemQuestion.targetStratagem.Phase && (
                          <span style={{ background: '#e0e7f0', color: '#21334a', padding: '0.2rem 0.55rem', borderRadius: '0.4rem', fontWeight: 700, fontSize: '0.72rem' }}>
                            Phase : {display.term(stratagemQuestion.targetStratagem.Phase)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--ink)' }}>
                      {cleanWhen && (
                        <div style={{ marginBottom: '0.4rem' }}>
                          <strong style={{ color: 'var(--ink)' }}>QUAND :</strong> {display.term(cleanWhen)}
                        </div>
                      )}
                      {cleanTarget && (
                        <div style={{ marginBottom: '0.4rem' }}>
                          <strong style={{ color: 'var(--ink)' }}>CIBLE :</strong> {display.term(cleanTarget)}
                        </div>
                      )}
                      {cleanEffect && (
                        <div>
                          <strong style={{ color: 'var(--ink)' }}>EFFET :</strong> {display.term(cleanEffect)}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.65rem' }}>
              {stratagemQuestion.choices.map((choice: any) => {
                const cost = getDetachmentCost(choice);
                const costText = `${cost} DP`;
                const choiceLabel = `${display.factionName(choice.factionName)} / ${display.detachmentName(choice)} / ${costText}`;

                const isSelected = selectedStratagemChoice === choice.id;
                const isCorrectChoice = validDetachmentIds.has(choice.id);

                let btnBg = isSelected ? '#f5e9ce' : '#fcf9f2';
                let btnBorder = isSelected ? '2px solid var(--gold-dark)' : '1px solid #dcd1be';
                let btnColor = 'var(--ink)';
                let badge = '';

                if (stratChecked) {
                  if (isCorrectChoice) {
                    btnBg = isSelected ? '#d1e7dd' : '#f0f8f3';
                    btnBorder = '2px solid #296345';
                    btnColor = '#0f5132';
                    badge = '✅';
                  } else if (isSelected) {
                    btnBg = '#f8d7da';
                    btnBorder = '2px solid #b83228';
                    btnColor = '#842029';
                    badge = '❌';
                  } else {
                    btnBg = '#fafdfb';
                    btnBorder = '1px solid #e9ecef';
                    btnColor = '#adb5bd';
                  }
                }

                return (
                  <button
                    key={choice.id}
                    onClick={() => {
                      if (!stratChecked) setSelectedStratagemChoice(choice.id);
                    }}
                    style={{
                      background: btnBg,
                      border: btnBorder,
                      color: btnColor,
                      padding: '0.75rem',
                      borderRadius: '0.6rem',
                      textAlign: 'left',
                      cursor: stratChecked ? 'default' : 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>{choiceLabel}</span>
                    {badge && <span style={{ fontSize: '1.2rem' }}>{badge}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div>
          {/* Select Stratagems Quiz */}
          <div style={{ background: '#f8f4eb', border: '1px solid #e2d8c9', borderRadius: '0.85rem', padding: '1rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            {(() => {
              const targetCost = getDetachmentCost(stratagemQuestion.targetDetachment);
              const costSuccess = selectedCost === targetCost;

              const targetFd = stratagemQuestion.targetDetachment.ForceDispositions ?? [];
              const expectedFd = (targetFd.length === 0 ? 'ALL' : targetFd[0]).toUpperCase().trim();
              const fdSuccess = selectedForceDisposition !== null && selectedForceDisposition.toUpperCase().trim() === expectedFd;

              const correctSet = new Set(stratagemQuestion.correctStratagems.map((s: any) => (s.Name ?? '').toUpperCase().trim()));
              const selectedSet = new Set([...selectedStratagemNames].map((s: any) => s.toUpperCase().trim()));
              const stratagemsSuccess = correctSet.size === selectedSet.size && [...correctSet].every((s: any) => selectedSet.has(s));

              const isSuccess = stratagemsSuccess && costSuccess && fdSuccess;

              return (
                <>
                  <div>
                    <span className="eyebrow" style={{ fontSize: '0.75rem', color: 'var(--gold-dark)', fontWeight: 800 }}>
                      ⚡ {display.factionName(stratagemQuestion.targetDetachment.factionName)}
                    </span>
                    <h2 style={{ fontSize: '1.2rem', margin: '0.15rem 0 0.2rem', fontWeight: 800 }}>
                      Détachement : {display.detachmentName(stratagemQuestion.targetDetachment)}
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                      {isFrench
                        ? 'Indiquez le coût en DP, la force disposition et sélectionnez les stratagèmes de ce détachement :'
                        : 'Select the DP cost, force disposition and stratagems belonging to this detachment:'}
                    </p>
                    {stratChecked && (
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, marginTop: '0.35rem' }}>
                        {isSuccess ? (
                          <span style={{ color: '#0f5132' }}>🎉 {isFrench ? 'Tout est correct !' : 'Everything is correct!'}</span>
                        ) : (
                          <span style={{ color: '#842029' }}>❌ {isFrench ? 'Il y a des erreurs.' : 'There are errors.'}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {!stratChecked ? (
                      <button onClick={handleVerifyStrat} style={{ padding: '0.45rem 1rem', fontSize: '0.9rem' }}>
                        ✓ {isFrench ? 'Vérifier' : 'Check'}
                      </button>
                    ) : null}
                    <button onClick={handleNextStrat} className={stratChecked ? '' : 'secondary'} style={{ padding: '0.45rem 1rem', fontSize: '0.9rem' }}>
                      ➔ {isFrench ? 'Suivant' : 'Next'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>

          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--ink-soft)', marginBottom: '0.35rem' }}>
                    {isFrench ? 'Coût en DP (1-3)' : 'DP Cost (1-3)'}
                  </label>
                  <div style={{ display: 'flex', gap: '0.2rem' }}>
                    {[1, 2, 3].map((val) => {
                      const isSelected = selectedCost === val;
                      let bg = isSelected ? 'var(--gold, #dcb15b)' : '#f8f4eb';
                      let color = isSelected ? '#171108' : 'var(--ink-soft)';
                      if (stratChecked) {
                        const targetCost = getDetachmentCost(stratagemQuestion.targetDetachment);
                        if (val === targetCost) {
                          bg = '#d1e7dd';
                          color = '#0f5132';
                        } else if (isSelected) {
                          bg = '#f8d7da';
                          color = '#842029';
                        }
                      }
                      return (
                        <button
                          key={val}
                          onClick={() => {
                            if (!stratChecked) setSelectedCost(val);
                          }}
                          style={{
                            background: bg,
                            color: color,
                            border: '1px solid #e2d8c9',
                            borderRadius: '0.35rem',
                            padding: '0.35rem 0',
                            flex: 1,
                            fontWeight: 800,
                            cursor: stratChecked ? 'default' : 'pointer',
                            fontSize: '0.85rem'
                          }}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--ink-soft)', marginBottom: '0.35rem' }}>
                    {isFrench ? 'Scénario (Force Disposition)' : 'Scenario (Force Disposition)'}
                  </label>
                  <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
                    {['ALL', ...SCENARIOS.map((s: any) => s.id)].map((val) => {
                      const isSelected = selectedForceDisposition === val;
                      let bg = isSelected ? 'var(--gold, #dcb15b)' : '#f8f4eb';
                      let color = isSelected ? '#171108' : 'var(--ink-soft)';
                      if (stratChecked) {
                        const targetFd = stratagemQuestion.targetDetachment.ForceDispositions ?? [];
                        const expectedFd = (targetFd.length === 0 ? 'ALL' : targetFd[0]).toUpperCase().trim();
                        if (val === expectedFd) {
                          bg = '#d1e7dd';
                          color = '#0f5132';
                        } else if (isSelected) {
                          bg = '#f8d7da';
                          color = '#842029';
                        }
                      }
                      const label = val === 'ALL'
                        ? (isFrench ? 'TOUS' : 'ALL')
                        : t(`scenarios.${val}.label`);
                      return (
                        <button
                          key={val}
                          onClick={() => {
                            if (!stratChecked) setSelectedForceDisposition(val);
                          }}
                          style={{
                            background: bg,
                            color: color,
                            border: '1px solid #e2d8c9',
                            borderRadius: '0.35rem',
                            padding: '0.35rem 0.4rem',
                            flex: '1 1 auto',
                            fontWeight: 800,
                            cursor: stratChecked ? 'default' : 'pointer',
                            fontSize: '0.7rem',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--ink-soft)', marginBottom: '0.5rem' }}>
                  {isFrench ? 'Sélectionnez les stratagèmes :' : 'Select Stratagems:'}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {stratagemQuestion.proposedStratagems.map((strat: any, idx: number) => {
                    const stratName = strat.Name ?? '';
                    const isSelected = selectedStratagemNames.has(stratName);
                    const isCorrectStrat = stratagemQuestion.correctStratagems.some(
                      (s: any) => s.Name?.toUpperCase().trim() === stratName.toUpperCase().trim()
                    );

                    let chipBg = isSelected ? 'var(--gold, #dcb15b)' : '#fcf9f2';
                    let chipBorderColor = isSelected ? 'var(--gold-dark)' : '#dcd1be';
                    let chipColor = 'var(--ink)';

                    if (stratChecked) {
                      if (isCorrectStrat) {
                        chipBg = isSelected ? '#d1e7dd' : '#f0f8f3';
                        chipBorderColor = '#0f5132';
                        chipColor = '#0f5132';
                      } else if (isSelected) {
                        chipBg = '#f8d7da';
                        chipBorderColor = '#842029';
                        chipColor = '#842029';
                      } else {
                        chipBg = '#fafdfb';
                        chipBorderColor = '#e9ecef';
                        chipColor = '#adb5bd';
                      }
                    }

                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'stretch' }}>
                        <button
                          onClick={() => {
                            if (stratChecked) return;
                            setSelectedStratagemNames((prev) => {
                              const next = new Set(prev);
                              if (next.has(stratName)) next.delete(stratName);
                              else next.add(stratName);
                              return next;
                            });
                          }}
                          style={{
                            background: chipBg,
                            borderTop: `1px solid ${chipBorderColor}`,
                            borderBottom: `1px solid ${chipBorderColor}`,
                            borderLeft: `1px solid ${chipBorderColor}`,
                            borderRight: 'none',
                            color: chipColor,
                            padding: '0.4rem 0.75rem',
                            borderRadius: '0.4rem 0 0 0.4rem',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: stratChecked ? 'default' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                          }}
                        >
                          {stratChecked && isCorrectStrat && !isSelected && '⚠️ '}
                          {stratChecked && !isCorrectStrat && isSelected && '❌ '}
                          {stratChecked && isCorrectStrat && isSelected && '✅ '}
                          {display.term(stratName)}
                        </button>
                        <button
                          onClick={() => {
                            setInspectedStratagem(inspectedStratagem?.Name === stratName ? null : strat);
                          }}
                          style={{
                            background: chipBg,
                            borderTop: `1px solid ${chipBorderColor}`, borderBottom: `1px solid ${chipBorderColor}`, borderRight: `1px solid ${chipBorderColor}`,
                            color: chipColor,
                            padding: '0.4rem 0.5rem',
                            borderRadius: '0 0.4rem 0.4rem 0',
                            cursor: 'pointer',
                            borderLeft: '1px solid rgba(0,0,0,0.1)'
                          }}
                          title={isFrench ? "Voir les détails" : "View details"}
                        >
                          <span style={{ fontSize: '0.9rem', opacity: 0.6 }}>ℹ️</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {inspectedStratagem && (
              <div style={{ flex: '1 1 250px', background: '#fff', border: '1px solid #e2d8c9', borderRadius: '0.6rem', padding: '1rem', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', alignSelf: 'flex-start' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--gold-dark)', fontWeight: 900 }}>
                    ⚡ {display.term(inspectedStratagem.Name)}
                  </h4>
                  <button
                    onClick={() => setInspectedStratagem(null)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0.2rem', color: 'var(--ink-soft)' }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <span style={{ background: 'var(--gold, #dcb15b)', color: '#322208', padding: '0.15rem 0.4rem', borderRadius: '0.3rem', fontWeight: 800, fontSize: '0.65rem' }}>
                    {inspectedStratagem.CPCost ?? 1} {isFrench ? 'PC' : 'CP'}
                  </span>
                  {inspectedStratagem.Category && (
                    <span style={{ background: '#e8e0d0', color: '#4a3f31', padding: '0.15rem 0.4rem', borderRadius: '0.3rem', fontWeight: 700, fontSize: '0.65rem' }}>
                      {display.term(inspectedStratagem.Category)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', lineHeight: 1.4, color: 'var(--ink)' }}>
                  {inspectedStratagem.When && (
                    <div style={{ marginBottom: '0.3rem' }}><strong style={{ color: 'var(--ink)' }}>QUAND :</strong> {display.term(inspectedStratagem.When)}</div>
                  )}
                  {inspectedStratagem.Target && (
                    <div style={{ marginBottom: '0.3rem' }}><strong style={{ color: 'var(--ink)' }}>CIBLE :</strong> {display.term(inspectedStratagem.Target)}</div>
                  )}
                  {inspectedStratagem.Effect && (
                    <div><strong style={{ color: 'var(--ink)' }}>EFFET :</strong> {display.term(inspectedStratagem.Effect)}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
