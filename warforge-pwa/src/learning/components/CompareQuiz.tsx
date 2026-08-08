import { useMemo, useState, useEffect } from 'react';
import type { NormalizedDatabase, NormalizedUnit } from '../../domain/types';
import type { CatalogLocalization } from '../../domain/catalog-localization';
import { getExpectedStatValue } from '../learning-utils';
import { ANALYSIS_TARGETS, estimateWeaponProfileDamage, AnalysisTarget, modeKey } from '../../domain/analysis';
import { weaponProfiles, SelectedWeaponProfile, resolveWargear, getWargearRules, ruleLimit } from '../../domain/wargear';

export interface CompareQuizProps {
  database: NormalizedDatabase;
  display: CatalogLocalization;
  isFrench: boolean;
  eligibleUnits: NormalizedUnit[];
  onAdvance: () => void;
  onScoreUpdate: (isCorrect: boolean) => void;
  getUnitImgUrl: (unitId: string) => string | null;
}

type CompareMetric = 'Toughness' | 'Movement' | 'Wounds' | 'OC' | 'DamageHorde' | 'DamageElite' | 'DamageVehicle';

const METRICS: { key: CompareMetric; labelEn: string; labelFr: string; targetId?: string; range?: number }[] = [
  { key: 'Toughness', labelEn: 'Higher Toughness', labelFr: 'Meilleure Endurance (E)' },
  { key: 'Movement', labelEn: 'Higher Movement', labelFr: 'Meilleur Mouvement (M)' },
  { key: 'Wounds', labelEn: 'More Wounds (per model)', labelFr: 'Plus de PV (par figurine)' },
  { key: 'OC', labelEn: 'Higher Objective Control (OC)', labelFr: "Meilleur Contrôle d'Objectif (CO)" },
  { key: 'DamageHorde', labelEn: 'More Expected Damage vs Horde (T3, 5+)', labelFr: 'Plus de dégâts attendus vs Horde (E3, Sv 5+)', targetId: 'horde' },
  { key: 'DamageElite', labelEn: 'More Expected Damage vs Elite (T6, 2+)', labelFr: 'Plus de dégâts attendus vs Elite (E6, Sv 2+)', targetId: 'elite' },
  { key: 'DamageVehicle', labelEn: 'More Expected Damage vs Vehicle (T10, 3+)', labelFr: 'Plus de dégâts attendus vs Véhicule (E10, Sv 3+)', targetId: 'vehicle' }
];

