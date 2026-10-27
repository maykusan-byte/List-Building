import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Layout, Manifest, Point, ViewState } from "./types";
import {
  anchors,
  approximate,
  boardSize,
  center,
  distances,
  path,
  place,
  rotate,
  zoomAt,
} from "./geometry";

interface Props {
  layout: Layout;
  manifest: Manifest;
  state: ViewState;
  onSelect: (id: string) => void;
  onCorner: (corner: ViewState["corner"]) => void;
}
export function Board({ layout, manifest, state, onSelect, onCorner }: Props) {
  const [w, h] = boardSize(state.rotation);
  const initial = useMemo(
    () => ({ x: -5, y: -5, width: w + 10, height: h + 10 }),
    [w, h],
  );
  const [camera, setCamera] = useState(initial);
  const svg = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 700 });
  const scale = Math.min(
    viewport.width / camera.width,
    viewport.height / camera.height,
  );
  const labelSize = Math.max(0.75, 12 / scale);
  const numberSize = Math.max(0.75, 10 / scale);
  const numberRadius = Math.max(0.84, 8 / scale);
  const moved = useRef(false);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ point: Point; distance: number } | null>(null);
  const rawId = useId().replace(/:/g, "");
  const gridId = `grid${rawId}`,
    hatchId = `hatch${rawId}`;
  const templates = useMemo(
    () => new Map(manifest.templates.map((t) => [t.id, t])),
    [manifest],
  );
  const kinds = useMemo(
    () => new Map(manifest.kinds.map((t) => [t.id, t])),
    [manifest],
  );
  useEffect(() => {
    setCamera(initial);
    pointers.current.clear();
    gesture.current = null;
  }, [layout.id, state.rotation, initial]);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function local(client: Point): Point {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return [0, 0];
    const point = new DOMPoint(...client).matrixTransform(matrix.inverse());
    return [point.x, point.y];
  }
  function zoom(factor: number, point?: Point) {
    setCamera((c) => {
      const actual = Math.max(
        initial.width / 8,
        Math.min(initial.width * 1.3, c.width / factor),
      );
      return zoomAt(
        c,
        point ?? [c.x + c.width / 2, c.y + c.height / 2],
        c.width / actual,
      );
    });
  }
  useEffect(() => {
    const node = svg.current;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      zoom(
        Math.exp(-event.deltaY * 0.0015),
        local([event.clientX, event.clientY]),
      );
    }
    node?.addEventListener("wheel", wheel, { passive: false });
    return () => node?.removeEventListener("wheel", wheel);
  }, [initial]);
  function currentGesture() {
    const p = [...pointers.current.values()];
    return p.length > 1
      ? {
          point: [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2] as Point,
          distance: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]),
        }
      : p.length
        ? { point: p[0], distance: 0 }
        : null;
  }
  function finish(id: number) {
    pointers.current.delete(id);
    gesture.current = currentGesture();
  }
  const selected = layout.terrain.find((t) => t.id === state.terrain);
  const selectedPoints = selected
    ? anchors(selected, templates.get(selected.templateId)!, state.rotation)
    : null;
  const corner: Point = [
    state.corner.endsWith("r") ? w : 0,
    state.corner.startsWith("b") ? h : 0,
  ];
  const endpoint = (point: Point, key: string, color: string) => {
    const [dx, dy] = distances(point, state.corner, [w, h]);
    return (
      <g key={key} className="dimension" style={{ color }} pointerEvents="none">
        <path
          d={`M${corner[0]},${point[1]}H${point[0]}V${corner[1]}`}
          fill="none"
          stroke="currentColor"
          strokeWidth=".15"
          strokeDasharray=".35 .22"
        />
        <text
          x={(point[0] + corner[0]) / 2}
          y={point[1] - 0.65}
          textAnchor="middle"
          className="dimension-value"
          style={{ fontSize: labelSize }}
        >
          {" "}
          {key} · {approximate(dx)}
        </text>
        <text
          x={point[0] + (point[0] > w / 2 ? -1 : 1)}
          y={(point[1] + corner[1]) / 2}
          textAnchor={point[0] > w / 2 ? "end" : "start"}
          className="dimension-value"
          style={{ fontSize: labelSize }}
        >
          {key} · {approximate(dy)}
        </text>
        <circle
          cx={point[0]}
          cy={point[1]}
          r=".52"
          fill="currentColor"
          stroke="#fff"
          strokeWidth=".16"
        />
        <text
          x={point[0]}
          y={point[1] + 0.22}
          textAnchor="middle"
          fill="white"
          fontSize=".7"
          fontWeight="800"
        >
          {key}
        </text>
      </g>
    );
  };
  return (
    <section className="board-stage" aria-label="Table interactive">
      <div className="board-tools">
        <button aria-label="Zoom avant" onClick={() => zoom(1.3)}>
          ＋
        </button>
        <button aria-label="Zoom arrière" onClick={() => zoom(1 / 1.3)}>
          −
        </button>
        <button
          onClick={() => setCamera(initial)}
          aria-label="Recentrer la table"
        >
          ⌖
        </button>
        <button
          aria-label="Plein écran"
          onClick={() => {
            const node = document.querySelector<HTMLElement>(".workspace");
            if (document.fullscreenElement)
              void document.exitFullscreen().catch(() => {});
            else void node?.requestFullscreen?.().catch(() => {});
          }}
        >
          ⛶
        </button>
      </div>
      <svg
        ref={svg}
        className="board"
        role="group"
        aria-label="Carte du layout, dimensions en pouces"
        viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.pointerType === "mouse") return;
          pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
          if (pointers.current.size === 1) moved.current = false;
          else moved.current = true;
          gesture.current = currentGesture();
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          const old = gesture.current;
          pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
          const next = currentGesture();
          if (!old || !next) return;
          const delta = Math.hypot(
            next.point[0] - old.point[0],
            next.point[1] - old.point[1],
          );
          if (
            delta > 1 ||
            (next.distance && Math.abs(next.distance - old.distance) > 1)
          )
            moved.current = true;
          const a = local(old.point),
            b = local(next.point);
          setCamera((c) => ({
            ...c,
            x: c.x + a[0] - b[0],
            y: c.y + a[1] - b[1],
          }));
          if (old.distance > 0 && next.distance > 0)
            zoom(next.distance / old.distance, a);
          gesture.current = next;
        }}
        onPointerUp={(e) => {
          if (!moved.current) {
            const hit = document
              .elementFromPoint(e.clientX, e.clientY)
              ?.closest("[data-terrain]");
            const id = hit?.getAttribute("data-terrain");
            if (id) onSelect(id);
            const co = document
              .elementFromPoint(e.clientX, e.clientY)
              ?.closest("[data-corner]")
              ?.getAttribute("data-corner");
            if (co) onCorner(co as ViewState["corner"]);
          }
          finish(e.pointerId);
        }}
        onPointerCancel={(e) => finish(e.pointerId)}
        onLostPointerCapture={(e) => finish(e.pointerId)}
      >
        <defs>
          <pattern
            id={gridId}
            width="1"
            height="1"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M1 0H0V1"
              fill="none"
              stroke="#314a43"
              strokeWidth=".035"
              opacity=".28"
            />
          </pattern>
          <pattern
            id={hatchId}
            width=".8"
            height=".8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(40)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2=".8"
              stroke="#b3afa0"
              strokeWidth=".065"
            />
          </pattern>
          <clipPath id={`clip${rawId}`}>
            <rect width={w} height={h} />
          </clipPath>
        </defs>
        <rect
          width={w}
          height={h}
          fill="#f6f3e9"
          stroke="#546961"
          strokeWidth=".18"
        />
        <g clipPath={`url(#clip${rawId})`}>
          {state.deployments &&
            layout.deployments.map((z) => (
              <path
                key={z.role}
                d={path([z.polygon.map((p) => rotate(p, state.rotation))])}
                className={`deployment ${z.role}`}
              />
            ))}
          {state.grid && (
            <g pointerEvents="none">
              <rect width={w} height={h} fill={`url(#${gridId})`} />
              {Array.from({ length: Math.floor(w / 5) }, (_, i) => (
                <line
                  key={`x${i}`}
                  x1={(i + 1) * 5}
                  x2={(i + 1) * 5}
                  y2={h}
                  className="major-grid"
                />
              ))}
              {Array.from({ length: Math.floor(h / 5) }, (_, i) => (
                <line
                  key={`y${i}`}
                  y1={(i + 1) * 5}
                  y2={(i + 1) * 5}
                  x2={w}
                  className="major-grid"
                />
              ))}
            </g>
          )}
          {layout.terrain.map((t) => {
            const template = templates.get(t.templateId)!;
            const polygon = template.polygon.map((p) =>
              rotate(place(p, t), state.rotation),
            );
            const [cx, cy] = center(polygon);
            const active = t.id === state.terrain;
            return (
              <g
                key={t.id}
                data-terrain={t.id}
                role="button"
                tabIndex={0}
                aria-label={`Décor ${t.number} : ${template.name}`}
                aria-pressed={active}
                className={`terrain ${active ? "selected" : ""}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(t.id);
                  }
                }}
              >
                <path d={path([polygon])} className="footprint" />
                <path
                  d={path([polygon])}
                  fill={`url(#${hatchId})`}
                  pointerEvents="none"
                />
                {layout.elements
                  .filter((el) => el.terrainId === t.id)
                  .map((el) => (
                    <path
                      key={el.id}
                      d={path(
                        el.rings.map((r) =>
                          r.map((p) => rotate(p, state.rotation)),
                        ),
                      )}
                      fillRule="evenodd"
                      className={`element ${kinds.get(el.kind)!.category}`}
                      pointerEvents="none"
                    />
                  ))}
                <circle
                  cx={cx}
                  cy={cy}
                  r={numberRadius}
                  className="terrain-number-bg"
                  pointerEvents="none"
                />
                <text
                  x={cx}
                  y={cy + numberSize * 0.34}
                  textAnchor="middle"
                  className="terrain-number"
                  style={{ fontSize: numberSize }}
                  pointerEvents="none"
                >
                  {t.number.toString().padStart(2, "0")}
                </text>
                {state.measures === "all" &&
                  anchors(t, template, state.rotation).map((p, i) => (
                    <g key={i} pointerEvents="none">
                      <circle
                        cx={p[0]}
                        cy={p[1]}
                        r=".18"
                        fill={i ? "#ba6325" : "#286e8a"}
                      />
                      <text
                        x={p[0] + 0.35}
                        y={p[1] - 0.35}
                        className="anchor-small"
                      >
                        {t.number}
                        {i ? "B" : "A"}
                      </text>
                    </g>
                  ))}
              </g>
            );
          })}
          {state.objectives &&
            layout.objectives.map((o) => {
              const [x, y] = rotate(o.point, state.rotation);
              return (
                <g key={o.id} pointerEvents="none">
                  <circle
                    cx={x}
                    cy={y}
                    r=".65"
                    className={`objective ${o.kind.startsWith("home") ? "home" : ""}`}
                  />
                  <text
                    x={x}
                    y={y + 0.23}
                    textAnchor="middle"
                    className="objective-symbol"
                  >
                    {o.kind.startsWith("home")
                      ? "⌂"
                      : o.kind === "centre"
                        ? "◆"
                        : "⚑"}
                  </text>
                </g>
              );
            })}
        </g>
        {Array.from({ length: Math.floor(w) + 1 }, (_, i) => (
          <g key={`rx${i}`} pointerEvents="none">
            <path
              d={`M${i},0v${i % 5 === 0 ? -0.45 : -0.2} M${i},${h}v${i % 5 === 0 ? 0.45 : 0.2}`}
              className="ruler"
            />
            {i % 5 === 0 && (
              <>
                <text x={i} y="-1.1" className="ruler-label">
                  {state.corner.endsWith("r") ? w - i : i}
                </text>
                <text x={i} y={h + 1.65} className="ruler-label">
                  {state.corner.endsWith("r") ? w - i : i}
                </text>
              </>
            )}
          </g>
        ))}
        {Array.from({ length: Math.floor(h) + 1 }, (_, i) => (
          <g key={`ry${i}`} pointerEvents="none">
            <path
              d={`M0,${i}h${i % 5 === 0 ? -0.45 : -0.2} M${w},${i}h${i % 5 === 0 ? 0.45 : 0.2}`}
              className="ruler"
            />
            {i % 5 === 0 && (
              <>
                <text x="-1.8" y={i + 0.3} className="ruler-label">
                  {state.corner.startsWith("b") ? h - i : i}
                </text>
                <text x={w + 1.8} y={i + 0.3} className="ruler-label">
                  {state.corner.startsWith("b") ? h - i : i}
                </text>
              </>
            )}
          </g>
        ))}
        {(["tl", "tr", "bl", "br"] as const).map((co) => {
          const [x, y]: Point = [
            co.endsWith("r") ? w + 3.2 : -3.2,
            co.startsWith("b") ? h + 3.2 : -3.2,
          ];
          return (
            <g
              key={co}
              data-corner={co}
              role="button"
              aria-label={`Origine ${co}`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onCorner(co);
                }
              }}
              className="corner-marker"
            >
              <rect
                x={x - 0.8}
                y={y - 0.8}
                width="1.6"
                height="1.6"
                rx=".4"
                fill={state.corner === co ? "#182f29" : "#e0e2d9"}
              />
              <text
                x={x}
                y={y + 0.27}
                textAnchor="middle"
                fill={state.corner === co ? "#fff" : "#6a776e"}
                fontSize=".8"
              >
                {co === "tl"
                  ? "↖"
                  : co === "tr"
                    ? "↗"
                    : co === "bl"
                      ? "↙"
                      : "↘"}
              </text>
            </g>
          );
        })}
        {state.measures !== "off" && selectedPoints && (
          <>
            {endpoint(selectedPoints[0], "A", "#246c8a")}
            {endpoint(selectedPoints[1], "B", "#b15b25")}
          </>
        )}
      </svg>
      <div className="board-caption">
        <span>
          {w} × {h} pouces
        </span>
        <span>Glisser pour déplacer · Pincer pour zoomer</span>
      </div>
    </section>
  );
}
