import { useId } from "react";
import type {
  ElementKind,
  Layout,
  Manifest,
  Terrain,
  ViewState,
} from "./types";
import {
  anchors,
  approximate,
  boardSize,
  bounds,
  corners,
  distances,
  inches,
  path,
  place,
  rotate,
} from "./geometry";

function PieceIllustration({ kind }: { kind: ElementKind }) {
  const dense = kind.category === "dense";
  const ink = dense ? "#24634f" : "#a86c20";
  const fill = dense ? "#a6c3b4" : "#e4c48a";
  return (
    <svg
      className="piece-illustration"
      viewBox="0 0 100 84"
      aria-label={`Schéma indicatif : ${kind.name}`}
      role="img"
    >
      <path d="M8 65L48 45L93 63L53 82Z" fill="#e7e2d7" />
      {kind.id.includes("ruin") ? (
        <g fill={fill} stroke={ink} strokeWidth="1.5" strokeLinejoin="round">
          <path
            d={
              kind.id === "large-ruin"
                ? "M20 62V15L50 29V76Z"
                : "M20 62V39L50 49V76Z"
            }
          />
          <path
            d={
              kind.id === "large-ruin"
                ? "M50 76V29L82 13V60Z"
                : "M50 76V49L82 37V60Z"
            }
            fill={dense ? "#769e88" : "#cba05b"}
          />
          {kind.id === "large-ruin" && (
            <>
              <path d="M20 43L50 56L82 41L52 29Z" fill="#d5ddcd" />
              <path
                d="M30 29V36M40 34V41M60 36V42M71 30V36M31 54V63M68 54V62"
                strokeWidth="4"
              />
            </>
          )}
        </g>
      ) : kind.id === "capacitor" ? (
        <g fill={fill} stroke={ink} strokeWidth="2">
          <path d="M25 30H45V62Q35 70 25 62ZM57 30H77V62Q67 70 57 62Z" />
          <ellipse cx="35" cy="30" rx="10" ry="5" />
          <ellipse cx="67" cy="30" rx="10" ry="5" />
          <path d="M23 42H47M23 52H47M55 42H79M55 52H79M44 25H57V67H44Z" />
        </g>
      ) : kind.id === "shrine" ? (
        <g fill={fill} stroke={ink} strokeWidth="2">
          <path d="M29 67L34 31L51 16L69 31L74 67L51 77Z" />
          <circle cx="52" cy="40" r="9" />
          <path d="M47 50H57V69H47ZM32 30L51 23L69 30M51 16V8M41 12H61" />
        </g>
      ) : kind.id === "pylon" ? (
        <g fill={fill} stroke={ink} strokeWidth="3">
          <path d="M23 68L29 28H38L43 68ZM63 68L68 28H76L82 68Z" />
          <path d="M20 24H82V34H20Z" fill="#7ca495" />
          <path d="M28 21V37M40 21V37M63 21V37M76 21V37" />
        </g>
      ) : kind.id === "shock-array" ? (
        <g fill={fill} stroke={ink} strokeWidth="2">
          {[27, 50, 73].map((x) => (
            <g key={x}>
              <path d={`M${x - 5} 61V32H${x + 5}V61Z`} />
              <circle cx={x} cy="29" r="9" />
              <path d={`M${x - 10} 45H${x + 10}M${x - 10} 50H${x + 10}`} />
            </g>
          ))}
          <path d="M16 64H84" strokeWidth="5" />
        </g>
      ) : (
        <g fill={fill} stroke={ink} strokeWidth="2">
          <path d="M17 64V34L81 18V48Z" />
          <path d="M18 46L82 30M23 64V31M49 57V25M75 50V19" strokeWidth="4" />
        </g>
      )}
    </svg>
  );
}

