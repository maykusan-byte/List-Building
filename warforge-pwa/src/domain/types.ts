export interface RawPointOption {
  ModelCount?: number;
  UnitCount?: number;
  Cost?: number;
}

export interface RawWargearDefinition {
  Key?: string;
  Cost?: number;
  GrantsAbilities?: string[];
}

export interface RawWargearOptionGroup {
  Options?: Array<{ Options?: string[]; Max?: number; Replaces?: string } | string>;
}

export interface RawUnit {
  Name?: string;
  Faction?: string;
  Keywords?: string[];
  FactionKeywords?: string[];
  CoreAbilities?: string[];
  UnitAbilities?: Array<{ Title?: string; Text?: string }>;
  Infos?: Array<{ Title?: string; Text?: string }>;
  StatLines?: Array<Record<string, unknown>>;
  Weapons?: Array<{ Name?: string; IsMelee?: boolean; Weapons?: Array<Record<string, unknown>> }>;
  Points?: RawPointOption[];
  UnitComposition?: {
    ModelCompositions?: Array<{
      ModelName?: string;
      Wargear?: RawWargearOptionGroup[];
    }>;
    WargearDefinitions?: RawWargearDefinition[];
  };
}

export interface RawEnhancement {
  Name?: string;
  Description?: string;
  Cost?: number;
  Features?: string;
  RequiredKeywords?: string[];
  RequiredOneOfKeywords?: string[];
  ExcludedKeywords?: string[];
  RequiredAbilities?: string[];
}

export interface RawEffect {
  AffectedUnits?: string[];
  AffectedUnitsByKeyword?: string[];
  AffectedUnitsExcludeKeyword?: string[];
  PointsOverride?: RawPointOption[];
}

export interface RawDetachment {
  Name?: string;
  Cost?: number;
  ForceDispositions?: string[];
  Tags?: string[];
  AdditionalFactionKeywords?: string[];
  RestrictedUnits?: string[];
  Rule?: { Title?: string; Text?: string; Restrictions?: string };
  Enhancements?: RawEnhancement[];
  Effects?: RawEffect[];
  Stratagems?: Array<{
    Name?: string;
    Category?: string;
    CPCost?: number;
    Phase?: string;
    When?: string;
    Target?: string;
    Effect?: string;
  }>;
}

export interface RawBattleSizeDefinition {
  PointsTotal?: number;
  DetachmentPoints?: number;
  EnhancementLimit?: number;
  UnitLimit?: number;
}

export interface RawBook {
  Id?: string;
  Name?: string;
  Version?: string;
  PublishDate?: string;
  BattleSizeDefinitions?: RawBattleSizeDefinition[];
  Units?: RawUnit[];
  Dettachments?: RawDetachment[];
}

export interface NormalizedUnit extends RawUnit {
  id: string;
  bookId: string;
  factionName: string;
  sourceIndex: number;
  displayName: string;
}

export interface NormalizedDetachment extends RawDetachment {
  id: string;
  bookId: string;
  factionName: string;
  sourceIndex: number;
  displayName: string;
}

export interface SourceBook {
  id: string;
  index: number;
  name: string;
  version?: string;
  publishDate?: string;
}

export interface FactionSummary {
  name: string;
  bookIds: string[];
  unitCount: number;
  detachmentCount: number;
}

export interface NormalizedDatabase {
  fingerprint: string;
  loadedAt: string;
  books: SourceBook[];
  factions: FactionSummary[];
  units: NormalizedUnit[];
  detachments: NormalizedDetachment[];
  battleSizes: Required<RawBattleSizeDefinition>[];
}

export interface EnhancementSelection {
  detachmentId: string;
  enhancementIndex: number;
}

export interface RosterItem {
  id: string;
  unitId: string;
  pointIndex: number;
  wargearSelections: Record<string, string>;
  enhancement?: EnhancementSelection;
}

export interface RosterDraft {
  id: string;
  name: string;
  primaryFaction: string;
  battleSizePoints: number;
  scenario: string;
  detachmentIds: string[];
  items: RosterItem[];
}

export interface CostBreakdown {
  base: number;
  pointOverride?: number;
  wargear: number;
  enhancement: number;
  total: number;
  notices: string[];
}

export interface ValidationIssue {
  id: string;
  level: 'error' | 'warning' | 'info';
  message: string;
}

export interface SavedDraft {
  id: string;
  name: string;
  updatedAt: string;
  draft: RosterDraft;
}

export interface ExportedList {
  schemaVersion: 'warforge-list/v1';
  databaseFingerprint: string;
  exportedAt: string;
  draft: RosterDraft;
}
