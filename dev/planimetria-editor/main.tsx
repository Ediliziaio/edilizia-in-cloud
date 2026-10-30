import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import EditorPlanimetria from "../../src/components/planimetrie/editor/EditorPlanimetria";
import { piantaEsempio } from "../../src/components/planimetrie/editor/esempio";
import type { Pianta } from "../../src/components/planimetrie/editor/adattatore";
import "../../src/index.css";

// Pagina di prova dell'editor: niente database, la pianta resta nel browser.
// `?esempio` parte da un bilocale con qualche misura stimata, `?telefono` forza la vista da telefono.
const parametri = new URLSearchParams(window.location.search);
const CHIAVE = "planimetria-editor:v1:prova";

function leggi(): Pianta | undefined {
  if (parametri.has("esempio")) return piantaEsempio();
  if (parametri.has("nuova")) return undefined;
  try {
    const salvata = localStorage.getItem(CHIAVE);
    return salvata ? (JSON.parse(salvata) as Pianta) : undefined;
  } catch {
    return undefined;
  }
}

function Prova() {
  const [iniziale] = useState(leggi);
  const salva = useCallback((p: Pianta) => {
    try {
      localStorage.setItem(CHIAVE, JSON.stringify(p));
    } catch {
      /* spazio finito o modalità privata: pazienza */
    }
  }, []);
  return (
    <main className="flex h-[100dvh] flex-col gap-2 bg-muted/30 p-2 sm:p-4">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1">
        <h1 className="text-lg font-semibold">Planimetria · prova dell'editor</h1>
        <nav className="flex gap-3 text-sm text-muted-foreground">
          <a className="underline" href="?nuova">Pianta vuota</a>
          <a className="underline" href="?esempio">Bilocale di esempio</a>
          <a className="underline" href="?telefono">Come sul telefono</a>
        </nav>
      </header>
      <EditorPlanimetria
        className="flex-1"
        piantaIniziale={iniziale}
        onChange={salva}
        soloVista={parametri.has("telefono") ? true : undefined}
      />
    </main>
  );
}

if (import.meta.env.DEV || import.meta.env.MODE === "planimetria-local") createRoot(document.getElementById("root")!).render(<Prova />);
