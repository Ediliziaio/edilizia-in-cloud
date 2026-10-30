// Fase 0 Planimetrie: prova del motore cadcraft compilato in WebAssembly.
// Solo locale (`/dev/planimetria-motore/` col server di sviluppo), fuori dal menu e dal bundle
// dell'app: il .wasm si carica qui, con un import dinamico. Esito: docs/planimetrie/fase0-esito.md
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import esempio from "../../tools/planimetrie-wasm/esempi/trilocale.json";
import "../../src/index.css";

type Motore = {
  scrivi_dxf: (json: string) => string;
  esporta_svg: (json: string) => string;
  leggi_dxf: (dxf: string) => string;
};

type Letto = {
  unita: number;
  limiti: { min: [number, number]; max: [number, number] } | null;
  layer: string[];
  conteggi: Record<string, number>;
  entita: unknown[];
  svg: string;
};

const ms = (t0: number) => `${(performance.now() - t0).toFixed(1)} ms`;

function scarica(nome: string, testo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([testo], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// L'SVG si mostra come immagine: niente script né riferimenti esterni, anche da un DXF altrui.
function useImmagineSvg(svg: string | null) {
  const url = useMemo(() => (svg ? URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })) : null), [svg]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

function Pagina() {
  const [motore, setMotore] = useState<Motore | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [tempi, setTempi] = useState<Record<string, string>>({});
  const [json, setJson] = useState(() => JSON.stringify(esempio, null, 2));
  const [svg, setSvg] = useState<string | null>(null);
  const [letto, setLetto] = useState<Letto | null>(null);
  const immagine = useImmagineSvg(svg);
  const sfondo = useImmagineSvg(letto?.svg ?? null);

  useEffect(() => {
    const t0 = performance.now();
    import("./wasm/planimetrie_wasm.js")
      .then(async (m) => {
        await m.default();
        setTempi((t) => ({ ...t, caricamento: ms(t0) }));
        setMotore(m);
      })
      .catch((e) => setErrore(`Motore non trovato: lancia tools/planimetrie-wasm/build.sh (${e})`));
  }, []);

  useEffect(() => {
    if (!motore) return;
    try {
      const t0 = performance.now();
      setSvg(motore.esporta_svg(json));
      setTempi((t) => ({ ...t, disegno: ms(t0) }));
      setErrore(null);
    } catch (e) {
      setErrore(String(e));
    }
  }, [motore, json]);

  const dxf = () => {
    if (!motore) return;
    const t0 = performance.now();
    const testo = motore.scrivi_dxf(json);
    setTempi((t) => ({ ...t, "scrittura DXF": `${ms(t0)}, ${(testo.length / 1024).toFixed(0)} kB` }));
    scarica("pianta.dxf", testo, "application/dxf");
  };

  const apri = async (file: File) => {
    if (!motore) return;
    const testo = await file.text();
    const t0 = performance.now();
    try {
      setLetto(JSON.parse(motore.leggi_dxf(testo)));
      setTempi((t) => ({ ...t, "lettura DXF": `${ms(t0)} (${file.name})` }));
    } catch (e) {
      setErrore(String(e));
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-[1440px] space-y-4 bg-background px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold">Planimetrie — prova del motore (fase 0)</h1>
        <p className="text-sm text-muted-foreground">
          cadcraft (geom, doc, io) in WebAssembly: la pianta qui sotto è disegnata dal motore e si scarica in DXF.
        </p>
      </header>
      {errore && <p className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">{errore}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={!motore} onClick={dxf}>
          Scarica DXF
        </button>
        <button className="rounded border px-3 py-2 text-sm disabled:opacity-50" disabled={!svg} onClick={() => svg && scarica("pianta.svg", svg, "image/svg+xml")}>
          Scarica SVG
        </button>
        <label className="cursor-pointer rounded border px-3 py-2 text-sm">
          Apri un DXF come sfondo
          <input type="file" accept=".dxf" className="hidden" onChange={(e) => e.target.files?.[0] && apri(e.target.files[0])} />
        </label>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm" data-testid="tempi">
        {Object.entries(tempi).map(([k, v]) => (
          <div key={k}>
            <dt className="inline text-muted-foreground">{k}: </dt>
            <dd className="inline font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {/* Tailwind non legge dev/: le misure che contano stanno negli style. */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) min(420px, 40%)" }}>
        <section className="rounded border bg-white p-2">
          {immagine ? <img src={immagine} alt="Pianta disegnata dal motore" className="h-auto w-full" /> : <p className="p-8 text-sm">Carico il motore…</p>}
        </section>
        <section>
          <h2 className="mb-1 text-sm font-medium">Pianta (modello provvisorio, cm)</h2>
          <textarea className="w-full rounded border p-2 font-mono text-xs" style={{ height: 540 }} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
        </section>
      </div>
      {letto && (
        <section className="space-y-2">
          <h2 className="font-medium">DXF aperto</h2>
          <p className="text-sm">
            Unità {letto.unita} · {letto.entita.length} entità semplici · layer: {letto.layer.join(", ")} ·{" "}
            {Object.entries(letto.conteggi).map(([k, v]) => `${k} ${v}`).join(", ")}
          </p>
          {sfondo && <img src={sfondo} alt="DXF aperto" className="h-auto w-full rounded border bg-white opacity-60" />}
        </section>
      )}
    </main>
  );
}

if (import.meta.env.DEV) createRoot(document.getElementById("root")!).render(<Pagina />);
