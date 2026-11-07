import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Vista3DPigra } from "../../src/components/planimetrie/Vista3DPigra";
import { pianteDaPlanimetria } from "../../src/lib/planimetrie/tred/adattatore";
import { PAVIMENTI_STANZA, PARETI_STANZA } from "../../shared/planimetrie/finiture.ts";
import { Button } from "../../src/components/ui/button";
import EditorPlanimetria from "../../src/components/planimetrie/editor/EditorPlanimetria";
import { piantaEsempio } from "../../src/components/planimetrie/editor/esempio";
import { aPlanimetria } from "../../src/components/planimetrie/editor/adattatore";
import { validaPlanimetria, type Planimetria } from "../../shared/planimetrie/modello.ts";
import bilocale from "../../shared/planimetrie/esempi/bilocale.json";
import trilocale from "../../shared/planimetrie/esempi/trilocale.json";
import "../../src/index.css";

const RenderStanzaLocale = lazy(() => import("./RenderStanzaLocale"));

// Pagina di prova dell'editor: niente database, il documento resta nel browser.
// `?esempio` e `?trilocale` partono dagli esempi della fase 1, `?stimate` da un bilocale
// con misure stimate (come dall'AI), `?telefono` forza la vista da telefono.
const parametri = new URLSearchParams(window.location.search);
const CHIAVE = "planimetria-editor:v2:prova";

function leggi(): Planimetria | undefined {
  if (parametri.has("finiture")) {
    const demo = structuredClone(bilocale) as unknown as Planimetria;
    demo.livelli[0].fatto.locali[0].finiture = { pavimento: PAVIMENTI_STANZA[2].descrizione, pareti: PARETI_STANZA[1].descrizione, soffitto: PARETI_STANZA[0].descrizione };
    return demo;
  }
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
  const [documento, setDocumento] = useState(iniziale);
  const [vista, setVista] = useState<"editor" | "3d" | "render">(parametri.has("render") || parametri.get("vista") === "render" ? "render" : parametri.has("3d") || parametri.get("vista") === "3d" ? "3d" : "editor");
  const cambiaVista = (v: "editor" | "3d" | "render") => {
    setVista(v);
    const url = new URL(window.location.href);
    url.searchParams.set("vista", v);
    window.history.replaceState(null, "", url);
  };
  const [foto, setFoto] = useState<string | null>(null);
  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto); }, [foto]);
  const piante = useMemo(() => documento ? pianteDaPlanimetria(documento) : null, [documento]);
  const salva = useCallback((p: Planimetria) => {
    setDocumento(p);
    try {
      localStorage.setItem(CHIAVE, JSON.stringify(p));
    } catch {
      /* spazio finito o modalità privata: pazienza */
    }
  }, []);
  return (
    <main className="flex h-[100dvh] flex-col gap-2 bg-muted/30 p-2 sm:p-4">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1">
        <h1 className="text-lg font-semibold">Planimetria · materiali e render</h1>
        <nav className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <a className="underline" href="?finiture">Campioni finiture</a>
          <a className="underline" href="?nuova">Pianta vuota</a>
          <a className="underline" href="?esempio">Bilocale</a>
          <a className="underline" href="?trilocale">Trilocale con progetto</a>
          <a className="underline" href="?stimate">Misure stimate</a>
          <a className="underline" href="?telefono">Come sul telefono</a>
        </nav>
      </header>
      <div className="flex gap-2">
        <Button variant={vista === "editor" ? "default" : "outline"} onClick={() => cambiaVista("editor")}>Editor 2D</Button>
        <Button variant={vista === "3d" ? "default" : "outline"} disabled={!piante} onClick={() => cambiaVista("3d")}>Vista 3D e materiali</Button>
        <Button variant={vista === "render" ? "default" : "outline"} disabled={!documento} onClick={() => cambiaVista("render")}>Render della stanza</Button>
      </div>
      {vista === "editor" && <EditorPlanimetria
        className="flex-1"
        piantaIniziale={documento ?? iniziale}
        onChange={salva}
        soloVista={parametri.has("telefono") ? true : undefined}
      />}
      {vista === "render" && documento && <Suspense fallback={<p>Preparo il modulo del render…</p>}><RenderStanzaLocale documento={documento} /></Suspense>}
      {vista === "3d" && piante && <div className="min-h-0 flex-1 overflow-auto">
        <Vista3DPigra piante={piante} modoIniziale="dentro" vistaIniziale="fatto" onFotogramma={(f) => setFoto(URL.createObjectURL(f.png))} />
        {foto && <figure className="mt-4 rounded-lg border bg-background p-3"><figcaption className="mb-2 text-sm font-medium">Fotogramma per il render · finiture della stanza</figcaption><img src={foto} alt="Vista della stanza con le finiture scelte, pronta per il render" className="max-h-[60vh] w-full rounded object-contain" /></figure>}
      </div>}
    </main>
  );
}

if (import.meta.env.DEV || import.meta.env.MODE === "planimetria-local") createRoot(document.getElementById("root")!).render(<Prova />);
