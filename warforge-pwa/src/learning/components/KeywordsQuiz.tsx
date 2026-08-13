
import { useEffect, useMemo, useRef, useState } from 'react';
import { quizOutcome, useQuizQueue, type QuizOutcome } from '../useQuizQueue';
import type { NormalizedDatabase, NormalizedUnit } from '../../domain/types';
import type { CatalogLocalization } from '../../domain/catalog-localization';
import {
  shuffleArray,
  isForbiddenKeyword,
  unitHasKeyword
} from '../learning-utils';

export interface KeywordsQuizProps {
  database: NormalizedDatabase;
  display: CatalogLocalization;
  isFrench: boolean;
  eligibleUnits: NormalizedUnit[];
  onAdvance: () => void;
  onScoreUpdate: (correct: number, total: number, isFullyCorrect: boolean) => void;
  getUnitImgUrl: (unitId: string) => string | null;
}

export function KeywordsQuiz({
  database,
  display,
  isFrench,
  eligibleUnits,
  onAdvance,
  onScoreUpdate,
  getUnitImgUrl
}: KeywordsQuizProps) {

  const [selectedKwUnitIds, setSelectedKwUnitIds] = useState<Set<string>>(new Set());
  const [kwChecked, setKwChecked] = useState<boolean>(false);
  const validatedRef = useRef(false);

  const { keywords, kwMap } = useMemo(() => {
    if (eligibleUnits.length === 0) return { keywords: [], kwMap: new Map<string, NormalizedUnit[]>() };
    
    const map = new Map<string, NormalizedUnit[]>();
    for (const unit of eligibleUnits) {
      const unitKws = [...(unit.Keywords ?? []), ...(unit.FactionKeywords ?? [])];
      for (const kw of unitKws) {
        if (isForbiddenKeyword(kw, database)) continue;
        const key = kw.trim().toUpperCase();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(unit);
      }
    }
    return { keywords: Array.from(map.keys()), kwMap: map };
  }, [eligibleUnits, database]);

  const { currentItem: targetKeyword, advance } = useQuizQueue(keywords, k => k);
  const [outcome, setOutcome] = useState<QuizOutcome | null>(null);

  useEffect(() => {
    setSelectedKwUnitIds(new Set());
    setKwChecked(false);
    setOutcome(null);
    validatedRef.current = false;
  }, [targetKeyword]);

  const kwQuestion = useMemo(() => {
    if (!targetKeyword) return null;
    
    const positiveUnits = kwMap.get(targetKeyword) ?? [];
    const positiveIds = new Set(positiveUnits.map((u) => u.id));
    const negativeUnits = eligibleUnits.filter((u) => !positiveIds.has(u.id));
    
    const shuffledPos = shuffleArray(positiveUnits);
    const shuffledNeg = shuffleArray(negativeUnits);
    
    const targetTotal = Math.min(6, eligibleUnits.length);
    const numPos = Math.min(shuffledPos.length, Math.max(1, Math.floor(Math.random() * 3) + 1));
    const numNeg = Math.min(shuffledNeg.length, targetTotal - numPos);
    
    const candidateUnits = shuffleArray([
      ...shuffledPos.slice(0, numPos),
      ...shuffledNeg.slice(0, numNeg)
    ]);
    
    return {
      targetKeyword,
      candidateUnits
    };
  }, [targetKeyword, kwMap, eligibleUnits]);

  const toggleKwUnit = (unitId: string) => {
    if (kwChecked) return;
    setSelectedKwUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  };

  const handleVerifyKw = () => {
    if (!kwQuestion || kwChecked || validatedRef.current) return;
    validatedRef.current = true;
    setKwChecked(true);

    let numCorrect = 0;
    const total = kwQuestion.candidateUnits.length;
    for (const unit of kwQuestion.candidateUnits) {
      const hasKw = unitHasKeyword(unit, kwQuestion.targetKeyword);
      const isChecked = selectedKwUnitIds.has(unit.id);
      if (hasKw === isChecked) {
        numCorrect++;
      }
    }

    const isFullyCorrect = numCorrect === total;
    setOutcome(quizOutcome(isFullyCorrect));
    onScoreUpdate(numCorrect, total, isFullyCorrect);
  };

  const handleNextKw = () => {
    setSelectedKwUnitIds(new Set());
    setKwChecked(false);
    advance(outcome ?? 'skipped');
    setOutcome(null);
    onAdvance();
  };

  if (eligibleUnits.length === 0) return null;
  if (!kwQuestion) return null;

  return (
    <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1rem 1.25rem' }}>
      <div style={{ background: '#f8f4eb', border: '1px solid #e2d8c9', borderRadius: '0.85rem', padding: '0.85rem 1.15rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.85rem' }}>
        <div>
          <span className="eyebrow" style={{ fontSize: '0.7rem', marginBottom: '0.15rem' }}>{isFrench ? 'TEST DE MOTS-CLÉS' : 'KEYWORD TEST'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--ink-soft)' }}>
              {isFrench ? 'Cochez les unités avec :' : 'Select units with:'}
            </span>
            <div
              style={{ background: 'var(--gold)', color: '#171108', fontWeight: 900, fontSize: '1.15rem', padding: '0.25rem 0.9rem', borderRadius: '999px', letterSpacing: '0.04em' }}>
              {display.term(kwQuestion.targetKeyword)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {!kwChecked ? (
            <>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const allIds = kwQuestion.candidateUnits.map((u) => u.id);
                  if (selectedKwUnitIds.size === allIds.length) {
                    setSelectedKwUnitIds(new Set());
                  } else {
                    setSelectedKwUnitIds(new Set(allIds));
                  }
                }}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}
              >
                {selectedKwUnitIds.size === kwQuestion.candidateUnits.length
                  ? (isFrench ? 'Tout décocher' : 'Unselect All')
                  : (isFrench ? 'Tout cocher' : 'Select All')}
              </button>
              <button onClick={handleVerifyKw} style={{ padding: '0.45rem 1rem', fontSize: '0.9rem' }}>
                ✓ {isFrench ? 'Vérifier' : 'Check'}
              </button>
              <button onClick={handleNextKw} className="secondary" style={{ padding: '0.45rem 1rem', fontSize: '0.9rem' }}>
                ➔ {isFrench ? 'Suivant' : 'Next'}
              </button>
            </>
          ) : (
            <button onClick={handleNextKw} style={{ padding: '0.45rem 1.1rem', fontSize: '0.9rem' }}>
              ➔ {isFrench ? 'Mot-clé suivant' : 'Next Keyword'}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
        {kwQuestion.candidateUnits.map((unit) => {
          const imgUrl = getUnitImgUrl(unit.id);
          const hasKw = unitHasKeyword(unit, kwQuestion.targetKeyword);
          const isSelected = selectedKwUnitIds.has(unit.id);
          const isCorrect = hasKw === isSelected;

          let cardBg = '#f8f4eb';
          let cardBorder = '2px solid #e2d8c9';
          let badgeText = '';
          let badgeBg = '';
          let badgeColor = '';

          if (!kwChecked) {
            if (isSelected) {
              cardBg = '#fffdf5';
              cardBorder = '2px solid var(--gold-dark)';
            }
          } else {
            if (isCorrect) {
              cardBg = isSelected ? '#f0f8f3' : '#fafdfb';
              cardBorder = '2px solid #296345';
              badgeText = isSelected ? (isFrench ? '✅ VRAI' : '✅ CORRECT') : (isFrench ? '✅ Correct (non coché)' : '✅ Correct (unselected)');
              badgeBg = '#d1e7dd';
              badgeColor = '#0f5132';
            } else {
              cardBg = isSelected ? '#fdf2f0' : '#fffbe2';
              cardBorder = isSelected ? '2px solid #b83228' : '2px solid #d97706';
              badgeText = isSelected
                ? (isFrench ? '❌ Pas ce mot-clé' : '❌ Wrong Selection')
                : (isFrench ? '⚠️ Oublié' : '⚠️ Missed');
              badgeBg = isSelected ? '#f8d7da' : '#fff3cd';
              badgeColor = isSelected ? '#842029' : '#664d03';
            }
          }

          return (
            <button className="keyword-card learning-choice-card"
              type="button"
              aria-pressed={isSelected}
              aria-disabled={kwChecked}
              key={unit.id}
              onClick={() => toggleKwUnit(unit.id)}
              style={{
                background: cardBg,
                border: cardBorder,
                borderRadius: '0.75rem',
                padding: '0.65rem 0.75rem',
                cursor: kwChecked ? 'default' : 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div
             >
                <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--ink-soft)' }}>
                    {display.factionName(unit.factionName)}
                  </span>
                  <div
              style={{ fontSize: '1.1rem', lineHeight: 1 }}>
                    {isSelected ? '☑️' : '⬜'}
                  </div>
                </div>

                {imgUrl && (
                  <img
                    src={imgUrl}
                    alt={display.unitName(unit)}
                    style={{ maxHeight: '75px', objectFit: 'contain', margin: '0.2rem auto 0.4rem', display: 'block', borderRadius: '0.35rem' }}
                  />
                )}

                <h3 style={{ fontSize: '0.95rem', margin: '0.15rem 0', fontWeight: 800, textAlign: 'center', color: 'var(--ink)' }}>
                  {display.unitName(unit)}
                </h3>
              </div>

              {kwChecked ? (
                <div
              style={{ marginTop: '0.5rem', paddingTop: '0.35rem', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                  <div
              style={{ background: badgeBg, color: badgeColor, fontWeight: 800, fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '0.35rem', textAlign: 'center', marginBottom: '0.35rem' }}>
                    {badgeText}
                  </div>
                  <div
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', justifyContent: 'center' }}>
                    {[...(unit.Keywords ?? []), ...(unit.FactionKeywords ?? [])].map((kw) => (
                      <span key={kw} style={{ fontSize: '0.62rem', background: '#e2d8c9', color: '#4a3f31', padding: '0.1rem 0.35rem', borderRadius: '0.2rem' }}>
                        {display.term(kw)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
