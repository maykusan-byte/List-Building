import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getManifest } from "./data";
import "./styles.css";
const root = createRoot(document.getElementById("root")!);
root.render(<div className="boot">Préparation de la table…</div>);
getManifest()
  .then((manifest) => root.render(<App manifest={manifest} />))
  .catch(() =>
    root.render(
      <main className="boot">
        <h1>Le catalogue n’a pas pu être chargé</h1>
        <p>Vérifiez votre connexion puis réessayez.</p>
        <button onClick={() => location.reload()}>Réessayer</button>
      </main>,
    ),
  );
