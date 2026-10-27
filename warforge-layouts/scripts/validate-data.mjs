import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../public");
const json = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const finitePoint = (p) =>
  Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const unique = (items, field) =>
  assert.equal(
    new Set(items.map((x) => x[field])).size,
    items.length,
    `Duplicate ${field}`,
  );
export function validateData() {
  const manifest = json("data/manifest.json"),
    integrity = json("data/integrity.json");
  assert.equal(manifest.schemaVersion, "warforge-layouts/v1");
  assert.deepEqual(manifest.board, [44, 60]);
  assert.equal(manifest.layouts.length, 45);
  assert.equal(manifest.templates.length, 5);
  unique(manifest.layouts, "id");
  unique(manifest.templates, "id");
  unique(manifest.kinds, "id");
  const templates = new Map(manifest.templates.map((t) => [t.id, t]));
  const kinds = new Map(manifest.kinds.map((k) => [k.id, k]));
  for (const t of templates.values()) {
    assert(t.polygon.length >= 3 && t.polygon.every(finitePoint));
    assert(finitePoint(t.nominalSize) && t.nominalSize.every((n) => n > 0));
    assert.equal(new Set(t.anchorIndices).size, 2);
    assert(
      t.anchorIndices.every(
        (i) => Number.isInteger(i) && i >= 0 && i < t.polygon.length,
      ),
    );
  }
  let placements = 0,
    vertices = 0;
  for (const row of manifest.layouts) {
    assert.match(row.id, /^[a-z0-9-]+$/);
    assert([1, 2, 3].includes(row.variant));
    assert.equal(row.data, `data/layouts/${row.id}.json`);
    const l = json(row.data);
    assert.equal(l.id, row.id);
    assert.deepEqual(l.board, [44, 60]);
    assert.equal(l.terrain.length, 16);
    assert.equal(l.deployments.length, 2);
    assert.equal(l.objectives.length, 6);
    unique(l.terrain, "id");
    unique(l.elements, "id");
    unique(l.objectives, "id");
    assert.deepEqual(
      l.terrain.map((t) => t.number),
      Array.from({ length: 16 }, (_, i) => i + 1),
    );
    const tids = new Set(l.terrain.map((t) => t.id));
    for (const t of l.terrain) {
      const template = templates.get(t.templateId);
      assert(template);
      assert(Number.isFinite(t.angle));
      assert.equal(typeof t.reflected, "boolean");
      assert(finitePoint(t.translation));
      const rad = (t.angle * Math.PI) / 180;
      for (const [px, y] of template.polygon) {
        const x = t.reflected ? -px : px;
        const p = [
          x * Math.cos(rad) - y * Math.sin(rad) + t.translation[0],
          x * Math.sin(rad) + y * Math.cos(rad) + t.translation[1],
        ];
        assert(
          p[0] >= -0.001 && p[0] <= 44.001 && p[1] >= -0.001 && p[1] <= 60.001,
          `${l.id}/${t.id} outside board`,
        );
        vertices++;
      }
      assert(
        l.elements.some((el) => el.terrainId === t.id),
        `${l.id}/${t.id} has no composition`,
      );
      placements++;
    }
    const counts = {};
    for (const el of l.elements) {
      assert(tids.has(el.terrainId));
      assert(kinds.has(el.kind));
      assert(Number.isInteger(el.quantity) && el.quantity > 0);
      assert.equal(el.precision, "illustrative-source-outline");
      assert(
        el.rings.length &&
          el.rings.every((r) => r.length >= 3 && r.every(finitePoint)),
      );
      counts[el.kind] = (counts[el.kind] ?? 0) + el.quantity;
    }
    assert.deepEqual(counts, {
      "large-ruin": 8,
      "small-ruin": 8,
      shrine: 2,
      barricade: 4,
      capacitor: 2,
      "shock-array": 2,
      pylon: 4,
    });
    for (const o of l.objectives) {
      assert(tids.has(o.terrainId));
      assert(finitePoint(o.point));
      assert(
        o.point[0] >= 0 &&
          o.point[0] <= 44 &&
          o.point[1] >= 0 &&
          o.point[1] <= 60,
      );
    }
    for (const zone of l.deployments) {
      assert(["attacker", "defender"].includes(zone.role));
      assert(zone.polygon.length >= 3 && zone.polygon.every(finitePoint));
    }
    assert.equal(l.source.geometryPrecision, "image-registered-approximation");
    assert.match(l.source.url, /^https:\/\/gdmissions\.app\//);
    assert(
      integrity.files[row.data] &&
        integrity.files[row.thumbnail] &&
        integrity.files[l.source.measuredImage],
    );
  }
  for (const [path, hash] of Object.entries(integrity.files)) {
    const full = resolve(root, path);
    assert(!relative(root, full).startsWith(".." + sep));
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(
      createHash("sha256").update(readFileSync(full)).digest("hex"),
      hash,
      `Changed public resource: ${path}`,
    );
  }
  const files = [];
  function walk(dir) {
    for (const file of readdirSync(dir)) {
      const p = resolve(dir, file);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(relative(root, p).split(sep).join("/"));
    }
  }
  walk(root);
  assert.deepEqual(
    files.filter((f) => f !== "data/integrity.json").sort(),
    Object.keys(integrity.files).sort(),
    "Unlisted file in public artifact",
  );
  assert.equal(placements, 720);
  return {
    layouts: manifest.layouts.length,
    placements,
    vertices,
    files: files.length,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log("Validated public snapshot:", validateData());
