import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Layout, Manifest, ViewState } from "./types";
import { Board } from "./Board";
import { Details } from "./Details";
import { asset, getLayout } from "./data";
import { corners } from "./geometry";
import { readState, stateHash } from "./state";

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content">
        <header>
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Fermer" className="icon-button">
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function App({ manifest }: { manifest: Manifest }) {
  function stateFromLocation() {
    const next = readState(location.hash, manifest);
    if (!new URLSearchParams(location.hash.slice(1)).has("rotation"))
      next.rotation = innerWidth > innerHeight ? 90 : 0;
    return next;
  }
  const [state, setState] = useState(stateFromLocation);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [modal, setModal] = useState<
    "gallery" | "source" | "about" | "share" | null
  >(null);
  const [filter, setFilter] = useState("");
  const [pair, setPair] = useState("");
  const [copied, setCopied] = useState(false);
  const [sourceZoom, setSourceZoom] = useState(false);
  const summary = manifest.layouts.find((l) => l.id === state.layout)!;
  const current = layout?.id === state.layout ? layout : null;
  const shareUrl = `https://maykusan-byte.github.io/List-Building/layouts/${stateHash(state)}`;
  const pendingPush = useRef(false);
  function change(patch: Partial<ViewState>, push = false) {
    pendingPush.current ||= push;
    setState((previous) => ({ ...previous, ...patch }));
  }
  useEffect(() => {
    history[pendingPush.current ? "pushState" : "replaceState"](
      null,
      "",
      stateHash(state),
    );
    pendingPush.current = false;
  }, [state]);
  function select(id: string) {
    change({ terrain: id });
  }
  useEffect(() => {
    const update = () => setState(stateFromLocation());
    addEventListener("hashchange", update);
    addEventListener("popstate", update);
    return () => {
      removeEventListener("hashchange", update);
      removeEventListener("popstate", update);
    };
  }, [manifest]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    getLayout(summary.data, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setLayout(data);
        setState((previous) => {
          if (previous.layout !== data.id) return previous;
          const next =
            previous.terrain &&
            !data.terrain.some((t) => t.id === previous.terrain)
              ? { ...previous, terrain: null }
              : previous;
          return next;
        });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Chargement impossible.");
      });
    return () => controller.abort();
  }, [summary.data, retry]);
  const pairs = [
    ...new Map(manifest.layouts.map((l) => [l.pair, l.title])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  const filtered = manifest.layouts.filter(
    (l) =>
      (!pair || l.pair === pair) &&
      `${l.title} ${l.id} ${l.variant}`
        .toLocaleLowerCase("fr")
        .includes(filter.toLocaleLowerCase("fr")),
  );
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="Warforge Layouts, accueil"
        >
          <span className="brand-icon">
            W<span>＋</span>
          </span>
          <span>
            WARFORGE <b>LAYOUTS</b>
            <small>Préparez votre champ de bataille</small>
          </span>
        </a>
        <nav aria-label="Actions">
          <span className="edition">V11 · 2026–27</span>
          <button className="quiet" onClick={() => setModal("about")}>
            Sources & précision
          </button>
          <button
            className="share-button"
            onClick={() => {
              setCopied(false);
              setModal("share");
            }}
          >
            Partager ↗
          </button>
        </nav>
      </header>
      <main>
        <div className="layout-heading">
          <div>
            <p className="eyebrow">L’ATELIER DES CHAMPS DE BATAILLE</p>
            <h1>{summary.title}</h1>
            <p>
              Layout {summary.variant} <span>·</span> 16 empreintes{" "}
              <span>·</span> Table de 44″ × 60″
            </p>
          </div>
          <div className="layout-choices">
            <div className="segmented" aria-label="Variante du layout">
              {manifest.layouts
                .filter((l) => l.pair === summary.pair)
                .map((l) => (
                  <button
                    key={l.id}
                    className={l.id === state.layout ? "active" : ""}
                    aria-pressed={l.id === state.layout}
                    onClick={() =>
                      change({ layout: l.id, terrain: null }, true)
                    }
                  >
                    {l.variant}
                  </button>
                ))}
            </div>
            <button className="primary" onClick={() => setModal("gallery")}>
              ▦ <span>Les 45 layouts</span>
            </button>
          </div>
        </div>
        <div className="toolbar">
          <div className="toolbar-group">
            <span className="control-label">Mesures</span>
            <div className="segmented" aria-label="Affichage des mesures">
              {(
                [
                  ["off", "Sans"],
                  ["selected", "Sélection"],
                  ["all", "Toutes"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={state.measures === value ? "active" : ""}
                  aria-pressed={state.measures === value}
                  onClick={() => change({ measures: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="toolbar-group corner-controls">
            <span className="control-label">Mon coin</span>
            <div className="segmented">
              {corners.map((c) => (
                <button
                  key={c.id}
                  title={c.label}
                  aria-label={`Coin ${c.label.toLowerCase()}`}
                  aria-pressed={state.corner === c.id}
                  className={state.corner === c.id ? "active" : ""}
                  onClick={() => change({ corner: c.id })}
                >
                  {c.symbol}
                </button>
              ))}
            </div>
          </div>
          <div className="toolbar-group layers">
            {(
              [
                ["grid", "Grille 1″"],
                ["deployments", "Déploiements"],
                ["objectives", "Objectifs"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={state[key]}
                  onChange={(e) => change({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="toolbar-group toolbar-end">
            <button
              title="Tourner la table de 90°"
              aria-label="Tourner la table de 90 degrés"
              onClick={() =>
                change({
                  rotation: ((state.rotation + 90) %
                    360) as ViewState["rotation"],
                })
              }
            >
              ↻ <span>{state.rotation}°</span>
            </button>
            <button
              disabled={!current}
              onClick={() => {
                setSourceZoom(false);
                setModal("source");
              }}
            >
              Carte cotée ↗
            </button>
          </div>
        </div>
        <div className={`workspace ${state.terrain ? "has-selection" : ""}`}>
          {current && !error ? (
            <>
              <Board
                layout={current}
                manifest={manifest}
                state={state}
                onSelect={select}
                onCorner={(corner) => change({ corner })}
              />
              <Details
                layout={current}
                manifest={manifest}
                state={state}
                onSelect={select}
                onClose={() => change({ terrain: null })}
              />
            </>
          ) : (
            <section className="loading" role={error ? "alert" : "status"}>
              <p>{error || "Chargement du champ de bataille…"}</p>
              {error && (
                <button onClick={() => setRetry((n) => n + 1)}>
                  Réessayer
                </button>
              )}
            </section>
          )}
        </div>
        <footer className="bottom-bar">
          <div className="legend">
            <span>
              <i className="dense" />
              Dense
            </span>
            <span>
              <i className="light" />
              Léger
            </span>
            <span>
              <i className="footprint" />
              Empreinte
            </span>
            <span>
              <i className="attacker" />
              Attaquant
            </span>
            <span>
              <i className="defender" />
              Défenseur
            </span>
          </div>
          <span>≈ Cotes calculées · pouces</span>
        </footer>
      </main>
      {modal === "gallery" && (
        <Modal title="Choisir votre layout" wide onClose={() => setModal(null)}>
          <div className="gallery-tools">
            <input
              aria-label="Rechercher un layout"
              placeholder="Rechercher une confrontation…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <select
              aria-label="Filtrer par confrontation"
              value={pair}
              onChange={(e) => setPair(e.target.value)}
            >
              <option value="">Toutes les confrontations</option>
              {pairs.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
            <span>{filtered.length} layouts</span>
          </div>
          <div className="gallery">
            {filtered.map((l) => (
              <button
                key={l.id}
                className={`layout-card ${state.layout === l.id ? "active" : ""}`}
                onClick={() => {
                  change({ layout: l.id, terrain: null }, true);
                  setModal(null);
                }}
              >
                <img
                  src={asset(l.thumbnail)}
                  alt=""
                  loading="lazy"
                  width="264"
                  height="360"
                />
                <span className="layout-card-title">{l.title}</span>
                <span className="layout-card-sub">
                  Layout {l.variant}{" "}
                  {state.layout === l.id ? "· Sélectionné" : ""}
                </span>
              </button>
            ))}
          </div>
          {!filtered.length && (
            <p className="empty">
              Aucun layout ne correspond à cette recherche.
            </p>
          )}
        </Modal>
      )}
      {modal === "source" && current && (
        <Modal
          title={`Carte source cotée · ${summary.title} · ${summary.variant}`}
          wide
          onClose={() => setModal(null)}
        >
          <div className="source-tools">
            <p>
              Mesures imprimées sur la carte GDM. Les repères A/B du visualiseur
              sont indépendants.
            </p>
            <button onClick={() => setSourceZoom(!sourceZoom)}>
              {sourceZoom ? "Ajuster à l’écran" : "Agrandir les cotes"}
            </button>
            <a href={current.source.url} target="_blank" rel="noreferrer">
              Source GDM ↗
            </a>
          </div>
          <div className={`source-scroll ${sourceZoom ? "zoomed" : ""}`}>
            <img
              src={asset(current.source.measuredImage)}
              alt={`Carte GDM avec mesures imprimées : ${summary.title}, layout ${summary.variant}`}
            />
          </div>
        </Modal>
      )}
      {modal === "about" && (
        <Modal title="Sources et précision" onClose={() => setModal(null)}>
          <div className="about">
            <p>
              <b>45 layouts · 720 empreintes</b>
              <br />
              Géométrie des placements contrôlée dans le projet Warforge.
              Origine physique : coin supérieur gauche du plateau 44″ × 60″.
            </p>
            <p>{manifest.precisionNote}</p>
            <p>
              Les dimensions nominales viennent des gabarits GW. Leurs
              excroissances peuvent dépasser ces dimensions. Les repères A/B
              désignent des sommets du contour, jamais les coins d’un rectangle
              imaginaire.
            </p>
            <p>
              Les couleurs vert et ambre distinguent les éléments denses et
              légers. Une même empreinte peut contenir les deux. Les points
              d’objectifs illustrent leur emplacement ; aucun rayon de contrôle
              n’est ajouté.
            </p>
            <p>
              Les illustrations des pièces ne sont pas des notices de montage.
              Pour l’assemblage physique, utiliser la configuration recommandée
              du livret GW. Aucune hauteur estimée n’est présentée comme
              officielle.
            </p>
            <h3>Références</h3>
            {manifest.sources.map((s) => (
              <p key={s.id}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title} ↗
                </a>
                <br />
                <small>{s.date}</small>
              </p>
            ))}
            <p className="muted">
              Outil communautaire indépendant, non affilié à Games Workshop.
              Cartes GDM et références Warhammer : droits de leurs auteurs
              respectifs. Instantané {manifest.version} · {manifest.validAsOf}.
            </p>
          </div>
        </Modal>
      )}
      {modal === "share" && (
        <Modal title="Partager cette vue" onClose={() => setModal(null)}>
          <p>
            Le lien conserve le layout, le coin, la rotation, les calques et le
            décor sélectionné.
          </p>
          <input
            className="share-url"
            aria-label="Lien de partage"
            value={shareUrl}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <button
            className="primary"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(shareUrl)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            {copied ? "Lien copié ✓" : "Copier le lien"}
          </button>
          <p className="muted">
            Vous pouvez aussi sélectionner et copier le lien directement.
          </p>
        </Modal>
      )}
    </div>
  );
}
