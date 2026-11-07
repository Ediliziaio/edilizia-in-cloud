import "./renderLocale.css";
import { useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Planimetria } from "../../shared/planimetrie/modello.ts";
import { PAVIMENTI_STANZA } from "../../shared/planimetrie/finiture.ts";
import { StanzaConfigForm, DEFAULT_STANZA_CONFIG } from "../../src/components/render-stanza/StanzaConfigForm";
import { Vista3DPigra } from "../../src/components/planimetrie/Vista3DPigra";
import { pianteDaPlanimetria } from "../../src/lib/planimetrie/tred/adattatore";
import { campionePavimentoAttivo } from "../../src/modules/render-stanza/lib/campioniFiniture";
import { selectedRoomVisuals } from "../../shared/render-references/roomVisualCatalog.ts";
import { makeReferenceImage } from "../../shared/render-references/referenceUrl.ts";
import { disegnaTavoleMateriali } from "../../src/lib/render/roomMaterialsBoard";

/** Stesso modulo del passo «Stile e materiali», con una pianta di esempio locale. */
export default function RenderStanzaLocale({ documento }: { documento: Planimetria }) {
  const [config, setConfig] = useState(() => structuredClone(DEFAULT_STANZA_CONFIG));
  const [fotogramma, setFotogramma] = useState<string | null>(null);
  const [tavole, setTavole] = useState<string[]>([]);
  const [preparo, setPreparo] = useState(false);
  const [errore, setErrore] = useState("");
  useEffect(() => () => { if (fotogramma) URL.revokeObjectURL(fotogramma); }, [fotogramma]);
  useEffect(() => () => tavole.forEach((url) => URL.revokeObjectURL(url)), [tavole]);
  const mostraTavole = async () => {
    setPreparo(true); setErrore("");
    try {
      const campioni = selectedRoomVisuals(config).map((s) => ({ id: s.id, label: `${s.target}: ${s.label}`, url: makeReferenceImage(s.photo!.folder, s.photo!.filename, s.label).url }));
      setTavole((await disegnaTavoleMateriali(campioni)).map((b) => URL.createObjectURL(b)));
    } catch (e) { setErrore(e instanceof Error ? e.message : "Campioni non disponibili."); }
    finally { setPreparo(false); }
  };
  const [client] = useState(() => new QueryClient());
  const campione = campionePavimentoAttivo(config);
  const piante = useMemo(() => {
    const d = structuredClone(documento);
    const pavimento = PAVIMENTI_STANZA.find((c) => c.id === campione);
    const stanza = d.livelli[0]?.fatto.locali[0];
    if (stanza && pavimento) stanza.finiture = { ...stanza.finiture, pavimento: pavimento.descrizione };
    return pianteDaPlanimetria(d);
  }, [documento, campione]);
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <section className="min-h-0 flex-1 overflow-auto rounded-xl border bg-background p-3 sm:p-5">
          <header className="mb-5 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Planimetrie → Render della stanza</p>
            <h2 className="text-xl font-semibold">Stile e materiali</h2>
            <p className="text-sm text-muted-foreground">Scegli i campioni fotografici per il render della stanza. Puoi vedere le tavole che il motore riceverà insieme alla pianta.</p>
          </header>
          <div className="render-locale-griglia">
            <StanzaConfigForm value={config} disabled={preparo} onChange={(c) => { setConfig(c); setFotogramma(null); setTavole([]); setErrore(""); }} />
            <aside className="render-locale-anteprima">
              <h3 className="mb-2 text-sm font-semibold">Geometria della stanza e pavimento 3D</h3>
              <Vista3DPigra piante={piante} modoIniziale="dentro" vistaIniziale="fatto" onFotogramma={(f) => setFotogramma(URL.createObjectURL(f.png))} />
              {fotogramma && <figure className="mt-3"><figcaption className="mb-1 text-xs font-medium">Fotogramma pronto per il render</figcaption><img src={fotogramma} alt="Fotogramma della stanza con la finitura scelta" className="w-full rounded-lg border" /></figure>}
              <div className="mt-4 space-y-2 rounded-xl border p-3">
                <h3 className="text-sm font-semibold">Campioni inviati al render</h3>
                <p className="text-xs text-muted-foreground">Queste sono le vere tavole di riferimento. L’anteprima 3D mostra la geometria; carta da parati, arredi e accessori verranno applicati nella generazione finale.</p>
                <button type="button" disabled={preparo} onClick={mostraTavole} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{preparo ? "Preparo i campioni…" : "Mostra le tavole dei campioni"}</button>
                {errore && <p role="alert" className="text-xs text-destructive">{errore}</p>}
                {tavole.map((url, i) => <img key={url} src={url} alt={`Tavola dei campioni selezionati ${i + 1}`} className="w-full rounded border" />)}
              </div>
            </aside>
          </div>
        </section>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
