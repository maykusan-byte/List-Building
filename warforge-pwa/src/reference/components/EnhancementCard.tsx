import './ReferenceComponents.css';

export interface EnhancementProps {
  name: string;
  cost?: number;
  description?: string;
  features?: string;
}

export function EnhancementCard({ name, cost, description, features }: EnhancementProps) {
  return (
    <article className="enhancement-card">
      <header className="enhancement-header">
        <h3 className="enhancement-name">{name}</h3>
        {cost !== undefined && <span className="enhancement-cost">{cost} pts</span>}
      </header>
      <div className="enhancement-body">
        {description && <p>{description}</p>}
        {features && <p>{features}</p>}
      </div>
    </article>
  );
}
