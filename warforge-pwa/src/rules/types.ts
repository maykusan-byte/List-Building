export type RulesBlock =
  | { kind: 'text'; text: string }
  | { kind: 'callout'; title: string; text: string }
  | { kind: 'table'; title?: string; columns: string[]; rows: string[][] }
  | { kind: 'diagram'; title: string; description: string; labels?: string[] };

export interface RulesPage {
  id: string;
  printedPage: number;
  blocks: RulesBlock[];
}

export interface RulesSection {
  id: string;
  reference?: string;
  title: string;
  sourcePages: [number, number];
  pages: RulesPage[];
}

export interface RulesChapter {
  id: string;
  title: string;
  sourcePages: [number, number];
  sections: RulesSection[];
}

export interface RulesSource {
  title: string;
  language: 'fr';
  filename: string;
  pdfPageCount: number;
  modifiedAt: string;
  version: null;
}

export interface MissionSource {
  label: string;
  url: string;
}

export interface MissionFramework {
  packName: string;
  language: 'fr';
  status: 'public-summary';
  sources: MissionSource[];
  primary: string[];
  secondary: string[];
  unavailableNotice: string;
}

export interface RulesDocument {
  schemaVersion: 'warforge-rules/v1';
  title: string;
  source: RulesSource;
  chapters: RulesChapter[];
  missionFramework: MissionFramework;
}
