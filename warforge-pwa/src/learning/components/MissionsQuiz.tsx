import { useState, useMemo, useEffect } from 'react';
import { useQuizQueue } from '../useQuizQueue';
import { shuffleArray } from '../learning-utils';

export interface MissionsQuizProps {
  isFrench: boolean;
  onAdvance: () => void;
  onScoreUpdate: (isCorrect: boolean) => void;
}

const parseMd = (str: string) => {
  if (!str) return '';
  return str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
};

const formatDisposition = (val: string) => {
  if (!val) return '';
  return val.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const MissionRules = ({ target, isSelected }: { target: any, isSelected?: boolean }) => (
  <div style={{ textAlign: 'left', fontSize: '0.9rem' }}>
    {target.whenDrawn && (
      <div style={{ marginBottom: '1rem', padding: '0.5rem', background: 'rgba(0,0,0,0.03)', borderLeft: `4px solid ${target.type === 'Primary' ? '#1f4f8a' : '#8a2b2b'}`, borderRadius: '0 4px 4px 0' }} dangerouslySetInnerHTML={{ __html: parseMd(target.whenDrawn) }} />
    )}
    
    {target.action && (
      <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f8f4eb', borderRadius: '6px', border: '1px solid #e2d8c9' }}>
        <strong style={{ fontSize: '1rem', letterSpacing: '0.02em', textTransform: 'uppercase' }}>{target.action.title}</strong>
        <ul style={{ paddingLeft: '1.25rem', margin: '0.25rem 0 0 0', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {target.action.rows?.map((r: any, i: number) => (
             <li key={i}><strong>{r.k}:</strong> <span dangerouslySetInnerHTML={{ __html: parseMd(r.v) }} /></li>
          ))}
        </ul>
      </div>
    )}
    
    {target.sections?.map((sec: any, i: number) => (
      <div key={i} style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 800, fontSize: '0.8rem', color: isSelected ? 'inherit' : (target.type === 'Primary' ? '#1f4f8a' : '#8a2b2b'), textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', marginBottom: '0.5rem' }}>{sec.when}</div>
        {sec.trigger && <div style={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--ink-soft)', marginBottom: '0.5rem' }}>{sec.trigger}</div>}
        
        <ul style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {sec.tiers?.map((t: any, idx: number) => (
             <li key={idx}>
               <span dangerouslySetInnerHTML={{ __html: parseMd(t.text) }} />
               <strong style={{ marginLeft: '0.5rem', color: isSelected ? 'inherit' : '#c9510c', whiteSpace: 'nowrap' }}>{t.vp} VP {t.perUnit ? '(per unit)' : ''}</strong>
             </li>
          ))}
          {sec.rows?.map((r: any, idx: number) => (
             <li key={idx}>
               <span dangerouslySetInnerHTML={{ __html: parseMd(r.text) }} />
               <strong style={{ marginLeft: '0.5rem', color: isSelected ? 'inherit' : '#c9510c', whiteSpace: 'nowrap' }}>{r.vp} VP</strong>
             </li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

export function MissionsQuiz({ isFrench, onAdvance, onScoreUpdate }: MissionsQuizProps) {
  const [missions, setMissions] = useState<{ primary: any[]; secondary: any[] } | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [layouts, setLayouts] = useState<Record<string, string[]> | null>(null);
  const [seedIndex, setSeedIndex] = useState(() => Math.floor(Math.random() * 100000));
  const [turn, setTurn] = useState<number>(0);
  const [failedSchedule, setFailedSchedule] = useState<any[]>([]);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  
  useEffect(() => {
    fetch(isFrench ? '/data/locales/fr/missions.json' : '/data/missions.json')
      .then(res => res.json())
      .then(data => setMissions(data))
      .catch(console.error);
      
    fetch('/data/layouts.json')
      .then(res => res.json())
      .then(data => setLayouts(data))
      .catch(console.error);
  }, []);

  const question = useMemo(() => {
    if (!missions) return null;
    let pool: any[] = [];
    if (filter === 'all' || filter === 'primary') {
      pool.push(...missions.primary.map((m: any) => ({ ...m, type: 'Primary' })));
    } else if (['take-and-hold', 'purge-the-foe', 'reconnaissance', 'priority-assets', 'disruption'].includes(filter)) {
      pool.push(...missions.primary.filter((m: any) => m.deck === filter).map((m: any) => ({ ...m, type: 'Primary' })));
    }
    
    if (filter === 'all' || filter === 'secondary') {
      pool.push(...missions.secondary.map((m: any) => ({ ...m, type: 'Secondary' })));
    }
    
    if (pool.length === 0) return null;

    const scheduled = failedSchedule.find((s: any) => s.turn === turn);
    if (scheduled) return scheduled.q as any;

    const targetIdx = (seedIndex * 2654435761) % pool.length;
    const target = pool[targetIdx];
    
    let options: string[] = [];
    let correctAnswer = '';
    
    // formats: 'composition' | 'rules' | 'rules-reverse'
    let format = 'rules';
    
    if (target.type === 'Primary') {
       const mod = seedIndex % 3;
       if (mod === 0) format = 'composition';
       else if (mod === 1) format = 'rules';
       else format = 'rules-reverse';
    } else {
       format = 'composition';
    }

    if (format === 'composition') {
      correctAnswer = target.name;
      const sameDeckPool = pool.filter((m: any) => m.deck === target.deck && m.name !== target.name);
      const distractors = shuffleArray(sameDeckPool).slice(0, 3).map((m: any) => m.name);
      options = shuffleArray([correctAnswer, ...distractors]);
    } else if (format === 'rules') {
      correctAnswer = target.vs;
      const allDispositions = ["take-and-hold", "purge-the-foe", "reconnaissance", "priority-assets", "disruption"];
      options = shuffleArray([...allDispositions]);
    } else if (format === 'rules-reverse') {
      correctAnswer = target.name;
      const sameDeckPool = pool.filter((m: any) => m.deck === target.deck && m.name !== target.name);
      const distractors = shuffleArray(sameDeckPool).slice(0, 3).map((m: any) => m.name);
      options = shuffleArray([correctAnswer, ...distractors]);
    }
    
    return { target, options, correctAnswer, format, pool };
  }, [missions, filter, seedIndex]);

  if (!missions) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading missions...</div>;
  if (!question) return <div style={{ padding: '2rem', textAlign: 'center' }}>No missions available</div>;

  const { target, options, correctAnswer, format, pool } = question;
  
  const handleOptionClick = (optVal: string) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(optVal);
    const isCorrect = optVal === correctAnswer;
    onScoreUpdate(isCorrect);
  };
  
  const nextQuestion = () => {
    if (!lastCorrect && question) {
      setFailedSchedule(prev => [...prev, { turn: turn + 5, q: question }]);
    }
    setTurn(prev => prev + 1);
    setSelectedAnswer(null);
    setSeedIndex(Math.floor(Math.random() * 100000));
    onAdvance();
  };

  const getQuestionText = () => {
    if (format === 'composition') {
      return isFrench ? 'Quelle est la mission primaire ?' : 'What is the primary mission?';
    }
    if (format === 'rules-reverse') {
      return isFrench ? 'Quelles sont les règles de la mission ?' : 'What are the rules of the mission?';
    }
    if (format === 'rules' && target.type === 'Primary') {
      return isFrench ? 'Contre quelle Force d\'opposition se joue cet objectif ?' : 'Against which Force Disposition is this objective played?';
    }
    return isFrench ? 'Quelle est cette mission ?' : 'What mission is this?';
  };
  
  const questionText = getQuestionText();

  // Helper to find the mission object based on name
  const getMissionByName = (name: string) => pool.find((m: any) => m.name === name);
  const selectedMissionObj = selectedAnswer ? (format === 'rules' ? target : getMissionByName(selectedAnswer)) : null;

  return (
    <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1.25rem' }}>
      <div className="quiz-header" style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'stretch' }}>
         <div className="learning-select-wrapper">
           <select
             className="learning-select"
             value={filter}
             onChange={(e) => { setFilter(e.target.value as any); setSelectedAnswer(null); setSeedIndex(Math.floor(Math.random() * 100000)); }}
           >
             <option value="all">{isFrench ? 'Toutes les missions' : 'All Missions'}</option>
             <optgroup label={isFrench ? 'Par Type' : 'By Type'}>
               <option value="primary">{isFrench ? 'Primaires' : 'Primary'}</option>
               <option value="secondary">{isFrench ? 'Secondaires' : 'Secondary'}</option>
             </optgroup>
             <optgroup label={isFrench ? 'Par Déploiement' : 'By Disposition'}>
               {['take-and-hold', 'purge-the-foe', 'reconnaissance', 'priority-assets', 'disruption'].map(deck => (
                 <option key={deck} value={deck}>{formatDisposition(deck)}</option>
               ))}
             </optgroup>
           </select>
           <div className="learning-select-icon">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <polyline points="6 9 12 15 18 9"></polyline>
             </svg>
           </div>
         </div>
      </div>

      <div style={{ textAlign: 'left', padding: '0', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--paper)', overflow: 'hidden' }}>
         <div style={{ background: target.type === 'Primary' ? '#1f4f8a' : '#8a2b2b', color: '#fff', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
           <div style={{ textTransform: 'uppercase', fontSize: '0.85rem', fontWeight: 900, letterSpacing: '0.05em', opacity: 0.9 }}>
             {target.type} Mission {target.deck && format === 'rules' ? `(${formatDisposition(target.deck)})` : ''}
           </div>
           <div style={{ opacity: 0.8 }}>
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
           </div>
         </div>

         {format === 'rules' && (
           <div style={{ padding: '1.5rem' }}>
             <MissionRules target={target} />
           </div>
         )}
         
         {(format === 'composition' || format === 'rules-reverse') && (
           <div style={{ padding: '3rem 1.5rem', textAlign: 'center', background: '#fcfaf5' }}>
             <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
               <div style={{ flex: '1 1 140px', background: '#1f4f8a', color: 'white', padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                 <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', opacity: 0.8, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                   {isFrench ? 'Votre Force' : 'Your Force'}
                 </div>
                 <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                   {formatDisposition(target.deck)}
                 </div>
               </div>
               
               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--paper-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: 'var(--ink-soft)', fontSize: '1.1rem' }}>
                   VS
                 </div>
               </div>
               
               <div style={{ flex: '1 1 140px', background: '#8a2b2b', color: 'white', padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                 <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', opacity: 0.8, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                   {isFrench ? 'Force adverse' : 'Enemy Force'}
                 </div>
                 <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                   {formatDisposition(target.vs)}
                 </div>
               </div>
             </div>
           </div>
         )}

         <div style={{ padding: '1.5rem', background: 'var(--paper-muted)', borderTop: '1px solid var(--border)' }}>
           <h3 style={{ textAlign: 'center', margin: '0 0 1.25rem 0', fontSize: '1.1rem', fontWeight: 800 }}>
             {questionText}
           </h3>
           <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
             {options.map((optVal: string) => {
                let btnStyle: React.CSSProperties = {
                   padding: '1rem',
                   fontSize: '1.05rem',
                   fontWeight: 700,
                  textAlign: 'left',
                  background: 'var(--paper)',
                  color: 'var(--ink)',
                  border: '2px solid var(--border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                };
                
                let icon = null;
                if (selectedAnswer !== null) {
                  btnStyle.cursor = 'default';
                  if (optVal === correctAnswer) {
                     btnStyle.background = '#2f6b4f';
                     btnStyle.borderColor = '#2f6b4f';
                     btnStyle.color = '#fff';
                     icon = <span style={{fontSize:'1.2rem', flexShrink: 0, marginLeft: '1rem'}}>✓</span>;
                  } else if (optVal === selectedAnswer) {
                     btnStyle.background = '#8a2b2b';
                     btnStyle.borderColor = '#8a2b2b';
                     btnStyle.color = '#fff';
                     icon = <span style={{fontSize:'1.2rem', flexShrink: 0, marginLeft: '1rem'}}>✗</span>;
                  } else {
                     btnStyle.opacity = 0.6;
                  }
                }
                
                let label = (format === 'rules' && target.type === 'Primary') ? formatDisposition(optVal) : optVal;
                
                return (
                  <button 
                    key={optVal} 
                    onClick={() => handleOptionClick(optVal)}
                    disabled={selectedAnswer !== null}
                    style={btnStyle}
                  >
                    {format === 'rules-reverse' ? (
                      <div style={{ width: '100%' }}>
                        <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Option
                        </div>
                        <MissionRules target={getMissionByName(optVal) || {}} isSelected={selectedAnswer !== null && (optVal === correctAnswer || optVal === selectedAnswer)} />
                      </div>
                    ) : (
                      <span>{label}</span>
                    )}
                    {icon}
                  </button>
                );
             })}
           </div>
           
           {selectedAnswer !== null && (
             <>
               {format === 'composition' && selectedMissionObj && (
                 <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: 'var(--paper)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                   <div style={{ fontWeight: 800, marginBottom: '1rem', textTransform: 'uppercase', fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
                     {isFrench ? 'Règles de la mission' : 'Mission Rules'}: {selectedMissionObj.name}
                   </div>
                   <MissionRules target={selectedMissionObj} />
                 </div>
               )}
               
               {target.type === 'Primary' && layouts && (
                 <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: 'var(--paper)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                   <div style={{ fontWeight: 800, marginBottom: '1rem', textTransform: 'uppercase', fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
                     {isFrench ? 'Layouts recommandés' : 'Recommended Layouts'}
                   </div>
                   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
                     {(layouts[`${target.deck}-vs-${target.vs}`] || layouts[`${target.vs}-vs-${target.deck}`])?.map((imgUrl: string, idx: number) => (
                       <div key={idx} style={{ textAlign: 'center' }}>
                         <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Layout {idx + 1}</div>
                         <img src={imgUrl} alt={`Layout ${idx + 1}`} style={{ width: '100%', height: 'auto', borderRadius: '4px', border: '1px solid var(--border)', objectFit: 'contain' }} />
                       </div>
                     ))}
                   </div>
                 </div>
               )}
               
               <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                 <button className="primary" style={{ padding: '0.75rem 2rem', fontSize: '1.1rem', borderRadius: '99px' }} onClick={nextQuestion}>
                   {isFrench ? 'Suivant ➔' : 'Next ➔'}
                 </button>
               </div>
             </>
           )}
         </div>
      </div>
    </section>
  );
}
