import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  anchors,
  boardSize,
  corners,
  distances,
  place,
  rotate,
  zoomAt,
} from "./geometry";
import { readState, stateHash } from "./state";
import type { Layout, Manifest, Point, Rotation, Terrain } from "./types";
const manifest = JSON.parse(
  readFileSync(
    new URL("../public/data/manifest.json", import.meta.url),
    "utf8",
  ),
) as Manifest;

describe("reference frames", () => {
  it("rotates known asymmetric points without mirroring the board", () => {
    const p: Point = [7, 13];
    expect(rotate(p, 0)).toEqual([7, 13]);
    expect(rotate(p, 90)).toEqual([47, 7]);
    expect(rotate(p, 180)).toEqual([37, 47]);
    expect(rotate(p, 270)).toEqual([13, 37]);
  });
  it("returns horizontal and vertical distances from all four corners", () => {
    expect(distances([7, 13], "tl", [44, 60])).toEqual([7, 13]);
    expect(distances([7, 13], "tr", [44, 60])).toEqual([37, 13]);
    expect(distances([7, 13], "bl", [44, 60])).toEqual([7, 47]);
    expect(distances([7, 13], "br", [44, 60])).toEqual([37, 47]);
  });
  it("reflects before rigid rotation and translation", () => {
    const t = { angle: 90, reflected: true, translation: [10, 20] } as Terrain;
    const p = place([2, 3], t);
    expect(p[0]).toBeCloseTo(7);
    expect(p[1]).toBeCloseTo(18);
  });
  it("keeps every real anchor inside the board and invariant when switching corner", () => {
    for (const summary of manifest.layouts) {
      const l = JSON.parse(
        readFileSync(
          new URL("../public/" + summary.data, import.meta.url),
          "utf8",
        ),
      ) as Layout;
      for (const t of l.terrain)
        for (const r of [0, 90, 180, 270] as Rotation[]) {
          const size = boardSize(r),
            points = anchors(
              t,
              manifest.templates.find((x) => x.id === t.templateId)!,
              r,
            );
          expect(points[0]).not.toEqual(points[1]);
          for (const p of points) {
            const d = corners.map((c) => distances(p, c.id, size));
            for (const pair of d) {
              expect(pair[0]).toBeGreaterThanOrEqual(-0.001);
              expect(pair[1]).toBeGreaterThanOrEqual(-0.001);
            }
            expect(d[0][0] + d[1][0]).toBeCloseTo(size[0], 8);
            expect(d[0][1] + d[2][1]).toBeCloseTo(size[1], 8);
          }
        }
    }
  });
  it("zooms around the pointer rather than the origin", () => {
    const c = { x: -5, y: -5, width: 54, height: 70 },
      p: Point = [12, 17];
    const z = zoomAt(c, p, 2);
    expect((p[0] - z.x) / z.width).toBeCloseTo((p[0] - c.x) / c.width);
    expect((p[1] - z.y) / z.height).toBeCloseTo((p[1] - c.y) / c.height);
  });
});
describe("shared view", () => {
  it("round trips every published state field", () => {
    const s = {
      ...readState("", manifest),
      rotation: 270 as Rotation,
      corner: "br" as const,
      terrain: "large-rectangle-03",
      measures: "all" as const,
      grid: false,
      deployments: false,
    };
    expect(readState(stateHash(s), manifest)).toEqual(s);
  });
  it("recovers invalid URLs into a usable layout", () => {
    const s = readState(
      "#layout=missing&rotation=123&corner=else&measures=bad",
      manifest,
    );
    expect(manifest.layouts.some((l) => l.id === s.layout)).toBe(true);
    expect(s.rotation).toBe(0);
    expect(s.corner).toBe("tl");
    expect(s.measures).toBe("selected");
  });
});
