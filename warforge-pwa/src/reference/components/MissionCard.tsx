import './ReferenceComponents.css';

export interface MissionProps {
  name: string;
  type?: string; // e.g. Primary, Secondary, Deployment, Rule
  when?: string;
  trigger?: string;
  points?: string;
  description: string;
}

export function MissionCard({ name, type, when, trigger, points, description }: MissionProps) {
  return (
    <article className="stratagem-card">
      <header className="stratagem-header" style={{ background: 'var(--accent)', color: 'white' }}>
        <div className="stratagem-title-row">
          <h3 className="stratagem-name">{name}</h3>
          {points && <span className="stratagem-cp" style={{ background: 'white', color: 'var(--accent)' }}>{points} Pts</span>}
        </div>
        <div className="stratagem-meta">
          {type && <span className="stratagem-category">{type}</span>}
        </div>
      </header>
      <div className="stratagem-body">
        {when && (
          <p className="stratagem-section">
            <strong>Quand : </strong> {when}
          </p>
        )}
        {trigger && (
          <p className="stratagem-section">
            <strong>Déclencheur : </strong> {trigger}
          </p>
        )}
        <p className="stratagem-section">
          {description}
        </p>
      </div>
    </article>
  );
}
