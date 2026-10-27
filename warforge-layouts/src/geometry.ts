import type { Corner, Point, Rotation, Template, Terrain } from "./types";

export const corners: { id: Corner; label: string; symbol: string }[] = [
  { id: "tl", label: "Haut gauche", symbol: "↖" },
  { id: "tr", label: "Haut droit", symbol: "↗" },
  { id: "bl", label: "Bas gauche", symbol: "↙" },
  { id: "br", label: "Bas droit", symbol: "↘" },
];
export function place([x0, y]: Point, terrain: Terrain): Point {
  const x = terrain.reflected ? -x0 : x0;
  const angle = (terrain.angle * Math.PI) / 180;
  return [
    x * Math.cos(angle) - y * Math.sin(angle) + terrain.translation[0],
    x * Math.sin(angle) + y * Math.cos(angle) + terrain.translation[1],
  ];
}
export function rotate(
  [x, y]: Point,
  rotation: Rotation,
  [w, h]: Point = [44, 60],
): Point {
  switch (rotation) {
    case 90:
      return [h - y, x];
    case 180:
      return [w - x, h - y];
    case 270:
      return [y, w - x];
    default:
      return [x, y];
  }
}
export function boardSize(rotation: Rotation, size: Point = [44, 60]): Point {
  return rotation % 180 ? [size[1], size[0]] : size;
}
export function distances([x, y]: Point, corner: Corner, [w, h]: Point): Point {
  return [corner.endsWith("r") ? w - x : x, corner.startsWith("b") ? h - y : y];
}
export function anchors(
  terrain: Terrain,
  template: Template,
  rotation: Rotation,
): [Point, Point] {
  return template.anchorIndices.map((i) =>
    rotate(place(template.polygon[i], terrain), rotation),
  ) as [Point, Point];
}
export function path(rings: Point[][]): string {
  return rings
    .map((r) => (r.length ? `M${r.map((p) => p.join(",")).join("L")}Z` : ""))
    .join("");
}
export function bounds(points: Point[]) {
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
export function center(points: Point[]): Point {
  const b = bounds(points);
  return [b.x + b.width / 2, b.y + b.height / 2];
}
const formatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
export const inches = (value: number) =>
  `${formatter.format(Math.abs(value) < 0.05 ? 0 : value)}″`;
export const approximate = (value: number) => `≈ ${inches(value)}`;
export function zoomAt(
  camera: { x: number; y: number; width: number; height: number },
  point: Point,
  factor: number,
) {
  return {
    x: point[0] + (camera.x - point[0]) / factor,
    y: point[1] + (camera.y - point[1]) / factor,
    width: camera.width / factor,
    height: camera.height / factor,
  };
}
