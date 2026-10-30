import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import EditorPlanimetria from "../../src/components/planimetrie/editor/EditorPlanimetria";
import { piantaEsempio } from "../../src/components/planimetrie/editor/esempio";
import { aPlanimetria } from "../../src/components/planimetrie/editor/adattatore";
import { validaPlanimetria, type Planimetria } from "../../shared/planimetrie/modello.ts";
import bilocale from "../../shared/planimetrie/esempi/bilocale.json";
import trilocale from "../../shared/planimetrie/esempi/trilocale.json";
import "../../src/index.css";

// Pagina di prova dell'editor: niente database, il documento resta nel browser.
// `?esempio` e `?trilocale` partono dagli esempi della fase 1, `?stimate` da un bilocale
// con misure stimate (come dall'AI), `?telefono` forza la vista da telefono.
const parametri = new URLSearchParams(window.location.search);
const CHIAVE = "planimetria-editor:v2:prova";

function leggi(): Planimetria | undefined {
  if (parametri.has("esempio")) return bilocale as unknown as Planimetria;
  if (parametri.has("trilocale")) return trilocale as unknown as Planimetria;
  if (parametri.has("stimate")) return aPlanimetria(piantaEsempio());
  if (parametri.has("nuova")) return undefined;
  try {
    const esito = validaPlanimetria(JSON.parse(localStorage.getItem(CHIAVE) ?? "null"));
    return esito.ok ? esito.planimetria : undefined;
  } catch {
    return undefined;
  }
}

function Prova() {
  const [iniziale] = useState(leggi);
  const salva = useCallback((p: Planimetria) => {
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
        <nav className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <a className="underline" href="?nuova">Pianta vuota</a>
          <a className="underline" href="?esempio">Bilocale</a>
          <a className="underline" href="?trilocale">Trilocale con progetto</a>
          <a className="underline" href="?stimate">Misure stimate</a>
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
