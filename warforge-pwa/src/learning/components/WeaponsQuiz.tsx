import { useEffect, useMemo, useRef, useState } from 'react';
import { quizOutcome, useQuizQueue, type QuizOutcome } from '../useQuizQueue';
import type { NormalizedDatabase, NormalizedUnit, RawWeaponProfile } from '../../domain/types';
import type { CatalogLocalization } from '../../domain/catalog-localization';
import { generateWeaponStatOptions, shuffleArray } from '../learning-utils';

export const WEAPON_STAT_KEYS = [
  { key: 'Range', label: 'Portée', nameFr: 'Portée', nameEn: 'Range' },
  { key: 'Attacks', label: 'A', nameFr: 'Attaques', nameEn: 'Attacks' },
  { key: 'ToHit', label: 'CT/CC', nameFr: 'Compétence', nameEn: 'Skill' },
  { key: 'Strength', label: 'F', nameFr: 'Force', nameEn: 'Strength' },
  { key: 'AP', label: 'PA', nameFr: 'Pénétration', nameEn: 'AP' },
  { key: 'Damage', label: 'D', nameFr: 'Dégâts', nameEn: 'Damage' },
  { key: 'Keywords', label: 'Mots-clés', nameFr: 'Mots-clés', nameEn: 'Keywords' },
] as const;

export interface WeaponsQuizProps {
  database: NormalizedDatabase;
  display: CatalogLocalization;
  isFrench: boolean;
  eligibleUnits: NormalizedUnit[];
  onAdvance: () => void;
  onScoreUpdate: (isCorrect: boolean) => void;
  getUnitImgUrl: (unitId: string) => string | null;
}

