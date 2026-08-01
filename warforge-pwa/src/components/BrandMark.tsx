interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps): React.JSX.Element {
  return (
    <span className={`brand-mark${compact ? ' compact' : ''}`} aria-hidden="true">
      <span>W</span>
    </span>
  );
}
