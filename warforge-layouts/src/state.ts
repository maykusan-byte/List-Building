import type { Manifest, ViewState } from "./types";
export function readState(hash: string, manifest: Manifest): ViewState {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const layout =
    manifest.layouts.find((x) => x.id === p.get("layout"))?.id ??
    manifest.layouts.find((x) => x.id === "take-and-hold-mirror-1")?.id ??
    manifest.layouts[0].id;
  const r = Number(p.get("rotation") ?? 0);
  const c = p.get("corner");
  const m = p.get("measures");
  return {
    layout,
    rotation: r === 90 || r === 180 || r === 270 ? r : 0,
    corner: c === "tr" || c === "bl" || c === "br" ? c : "tl",
    terrain: p.get("terrain") || null,
    measures: m === "off" || m === "all" ? m : "selected",
    grid: p.get("grid") !== "0",
    deployments: p.get("deployments") !== "0",
    objectives: p.get("objectives") !== "0",
  };
}
export function stateHash(state: ViewState): string {
  const params = new URLSearchParams({
    layout: state.layout,
    rotation: String(state.rotation),
    corner: state.corner,
    measures: state.measures,
    grid: state.grid ? "1" : "0",
    deployments: state.deployments ? "1" : "0",
    objectives: state.objectives ? "1" : "0",
  });
  if (state.terrain) params.set("terrain", state.terrain);
  return "#" + params.toString();
}