export function WeaponsQuiz({
  database,
  display,
  isFrench,
  eligibleUnits,
  onAdvance,
  onScoreUpdate,
  getUnitImgUrl
}: WeaponsQuizProps) {

  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<boolean>(false);
  const validatedRef = useRef(false);

  const weaponPool = useMemo(() => {
    return eligibleUnits.flatMap(unit => 
      (unit.Weapons || []).flatMap(wg => 
        (wg.Weapons || []).map(wp => ({ unit, wg, wp }))
      )
    );
  }, [eligibleUnits]);

  const { currentItem: question, advance } = useQuizQueue(weaponPool, q => q.unit.id + '|' + (q.wg.Name||'') + '|' + (q.wp.Name||''));
  const [outcome, setOutcome] = useState<QuizOutcome | null>(null);
  const questionId = question ? `${question.unit.id}|${question.wg.Name ?? ''}|${question.wp.Name ?? ''}` : null;

  useEffect(() => {
    setSelectedAnswers({});
    setChecked(false);
    setOutcome(null);
    validatedRef.current = false;
  }, [questionId]);

  const statOptionsMap = useMemo(() => {
    if (!question) return {};
    const res: Record<string, string[]> = {};
    for (const { key } of WEAPON_STAT_KEYS) {
      // the key matches wp property
      const val = (question.wp[key as keyof RawWeaponProfile] as string) ?? '-';
      res[key] = generateWeaponStatOptions(key, val);
    }
    return res;
  }, [question]);

  const handleVerify = () => {
    if (!question || checked || validatedRef.current) return;
    validatedRef.current = true;
    
    let numCorrect = 0;
    for (const { key } of WEAPON_STAT_KEYS) {
      const expected = ((question.wp[key as keyof RawWeaponProfile] as string) ?? '-').trim();
      const actual = (selectedAnswers[key] ?? '').trim();
      if (actual === expected) {
        numCorrect++;
      }
    }
    
    const isFullyCorrect = numCorrect === WEAPON_STAT_KEYS.length;
    setChecked(true);
    setOutcome(quizOutcome(isFullyCorrect));
    onScoreUpdate(isFullyCorrect);
  };

  const handleNext = () => {
    setSelectedAnswers({});
    setChecked(false);
    advance(outcome ?? 'skipped');
    setOutcome(null);
    onAdvance();
  };

  if (!question) {
    return (
      <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }}>
        <div style={{ textAlign: 'center', padding: '1.5rem' }}>
          <h3>⚠️ {isFrench ? 'Aucune arme trouvée pour ce filtre' : 'No weapons found for this filter'}</h3>
          <p style={{ color: 'var(--ink-soft)' }}>
            {isFrench ? 'Essayez de changer de faction ou de périmètre d’unités.' : 'Try selecting a different faction or unit pool.'}
          </p>
        </div>
      </section>
    );
  }

  const { unit, wp, wg } = question;

  return (
    <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }}>
      <div style={{ background: '#f8f4eb', border: '1px solid #e2d8c9', borderRadius: '0.85rem', padding: '1rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <span className="eyebrow" style={{ fontSize: '0.75rem', color: 'var(--gold-dark)', fontWeight: 800 }}>
            {display.factionName(unit.factionName)} • {display.unitName(unit)}
          </span>
          <h2 style={{ fontSize: '1.25rem', margin: '0.2rem 0 0.15rem', fontWeight: 800 }}>
            {wp.Name || wg.Name}
          </h2>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
            {isFrench
              ? 'Sélectionnez les caractéristiques de cette arme :'
              : 'Select the stats for this weapon:'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {!checked ? (
            <button
              onClick={handleVerify}
              disabled={Object.keys(selectedAnswers).length < WEAPON_STAT_KEYS.length}
              style={{ padding: '0.45rem 1rem', fontSize: '0.9rem' }}
            >
              ✓ {isFrench ? 'Vérifier' : 'Check'}
            </button>
          ) : null}
          <button onClick={handleNext} className={checked ? '' : 'secondary'} style={{ padding: '0.45rem 1rem', fontSize: '0.9rem' }}>
            ➔ {isFrench ? 'Suivant' : 'Next'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.6rem' }}>
        {WEAPON_STAT_KEYS.map(({ key, label, nameFr, nameEn }) => {
          const correctVal = ((wp[key as keyof RawWeaponProfile] as string) ?? '-').trim();
          const options = statOptionsMap[key] ?? [correctVal];
          const userChoice = selectedAnswers[key] ?? '';
          const isRight = userChoice === correctVal;
          const hasLongOptions = options.some((o) => o.length > 4);

          return (
            <div
              key={key}
              style={{
                background: checked
                  ? isRight
                    ? '#eef8f2'
                    : '#fdf2f0'
                  : '#fffefa',
                border: checked
                  ? isRight
                    ? '2px solid #296345'
                    : '2px solid #b83228'
                  : '1px solid #d4c8b7',
                borderRadius: '0.65rem',
                padding: '0.55rem 0.45rem',
                textAlign: 'center',
                minWidth: 0,
                overflow: 'hidden'
              }}
            >
              <div style={{ fontWeight: 800, color: 'var(--gold-dark)', fontSize: '0.8rem', marginBottom: '0.4rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {label} · {isFrench ? nameFr : nameEn}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: hasLongOptions ? 'repeat(2, 1fr)' : `repeat(${Math.min(options.length, 4)}, 1fr)`,
                  gap: '0.25rem'
                }}
              >
                {options.map((opt) => {
                  const isSelected = userChoice === opt;
                  let pillBg = isSelected ? 'var(--gold, #dcb15b)' : '#fcf9f2';
                  let pillBorder = isSelected ? '2px solid var(--gold-dark, #8b6b23)' : '1px solid #d0c4b4';
                  let pillColor = isSelected ? '#171108' : '#393126';
                  let badge = '';

                  if (checked) {
                    if (opt === correctVal) {
                      pillBg = '#d1e7dd';
                      pillBorder = '2px solid #296345';
                      pillColor = '#0f5132';
                      badge = ' ✓';
                    } else if (isSelected && !isRight) {
                      pillBg = '#f8d7da';
                      pillBorder = '2px solid #b83228';
                      pillColor = '#842029';
                      badge = ' ❌';
                    } else {
                      pillBg = '#fafdfb';
                      pillBorder = '1px solid #e9ecef';
                      pillColor = '#adb5bd';
                    }
                  }

                  return (
                    <button
                      key={opt}
                      className="pill-button"
                      type="button"
                      onClick={() => {
                        if (!checked) {
                          setSelectedAnswers((prev) => ({ ...prev, [key]: opt }));
                        }
                      }}
                      style={{
                        padding: '0.35rem 0',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        borderRadius: '0.35rem',
                        border: pillBorder,
                        background: pillBg,
                        color: pillColor,
                        cursor: checked ? 'default' : 'pointer',
                        transition: 'all 0.1s ease',
                        width: '100%'
                      }}
                    >
                      {opt}{badge}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