export function CompareQuiz({
  database,
  display,
  isFrench,
  eligibleUnits,
  onAdvance,
  onScoreUpdate,
  getUnitImgUrl
}: CompareQuizProps) {
  const [turn, setTurn] = useState<number>(0);
  const [failedSchedule, setFailedSchedule] = useState<any[]>([]);
  const [seedIndex, setSeedIndex] = useState<number>(() => Math.floor(Math.random() * 100000));
  const [lastCorrect, setLastCorrect] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  const [question, setQuestion] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(true);

  useEffect(() => {
    setIsGenerating(true);
    if (eligibleUnits.length < 2) {
      setQuestion(null);
      setIsGenerating(false);
      return;
    }

    const timer = setTimeout(() => {
      // Check schedule
      const scheduled = failedSchedule.find(s => s.turn === turn);
      if (scheduled) {
        setQuestion(scheduled.q);
        setIsGenerating(false);
        return;
      }

      let attempts = 0;
      let nextQuestion = null;
      while (attempts < 100) {
        const idx1 = (seedIndex * 13 + attempts * 7) % eligibleUnits.length;
        const idx2 = (seedIndex * 17 + attempts * 11) % eligibleUnits.length;
        const unit1 = eligibleUnits[idx1];
        const unit2 = eligibleUnits[idx2];
        const baseMetricDef = METRICS[(seedIndex + attempts) % METRICS.length];
        
        let metricDef = { ...baseMetricDef };
        if (metricDef.targetId) {
          const ranges = [0, 9, 12, 18, 24, 36];
          const rIndex = (seedIndex * 3 + attempts * 5) % ranges.length;
          const testRange = ranges[rIndex];
          if (testRange !== undefined) {
            metricDef.range = testRange;
            const rangeFr = testRange === 0 ? "au CàC (0\")" : `à ${testRange}\"`;
            const rangeEn = testRange === 0 ? "in Melee (0\")" : `at ${testRange}\"`;
            metricDef.labelFr = metricDef.labelFr.replace('vs', `${rangeFr} vs`);
            metricDef.labelEn = metricDef.labelEn.replace('vs', `${rangeEn} vs`);
          }
        }
        if (unit1.id !== unit2.id) {
          const val1 = evaluateMetric(unit1, metricDef, display);
          const val2 = evaluateMetric(unit2, metricDef, display);
          if (val1.value !== val2.value) {
            nextQuestion = {
              unit1,
              unit2,
              metricDef,
              val1,
              val2,
              winnerId: val1.value > val2.value ? unit1.id : unit2.id
            };
            break;
          }
        }
        attempts++;
      }
      setQuestion(nextQuestion);
      setIsGenerating(false);
    }, 50);
    return () => clearTimeout(timer);
  }, [eligibleUnits, seedIndex]);

  if (isGenerating) {
    return (
      <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }}>
        <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div className="radar-spinner" aria-hidden="true" style={{ margin: '0 auto 1.5rem' }}>
            <div className="radar-ring" />
            <div className="radar-sweep" />
            <div className="radar-cross" />
          </div>
          <p className="loading-pulse" style={{ margin: 0 }}>{isFrench ? "Analyse tactique en cours..." : "Tactical analysis in progress..."}</p>
        </div>
      </section>
    );
  }

  if (!question) {
    return (
      <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }}>
        <div style={{ textAlign: 'center', padding: '1.5rem' }}>
          <h3>⚠️ {isFrench ? "Pas assez d'unités pour comparer" : "Not enough units to compare"}</h3>
        </div>
      </section>
    );
  }

  const handleVerify = () => {
    if (!selectedUnitId || checked) return;
    const isCorrect = selectedUnitId === question.winnerId;
    setChecked(true);
    onScoreUpdate(isCorrect);
  };

  const handleNext = () => {
    if (!lastCorrect && question) {
      setFailedSchedule(prev => [...prev, { turn: turn + 5, q: question }]);
    }
    setTurn(prev => prev + 1);
    setSelectedUnitId(null);
    setChecked(false);
    setShowDetails(false);
    setSeedIndex(Math.floor(Math.random() * 100000));
    onAdvance();
  };

  const isWinner = (u: NormalizedUnit) => u.id === question.winnerId;

  const renderUnitCard = (unit: NormalizedUnit, val: ReturnType<typeof evaluateMetric>) => {
    const isSelected = selectedUnitId === unit.id;
    const isWin = isWinner(unit);
    let border = isSelected ? '2px solid var(--gold-dark)' : '1px solid #d4c8b7';
    let bg = isSelected ? 'var(--gold, #dcb15b)' : '#fffefa';
    
    if (checked) {
      if (isWin) {
        border = '2px solid #296345';
        bg = isSelected ? '#d1e7dd' : '#eef8f2';
      } else {
        border = isSelected ? '2px solid #b83228' : '1px solid #d4c8b7';
        bg = isSelected ? '#f8d7da' : '#fffefa';
      }
    }

    const img = getUnitImgUrl(unit.id);

    return (
      <div 
        onClick={() => !checked && setSelectedUnitId(unit.id)}
        style={{
          border,
          background: bg,
          borderRadius: '0.65rem',
          padding: '0.85rem',
          cursor: checked ? 'default' : 'pointer',
          flex: '1 1 250px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
          textAlign: 'center',
          transition: 'all 0.2s ease',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {checked && isWin && (
          <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', fontSize: '1.5rem' }}>👑</div>
        )}
        {checked && !isWin && isSelected && (
          <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', fontSize: '1.5rem' }}>❌</div>
        )}

        <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', background: '#e1d8ca', flexShrink: 0 }}>
           {img ? <img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem'}}>❓</div>}
        </div>
        <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{display.unitName(unit)}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>{display.factionName(unit.factionName)}</div>

        {checked && (
          <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.6)', borderRadius: '0.4rem', width: '100%' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: isWin ? '#0f5132' : 'var(--ink-soft)' }}>
              {val.displayValue}
            </div>
            {val.profileName && (
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                {val.profileName}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 0.5rem', color: 'var(--ink)' }}>
          {isFrench ? question.metricDef.labelFr : question.metricDef.labelEn}
        </h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', margin: 0 }}>
          {isFrench ? 'Quelle unité a la meilleure caractéristique ?' : 'Which unit has the better stat?'}
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
        {renderUnitCard(question.unit1, question.val1)}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem', color: 'var(--ink-soft)' }}>VS</div>
        {renderUnitCard(question.unit2, question.val2)}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <button 
          onClick={() => setShowDetails(!showDetails)} 
          style={{ background: 'transparent', border: '1px solid #d4c8b7', color: 'var(--ink)', padding: '0.5rem', width: '100%', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700 }}
        >
          {showDetails ? (isFrench ? '▲ Masquer les profils' : '▲ Hide profiles') : (isFrench ? '▼ Voir les profils détaillés' : '▼ View detailed profiles')}
        </button>
        
        {showDetails && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 250px', background: '#fffefa', padding: '1rem', border: '1px solid #d4c8b7', borderRadius: '0.5rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>{display.unitName(question.unit1)}</h4>
              <FullUnitDetails unit={question.unit1} isFrench={isFrench} display={display} />
            </div>
            <div style={{ flex: '1 1 250px', background: '#fffefa', padding: '1rem', border: '1px solid #d4c8b7', borderRadius: '0.5rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>{display.unitName(question.unit2)}</h4>
              <FullUnitDetails unit={question.unit2} isFrench={isFrench} display={display} />
            </div>
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem' }}>
        {!checked ? (
          <button onClick={handleVerify} disabled={!selectedUnitId} style={{ padding: '0.5rem 1.5rem', fontSize: '1rem' }}>
            ✓ {isFrench ? 'Vérifier' : 'Check'}
          </button>
        ) : (
          <button onClick={handleNext} style={{ padding: '0.5rem 1.5rem', fontSize: '1rem' }}>
            ➔ {isFrench ? 'Suivant' : 'Next'}
          </button>
        )}
      </div>
    </section>
  );
}

function calculateUnitDamage(profiles: SelectedWeaponProfile[], target: AnalysisTarget, range?: number, display?: CatalogLocalization) {
  let total = 0;
  let maxDmg = -1;
  let bestWeaponName = '';

  const grouped = new Map<string, { dmg: number, profile: SelectedWeaponProfile }>();

  for (const entry of profiles) {
    const dmg = estimateWeaponProfileDamage(entry.profile, target, entry.count, range);
    const key = modeKey(entry);
    const current = grouped.get(key);
    if (!current || dmg > current.dmg) {
      grouped.set(key, { dmg, profile: entry });
    }
  }

  let activeWeapons = 0;
  const activeWeaponNames: string[] = [];
  for (const { dmg, profile } of grouped.values()) {
    total += dmg;
    if (dmg > 0) {
      activeWeapons++;
      if (profile.count > 1) {
        activeWeaponNames.push(`${profile.count}x ${display && profile.profile.Name ? display.term(profile.profile.Name) : profile.profile.Name}`);
      } else {
        activeWeaponNames.push((display && profile.profile.Name ? display.term(profile.profile.Name) : profile.profile.Name) || '');
      }
    }
    if (dmg > maxDmg) {
      maxDmg = dmg;
      bestWeaponName = (display && profile.profile.Name ? display.term(profile.profile.Name) : profile.profile.Name) || '';
    }
  }

  return { total, maxDmg, bestWeaponName, activeWeapons, activeWeaponNames };
}

function evaluateMetric(unit: NormalizedUnit, metricDef: { key: CompareMetric; targetId?: string; range?: number }, display?: CatalogLocalization) {
  if (metricDef.targetId) {
    const target = ANALYSIS_TARGETS.find(t => t.id === metricDef.targetId);
    if (!target) return { value: 0, displayValue: '0', profileName: null };

    const pointIndex = Math.max(0, (unit.Points?.length ?? 1) - 1);
    const mockItem = { id: 'test', unitId: unit.id, pointIndex, wargearSelections: {}, wargearSelectionCounts: {} } as any;
    const baseWargear = resolveWargear(unit, mockItem);
    const rules = getWargearRules(unit);
    const compositionById = new Map(baseWargear.compositions.map(c => [c.id, c]));

    const bestSelections: Record<string, Record<string, number>> = {};
    
    for (const rule of rules) {
      if (rule.options.length === 0) continue;
      
      const comp = compositionById.get(rule.compositionId);
      const limit = ruleLimit(rule, comp?.count ?? 0, baseWargear.totalModels);
      if (limit <= 0) continue;

      let bestRuleOption = '';
      let bestRuleDamage = -1;
      
      let item = { ...mockItem, wargearSelectionCounts: { ...bestSelections } };
      let wargear = resolveWargear(unit, item);
      let dmg = calculateUnitDamage(wargear.profiles, target, metricDef.range, display).total;
      bestRuleDamage = dmg;

      for (const option of rule.options) {
        item = { ...mockItem, wargearSelectionCounts: { ...bestSelections, [rule.id]: { [option]: limit } } };
        wargear = resolveWargear(unit, item);
        const currentDmg = calculateUnitDamage(wargear.profiles, target, metricDef.range, display).total;
        
        if (currentDmg > bestRuleDamage) {
          bestRuleDamage = currentDmg;
          bestRuleOption = option;
        }
      }
      
      if (bestRuleOption) {
        bestSelections[rule.id] = { [bestRuleOption]: limit };
      }
    }
    
    const finalItem = { ...mockItem, wargearSelectionCounts: bestSelections };
    const finalWargear = resolveWargear(unit, finalItem);
    
    const { total: totalDamage, bestWeaponName, activeWeapons, activeWeaponNames } = calculateUnitDamage(finalWargear.profiles, target, metricDef.range, display);
    const bestTotalModels = finalWargear.totalModels;
    
    const weaponsStr = activeWeaponNames && activeWeaponNames.length > 0 
      ? ` (armes: ${activeWeaponNames.join(', ')})`
      : '';
    const profileName = `${bestTotalModels} fig${bestTotalModels > 1 ? 's' : ''}` + weaponsStr;

    return {
      value: Math.max(0, totalDamage),
      displayValue: Math.max(0, totalDamage).toFixed(2) + ' dmg',
      profileName
    };
  } else {
    const line = unit.StatLines?.[0];
    if (!line) return { value: 0, displayValue: '0', profileName: null };
    const raw = getExpectedStatValue(line, metricDef.key);
    const num = parseInt(raw) || 0;
    return {
      value: num,
      displayValue: raw,
      profileName: null
    };
  }
}


function FullUnitDetails({ unit, isFrench, display }: { unit: NormalizedUnit, isFrench: boolean, display: CatalogLocalization }) {
  const wp = weaponProfiles(unit);
  const groups = new Map<string, SelectedWeaponProfile[]>();
  wp.forEach((entry) => {
    const values = groups.get(entry.group) ?? [];
    values.push(entry);
    groups.set(entry.group, values);
  });

  return (
    <div style={{ textAlign: 'left', fontSize: '0.85rem', width: '100%' }} className="learning-unit-details">
      {unit.StatLines?.map((line, idx) => {
         const profileName = typeof line.StatName === 'string' ? line.StatName.trim() : '';
         return (
           <section key={idx} className="unit-profile">
             {profileName && <h4>{profileName}</h4>}
             <dl className="unit-stat-grid">
                <div><dt>{isFrench ? 'M' : 'M'}</dt><dd>{String(line.Movement ?? '—')}</dd></div>
                <div><dt>{isFrench ? 'E' : 'T'}</dt><dd>{String(line.Toughness ?? '—')}</dd></div>
                <div><dt>{isFrench ? 'Sv' : 'Sv'}</dt><dd>{String(line.Save ?? '—')}</dd></div>
                <div><dt>{isFrench ? 'PV' : 'W'}</dt><dd>{String(line.Wounds ?? '—')}</dd></div>
                <div><dt>{isFrench ? 'Cd' : 'Ld'}</dt><dd>{String(line.Leadership ?? '—')}</dd></div>
                <div><dt>{isFrench ? 'CO' : 'OC'}</dt><dd>{String(line.OC ?? '—')}</dd></div>
             </dl>
           </section>
         );
      })}

      {(unit.UnitComposition?.ModelCompositions?.length ?? 0) > 0 && (
        <section className="unit-composition" style={{ margin: '0.75rem 0' }}>
          <h4>{isFrench ? 'Composition' : 'Composition'}</h4>
          <ul style={{ margin: '0', paddingLeft: '1.25rem' }}>
            {unit.UnitComposition?.ModelCompositions?.map((model, index) => {
              const min = model.Limit?.Min;
              const max = model.Limit?.Max;
              const name = model.ModelName || 'figurine';
              let txt = name;
              if (typeof min === 'number' && typeof max === 'number') {
                txt = min === max ? `${min} ${name}` : `${min}-${max} ${name}`;
              } else if (typeof min === 'number') {
                txt = `min. ${min} ${name}`;
              } else if (typeof max === 'number') {
                txt = `max. ${max} ${name}`;
              }
              return <li key={index}>{txt}</li>;
            })}
          </ul>
        </section>
      )}

      {[...groups.entries()].map(([group, entries]) => (
        <section className="weapon-table-section" key={group} style={{ margin: '0.75rem 0' }}>
          <h4>{display.term(group)}</h4>
          <div className="weapon-table-scroll">
            <table>
              <thead><tr><th>{isFrench ? 'Arme' : 'Weapon'}</th><th>{isFrench ? 'Portée' : 'Range'}</th><th>A</th><th>{entries[0].melee ? 'CC' : 'CT'}</th><th>F</th><th>PA</th><th>D</th><th>{isFrench ? 'Aptitudes' : 'Abilities'}</th></tr></thead>
              <tbody>
                {entries.map(({ profile }, index) => (
                  <tr key={index}>
                    <th scope="row">{profile.Name ? display.term(profile.Name) : (isFrench ? 'Arme' : 'Weapon')}</th>
                    <td>{profile.Range || '—'}</td><td>{profile.Attacks || '—'}</td><td>{profile.ToHit || '—'}</td>
                    <td>{profile.Strength || '—'}</td><td>{profile.AP || '—'}</td><td>{profile.Damage || '—'}</td><td>{display.term(profile.Keywords) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {(unit.UnitAbilities?.length ?? 0) > 0 && <h3 style={{ margin: '0.75rem 0 0.5rem' }}>{isFrench ? 'Aptitudes' : 'Abilities'}</h3>}
      {unit.UnitAbilities?.map((ability, index) => <p key={index} style={{ margin: '0 0 0.5rem' }}><strong>{ability.Title}</strong> {ability.Text}</p>)}
    </div>
  );
}

