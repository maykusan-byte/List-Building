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
  InitalWargear?: string[];
  Options?: Array<RawWargearOption | string>;
}

export interface RawWargearOption {
  Options?: string[];
  Max?: number;
  PerXModels?: number;
  Replaces?: string[];
  RequiredDettachment?: string;
}

export interface RawWeaponProfile {
  Name?: string;
  Range?: string;
  Attacks?: string;
  ToHit?: string;
  Strength?: string;
  AP?: string;
  Damage?: string;
  Keywords?: string;
  NeverFilter?: boolean;
}

export interface RawWeaponGroup {
  Name?: string;
  IsMelee?: boolean;
  Weapons?: RawWeaponProfile[];
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
  Weapons?: RawWeaponGroup[];
  Points?: RawPointOption[];
  UnitComposition?: {
    ModelCompositions?: Array<{
      ModelName?: string;
      Limit?: { Min?: number; Max?: number };
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
  SourceKey?: string;
  SourceLabel?: string;
  Name?: string;
  Version?: string;
  PublishDate?: string;
  BattleSizeDefinitions?: RawBattleSizeDefinition[];
  Units?: RawUnit[];
  Dettachments?: RawDetachment[];
}

export interface RawFactionInfo {
  Name?: string;
  FactionKeyword?: string;
  AdditionalFactionKeywords?: string[];
  Allies?: Array<{ FactionKeyword?: string; AdditionalFactionKeywords?: string[] }>;
}

export interface RawCatalogBundle {
  SchemaVersion?: 'warforge-catalog/v2';
  DataInfo?: { Id?: string; Version?: string; MinAppVersion?: string; PublishDate?: string };
  FactionInfo?: { Factions?: RawFactionInfo[] };
  BattleSizeDefinitions?: RawBattleSizeDefinition[];
  Books?: RawBook[];
}

export interface NormalizedUnit extends RawUnit {
  id: string;
  bookId: string;
  sourceKey: string;
  factionName: string;
  sourceIndex: number;
  displayName: string;
}

export interface NormalizedDetachment extends RawDetachment {
  id: string;
  bookId: string;
  sourceKey: string;
  factionName: string;
  sourceIndex: number;
  displayName: string;
}

export interface SourceBook {
  id: string;
  index: number;
  name: string;
  sourceKey: string;
  sourceLabel: string;
  version?: string;
  publishDate?: string;
}

export interface FactionSummary {
  id: string;
  name: string;
  sourceKey: string;
  bookIds: string[];
  unitCount: number;
  detachmentCount: number;
}

export interface NormalizedDatabase {
  fingerprint: string;
  loadedAt: string;
  books: SourceBook[];
  factions: FactionSummary[];
  alliesByFaction: Record<string, string[]>;
  dataInfo?: RawCatalogBundle['DataInfo'];
  units: NormalizedUnit[];
  detachments: NormalizedDetachment[];
  battleSizes: Required<RawBattleSizeDefinition>[];
}

export interface EnhancementSelection {
  detachmentId: string;
  enhancementIndex: number;
}

export type WargearSelectionCounts = Record<string, Record<string, number>>;

export interface RosterItem {
  id: string;
  unitId: string;
  pointIndex: number;
  /** Legacy v1 summary, retained so older exports remain readable. */
  wargearSelections: Record<string, string>;
  /** Quantities for every selectable wargear option. */
  wargearSelectionCounts?: WargearSelectionCounts;
  /** Selected number of models for each composition entry. */
  modelCounts?: Record<string, number>;
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
