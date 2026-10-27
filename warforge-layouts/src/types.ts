export type Point = [number, number];
export type Rotation = 0 | 90 | 180 | 270;
export type Corner = "tl" | "tr" | "bl" | "br";
export type MeasureMode = "off" | "selected" | "all";
export interface Template {
  id: string;
  name: string;
  nominalSize: Point;
  polygon: Point[];
  anchorIndices: [number, number];
  quantity: number;
}
export interface Terrain {
  id: string;
  number: number;
  templateId: string;
  angle: number;
  reflected: boolean;
  translation: Point;
}
export interface ElementKind {
  id: string;
  name: string;
  officialName: string;
  category: "dense" | "light";
  kit: string;
  illustratedUpperFloors: number | null;
  heightInches: number | null;
  floorElevationInches: number | null;
  note: string;
  sourceUrl: string;
}
export interface TerrainElement {
  id: string;
  terrainId: string;
  kind: string;
  quantity: number;
  rings: Point[][];
  precision: "illustrative-source-outline";
}
export interface Summary {
  id: string;
  pair: string;
  teams: string[];
  title: string;
  variant: number;
  thumbnail: string;
  data: string;
}
export interface Source {
  id: string;
  title: string;
  url: string;
  date: string;
}
export interface Manifest {
  schemaVersion: "warforge-layouts/v1";
  version: string;
  validAsOf: string;
  board: Point;
  templates: Template[];
  kinds: ElementKind[];
  layouts: Summary[];
  sources: Source[];
  precisionNote: string;
}
export interface Layout extends Summary {
  board: Point;
  terrain: Terrain[];
  elements: TerrainElement[];
  objectives: {
    id: string;
    kind: string;
    point: Point;
    terrainId: string;
    precision: string;
  }[];
  deployments: { role: string; polygon: Point[] }[];
  source: {
    url: string;
    measuredImage: string;
    plainSha256: string;
    measuredSha256: string;
    geometryPrecision: string;
    compositionBasis: string;
  };
}
export interface ViewState {
  layout: string;
  rotation: Rotation;
  corner: Corner;
  terrain: string | null;
  measures: MeasureMode;
  grid: boolean;
  deployments: boolean;
  objectives: boolean;
}
