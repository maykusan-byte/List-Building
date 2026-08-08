import { useState } from 'react';
import './ReferenceComponents.css';

export interface RuleTooltipProps {
  keyword: string;
  definition: string;
  children: React.ReactNode;
}

export function RuleTooltip({ keyword, definition, children }: RuleTooltipProps) {
  // En l'absence de librairie tooltip comme Radix, on fait un rendu inline basique 
  // avec un title HTML natif pour rester simple et léger
  return (
    <span className="rule-tooltip-trigger" title={`${keyword}: ${definition}`}>
      {children}
    </span>
  );
}
