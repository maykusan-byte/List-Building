import './ReferenceComponents.css';

export interface StratagemProps {
  name: string;
  category?: string;
  cpCost?: number;
  phase?: string;
  when?: string;
  target?: string;
  effect?: string;
  restrictions?: string;
}

export function StratagemCard({ name, category, cpCost, phase, when, target, effect, restrictions }: StratagemProps) {
  return (
    <article className="stratagem-card">
      <header className="stratagem-header">
        <div className="stratagem-title-row">
          <h3 className="stratagem-name">{name}</h3>
          <span className="stratagem-cp">{cpCost ?? 1} CP</span>
        </div>
        <div className="stratagem-meta">
          {category && <span className="stratagem-category">{category}</span>}
          {phase && <span className="stratagem-phase">{phase}</span>}
        </div>
      </header>
      <div className="stratagem-body">
        {when && (
          <p className="stratagem-section">
            <strong>Quand : </strong> {when}
          </p>
        )}
        {target && (
          <p className="stratagem-section">
            <strong>Cible : </strong> {target}
          </p>
        )}
        {effect && (
          <p className="stratagem-section">
            <strong>Effet : </strong> {effect}
          </p>
        )}
        {restrictions && (
          <p className="stratagem-section">
            <strong>Restrictions : </strong> {restrictions}
          </p>
        )}
      </div>
    </article>
  );
}