function Closeup({
  layout,
  manifest,
  terrain,
  rotation,
}: {
  layout: Layout;
  manifest: Manifest;
  terrain: Terrain;
  rotation: ViewState["rotation"];
}) {
  const template = manifest.templates.find((t) => t.id === terrain.templateId)!;
  const polygon = template.polygon.map((p) =>
    rotate(place(p, terrain), rotation),
  );
  const b = bounds(polygon),
    points = anchors(terrain, template, rotation);
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className="closeup"
      role="img"
      aria-label="Disposition agrandie des éléments et repères A et B"
      viewBox={`${b.x - 1.5} ${b.y - 1.5} ${b.width + 3} ${b.height + 3}`}
    >
      <defs>
        <pattern
          id={id}
          width=".6"
          height=".6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(40)"
        >
          <line y2=".6" stroke="#c4c0b3" strokeWidth=".06" />
        </pattern>
      </defs>
      <path
        d={path([polygon])}
        fill="#eeeadf"
        stroke="#747c6f"
        strokeWidth=".09"
      />
      <path d={path([polygon])} fill={`url(#${id})`} />
      {layout.elements
        .filter((el) => el.terrainId === terrain.id)
        .map((el) => (
          <path
            key={el.id}
            d={path(el.rings.map((r) => r.map((p) => rotate(p, rotation))))}
            className={`element ${manifest.kinds.find((k) => k.id === el.kind)!.category}`}
            fillRule="evenodd"
          />
        ))}
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={p[0]}
            cy={p[1]}
            r=".34"
            fill={i ? "#b15b25" : "#246c8a"}
          />
          <text
            x={p[0]}
            y={p[1] + 0.14}
            textAnchor="middle"
            fill="white"
            fontSize=".42"
            fontWeight="800"
          >
            {i ? "B" : "A"}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function AllMeasurements({
  layout,
  manifest,
  state,
  onSelect,
}: {
  layout: Layout;
  manifest: Manifest;
  state: ViewState;
  onSelect: (id: string) => void;
}) {
  const size = boardSize(state.rotation);
  return (
    <div className="all-measures">
      <p className="eyebrow">
        Toutes les cotes · {corners.find((c) => c.id === state.corner)!.label}
      </p>
      <p className="muted">
        Distances horizontale / verticale, en pouces. Sélectionnez une ligne
        pour voir ses projections.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Décor</th>
              <th>
                Repère A<br />H / V
              </th>
              <th>
                Repère B<br />H / V
              </th>
            </tr>
          </thead>
          <tbody>
            {layout.terrain.map((t) => {
              const a = anchors(
                t,
                manifest.templates.find((x) => x.id === t.templateId)!,
                state.rotation,
              ).map((p) => distances(p, state.corner, size));
              return (
                <tr
                  key={t.id}
                  className={state.terrain === t.id ? "active" : ""}
                >
                  <th>
                    <button
                      onClick={() => onSelect(t.id)}
                      aria-label={`Mesures du décor ${t.number}`}
                    >
                      {String(t.number).padStart(2, "0")}
                    </button>
                  </th>
                  {a.map((p, i) => (
                    <td key={i}>
                      ≈ {inches(p[0])}
                      <br />
                      {inches(p[1])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Details({
  layout,
  manifest,
  state,
  onClose,
  onSelect,
}: {
  layout: Layout;
  manifest: Manifest;
  state: ViewState;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const terrain = layout.terrain.find((t) => t.id === state.terrain);
  if (!terrain)
    return (
      <aside
        className={`details overview ${state.measures === "all" ? "measurements-visible" : ""}`}
        aria-label="Informations sur la table"
      >
        <div className="eyebrow">Votre table, en un coup d’œil</div>
        <h2>
          Chaque décor
          <br />à sa place.
        </h2>
        <p>
          Cliquez sur une empreinte pour voir ses éléments et ses distances
          depuis les quatre coins.
        </p>
        <div className="stats">
          <div>
            <strong>16</strong>
            <span>empreintes</span>
          </div>
          <div>
            <strong>30</strong>
            <span>éléments GW</span>
          </div>
          <div>
            <strong>1″</strong>
            <span>quadrillage</span>
          </div>
        </div>
        {state.measures === "all" ? (
          <AllMeasurements {...{ layout, manifest, state, onSelect }} />
        ) : (
          <>
            <div className="tip">
              <b>Un coin pour référence</b>
              <p>
                Choisissez le coin le plus proche de vous. Les graduations et
                les cotes s’adaptent à votre point de vue.
              </p>
            </div>
            <div className="tip">
              <b>Deux repères, une orientation</b>
              <p>
                A et B désignent deux points du contour. Mesurez jusqu’à ces
                points pour placer et orienter l’empreinte.
              </p>
            </div>
            <div className="legend vertical">
              <span>
                <i className="dense" />
                Élément dense
              </span>
              <span>
                <i className="light" />
                Élément léger
              </span>
              <span>
                <i className="mixed" />
                Empreinte mixte : les deux catégories
              </span>
            </div>
            <p className="precision">
              ≈ Les distances proviennent des contours relevés sur les cartes.
              Consultez la carte cotée pour les mesures imprimées.
            </p>
          </>
        )}
      </aside>
    );
  const template = manifest.templates.find((t) => t.id === terrain.templateId)!;
  const elements = layout.elements.filter((el) => el.terrainId === terrain.id);
  const compositions = manifest.kinds
    .map((kind) => ({
      kind,
      quantity: elements
        .filter((el) => el.kind === kind.id)
        .reduce((n, el) => n + el.quantity, 0),
    }))
    .filter((x) => x.quantity);
  const categories = [...new Set(compositions.map((c) => c.kind.category))];
  const category = categories.length > 1 ? "mixed" : categories[0];
  const points = anchors(terrain, template, state.rotation),
    size = boardSize(state.rotation);
  return (
    <aside className="details" aria-label={`Fiche du décor ${terrain.number}`}>
      <div className="details-heading">
        <div>
          <p className="eyebrow">
            Décor {String(terrain.number).padStart(2, "0")}
          </p>
          <h2>{template.name}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Fermer la fiche du décor"
        >
          ×
        </button>
      </div>
      <div className="detail-meta">
        <span className={`badge ${category}`}>
          {category === "mixed"
            ? "Mixte"
            : category === "dense"
              ? "Dense"
              : "Léger"}
        </span>
        <span>{template.nominalSize.map(inches).join(" × ")} nominal</span>
      </div>
      <Closeup {...{ layout, manifest, terrain, rotation: state.rotation }} />
      <p className="diagram-note">
        Vue du dessus · contours des éléments schématiques
      </p>
      <section className="detail-section">
        <h3>Mesurer depuis chaque coin</h3>
        <p className="muted">H = horizontal · V = vertical · pouces</p>
        <div className="table-scroll">
          <table className="coordinates">
            <thead>
              <tr>
                <th>Coin de la vue</th>
                <th>
                  <span className="anchor-label a">A</span> H / V
                </th>
                <th>
                  <span className="anchor-label b">B</span> H / V
                </th>
              </tr>
            </thead>
            <tbody>
              {corners.map((c) => (
                <tr
                  key={c.id}
                  className={c.id === state.corner ? "active" : ""}
                >
                  <th>
                    {c.symbol} {c.label}
                  </th>
                  {points.map((p, i) => (
                    <td key={i}>
                      {distances(p, c.id, size).map((d, j) => (
                        <span className="coordinate-value" key={j}>
                          <small>{j ? "V" : "H"}</small> {approximate(d)}
                        </span>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Orientation du gabarit dans cette vue : ≈{" "}
          {inches(
            (((terrain.angle + state.rotation) % 360) + 360) % 360,
          ).replace("″", "°")}
          {terrain.reflected ? " · retourné" : ""}.
        </p>
      </section>
      <section className="detail-section">
        <h3>
          Éléments à disposer{" "}
          <span className="count">
            {compositions.reduce((n, c) => n + c.quantity, 0)}
          </span>
        </h3>
        {compositions.map(({ kind, quantity }) => (
          <article className="piece" key={kind.id}>
            <PieceIllustration kind={kind} />
            <div>
              <h4>
                {quantity} × {kind.name}
              </h4>
              <p className="official-name">{kind.officialName}</p>
              <span className={`badge ${kind.category}`}>
                {kind.category === "dense" ? "Dense" : "Léger"}
              </span>
              <p>{kind.note}</p>
              <a href={kind.sourceUrl} target="_blank" rel="noreferrer">
                Kit {kind.kit} ↗
              </a>
              {kind.illustratedUpperFloors !== null && (
                <p className="muted">
                  {kind.illustratedUpperFloors} niveau supérieur illustré ;
                  hauteur non renseignée.
                </p>
              )}
            </div>
          </article>
        ))}
      </section>
      <p className="precision">
        Schémas d’identification et disposition d’après les cartes. Aucun volume
        physique ni hauteur mesurée. A/B sont les repères de cette application.
      </p>
      {state.measures === "all" && (
        <AllMeasurements {...{ layout, manifest, state, onSelect }} />
      )}
    </aside>
  );
}
