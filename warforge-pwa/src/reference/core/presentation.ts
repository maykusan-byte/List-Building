import type { RulesDocument, RulesSection } from './types';

export type RuleReadingContextId = 'fundamentals' | 'round' | 'command' | 'movement' | 'shooting' | 'charge' | 'combat';

export interface RuleReadingContext {
  id: RuleReadingContextId;
  label: { fr: string; en: string };
  description: { fr: string; en: string };
  primarySectionIds: string[];
  supportingSectionIds: string[];
}

export const coreRuleContexts: RuleReadingContext[] = [
  {
    id: 'fundamentals',
    label: { fr: 'Fondamentaux', en: 'Fundamentals' },
    description: { fr: 'Les repères nécessaires avant de suivre le déroulé d’un round.', en: 'The references to read before following a battle round.' },
    primarySectionIds: ['concepts-de-base', 'fiches-techniques'],
    supportingSectionIds: ['autres-concepts', 'aptitudes-de-base']
  },
  {
    id: 'round',
    label: { fr: 'Round', en: 'Battle round' },
    description: { fr: 'Le déroulé d’ensemble et l’ordre des phases.', en: 'The overall flow and order of phases.' },
    primarySectionIds: ['round-de-bataille'],
    supportingSectionIds: ['objectifs', 'stratagemes', 'actions']
  },
  {
    id: 'command',
    label: { fr: 'Commandement', en: 'Command' },
    description: { fr: 'La référence de la phase de Commandement et les règles fréquemment liées.', en: 'The Command phase reference and commonly related rules.' },
    primarySectionIds: ['phase-de-commandement'],
    supportingSectionIds: ['objectifs', 'stratagemes', 'actions']
  },
  {
    id: 'movement',
    label: { fr: 'Mouvement', en: 'Movement' },
    description: { fr: 'Déplacements, terrain et cas de mouvement à consulter ensemble.', en: 'Movement, terrain and related movement cases to consult together.' },
    primarySectionIds: ['phase-de-mouvement', 'mouvement'],
    supportingSectionIds: ['terrain', 'transports', 'reserves-strategiques', 'vol-et-elan']
  },
  {
    id: 'shooting',
    label: { fr: 'Tir', en: 'Shooting' },
    description: { fr: 'La phase de Tir, les attaques et leur séquence officielle.', en: 'The Shooting phase, attacks and their official sequence.' },
    primarySectionIds: ['phase-de-tir', 'effectuer-des-attaques', 'sequence-d-attaque'],
    supportingSectionIds: ['terrain', 'monstres-et-vehicules', 'stratagemes']
  },
  {
    id: 'charge',
    label: { fr: 'Charge', en: 'Charge' },
    description: { fr: 'La phase de Charge et les renvois utiles pour les mouvements et le terrain.', en: 'The Charge phase and useful movement and terrain references.' },
    primarySectionIds: ['phase-de-charge'],
    supportingSectionIds: ['mouvement', 'terrain', 'unites-attachees', 'stratagemes']
  },
  {
    id: 'combat',
    label: { fr: 'Combat', en: 'Fight' },
    description: { fr: 'La phase de Combat avec la procédure d’attaque correspondante.', en: 'The Fight phase with its corresponding attack procedure.' },
    primarySectionIds: ['phase-de-combat', 'effectuer-des-attaques', 'sequence-d-attaque'],
    supportingSectionIds: ['terrain', 'objectifs', 'stratagemes']
  }
];

function sectionsById(document: RulesDocument): Map<string, RulesSection> {
  return new Map(document.chapters.flatMap((chapter) => chapter.sections.map((section) => [section.id, section])));
}

function pickSections(ids: string[], sectionMap: Map<string, RulesSection>, excluded: Set<string>): RulesSection[] {
  return ids.flatMap((id) => {
    const section = sectionMap.get(id);
    if (!section || excluded.has(id)) return [];
    excluded.add(id);
    return [section];
  });
}

export function sectionsForRuleContext(document: RulesDocument, context: RuleReadingContext): { primary: RulesSection[]; supporting: RulesSection[] } {
  const sectionMap = sectionsById(document);
  const seen = new Set<string>();
  const primary = pickSections(context.primarySectionIds, sectionMap, seen);
  return { primary, supporting: pickSections(context.supportingSectionIds, sectionMap, seen) };
}
