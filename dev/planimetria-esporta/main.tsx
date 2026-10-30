// Fase 6 Planimetrie: pagina di prova delle esportazioni 2D (PDF, DXF, PNG, SVG, presentazione,
// allegato al preventivo). Solo locale (`/dev/planimetria-esporta/` col server di sviluppo),
// fuori dal menu e dal bundle dell'app. Libreria: src/lib/planimetrie/esporta.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import bilocale from "../../shared/planimetrie/esempi/bilocale.json";
import trilocale from "../../shared/planimetrie/esempi/trilocale.json";
import type { Planimetria } from "../../shared/planimetrie/modello.ts";
import {
  allegatoPreventivo, esportaDxf, esportaDxfMigliore, esportaPdf, esportaPng, esportaSvg, ErroreImpaginazione,
  PIANTA_ESEMPIO, vistaDaPlanimetria, type DatiCartiglio, type FormatoFoglio, type ModoVista, type Orientamento,
  type StileDisegno, type UnitaDxf,
} from "../../src/lib/planimetrie/esporta";
import "../../src/index.css";

const PIANTE: Record<string, { nome: string; pianta: Planimetria }> = {
  esempio: { nome: "Bilocale via Roma (esportazioni)", pianta: PIANTA_ESEMPIO },
  trilocale: { nome: "Trilocale (fase 1)", pianta: trilocale as unknown as Planimetria },
  bilocale: { nome: "Bilocale (fase 1)", pianta: bilocale as unknown as Planimetria },
};

function scarica(nome: string, dati: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([dati], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const kb = (n: number) => `${(n / 1024).toFixed(0)} kB`;

function Campo({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-muted-foreground">{etichetta}</span>
      {children}
    </label>
  );
}

const sel = "rounded-md border bg-background px-2 py-1.5 text-sm";
const btn = "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50";

function Pagina() {
  const [chiave, setChiave] = useState("esempio");
  const [modo, setModo] = useState<ModoVista>("confronto");
  const [stile, setStile] = useState<StileDisegno>("tecnico");
  const [formato, setFormato] = useState<FormatoFoglio>("A3");
  const [orientamento, setOrientamento] = useState<Orientamento>("orizzontale");
  const [scala, setScala] = useState<string>("50");
  const [unita, setUnita] = useState<UnitaDxf>("cm");
  const [motoreDxf, setMotoreDxf] = useState<"migliore" | "typescript">("migliore");
  const [dpi, setDpi] = useState(300);
  const [sfondo, setSfondo] = useState<"bianco" | "trasparente">("bianco");
  const [azienda, setAzienda] = useState("Edil Rossi S.r.l.");
  const [colore, setColore] = useState("#1E6B52");
  const [logo, setLogo] = useState<DatiCartiglio["azienda"]["logo"]>(null);
  const [esito, setEsito] = useState<string>("");
  const [errore, setErrore] = useState<string>("");
  const [lavoro, setLavoro] = useState(false);

  const { pianta, nome } = PIANTE[chiave];
  const vista = useMemo(() => vistaDaPlanimetria(pianta, { modo }), [pianta, modo]);
  const anteprima = useMemo(() => esportaSvg(vista, { scala: 50, stile, sfondo }).svg, [vista, stile, sfondo]);
  const url = useMemo(() => URL.createObjectURL(new Blob([anteprima], { type: "image/svg+xml" })), [anteprima]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const cartiglio: DatiCartiglio = {
    azienda: { nome: azienda, indirizzo: "Via dei Mille 8, 20121 Milano (MI)", partitaIva: "01234567890", telefono: "02 1234567", email: "ufficio@edilrossi.it", colore, logo },
    cliente: "Mario Bianchi",
    indirizzoCantiere: "Via Roma 12, 20900 Monza (MB)",
    data: new Date(),
    versione: "v1",
    tavola: "1/1",
  };
  const base = (pianta.titolo ?? "pianta").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const prova = async (fn: () => Promise<string>) => {
    setLavoro(true);
    setErrore("");
    try {
      const t0 = performance.now();
      const msg = await fn();
      setEsito(`${msg} · ${(performance.now() - t0).toFixed(0)} ms`);
    } catch (e) {
      setErrore(e instanceof ErroreImpaginazione ? e.message : `Non è riuscito: ${String(e)}`);
    } finally {
      setLavoro(false);
    }
  };

  const pdf = () => prova(async () => {
    const r = await esportaPdf(vista, cartiglio, { formato, orientamento, scala: scala === "auto" ? "auto" : Number(scala), stile });
    scarica(`${base}-${formato}-1-${r.scala}.pdf`, r.dati, "application/pdf");
    return `PDF ${r.formato} ${r.orientamento}, scala 1:${r.scala}, ${kb(r.dati.length)}`;
  });
  const dxf = () => prova(async () => {
    const r = motoreDxf === "migliore" ? await esportaDxfMigliore(vista, { unita, scala: 50 }) : esportaDxf(vista, { unita, scala: 50 });
    scarica(`${base}.dxf`, r.dati, "application/dxf");
    return `DXF (${r.motore}, ${r.unita}), ${kb(r.dati.length)} — entità per layer: ${Object.entries(r.conteggio).map(([l, n]) => `${l} ${n}`).join(", ")}`;
  });
  const png = () => prova(async () => {
    const r = await esportaPng(vista, { scala: 50, stile, sfondo, dpi });
    scarica(`${base}-${stile}.png`, r.blob, "image/png");
    return `PNG ${r.larghezzaPx} × ${r.altezzaPx} px a ${Math.round(r.dpi)} dpi, ${kb(r.blob.size)}`;
  });
  const svg = () => prova(async () => {
    const r = esportaSvg(vista, { scala: 50, stile, sfondo });
    scarica(`${base}-${stile}.svg`, r.svg, "image/svg+xml");
    return `SVG ${r.larghezzaMm.toFixed(0)} × ${r.altezzaMm.toFixed(0)} mm (1:50), ${kb(r.svg.length)}`;
  });
  const allegato = () => prova(async () => {
    const a = await allegatoPreventivo(vista, { ...cartiglio, oggetto: "Stato di progetto" }, { stile });
    scarica(a.nomeFile, a.dati, a.tipo);
    return `Allegato: ${a.nomeFile} — «${a.descrizione}»`;
  });

  const caricaLogo = async (file?: File) => {
    if (!file) return setLogo(null);
    const dati = new Uint8Array(await file.arrayBuffer());
    setLogo({ dati, tipo: file.type === "image/png" ? "png" : "jpg" });
  };

  return (
    <main className="mx-auto min-h-screen max-w-[1400px] bg-background px-4 py-6 text-foreground sm:px-6">
      <h1 className="text-2xl font-semibold">Planimetrie — esportazioni</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pagina di prova della fase 6: la pianta in PDF in scala con cartiglio, DXF a layer, PNG e SVG, pianta da presentazione.
      </p>

      <section className="mt-5 grid gap-3 rounded-lg border p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Campo etichetta="Pianta">
          <select className={sel} value={chiave} onChange={(e) => setChiave(e.target.value)}>
            {Object.entries(PIANTE).map(([k, p]) => <option key={k} value={k}>{p.nome}</option>)}
          </select>
        </Campo>
        <Campo etichetta="Cosa disegnare">
          <select className={sel} value={modo} onChange={(e) => setModo(e.target.value as ModoVista)}>
            <option value="fatto">Stato di fatto</option>
            <option value="progetto">Stato di progetto</option>
            <option value="confronto">Demolizioni e nuovo (giallo/rosso)</option>
          </select>
        </Campo>
        <Campo etichetta="Stile">
          <select className={sel} value={stile} onChange={(e) => setStile(e.target.value as StileDisegno)}>
            <option value="tecnico">Tecnico (bianco e nero)</option>
            <option value="presentazione">Presentazione (colori e pavimenti)</option>
          </select>
        </Campo>
        <Campo etichetta="Nome dell'impresa">
          <input className={sel} value={azienda} onChange={(e) => setAzienda(e.target.value)} />
        </Campo>
        <Campo etichetta="Colore dell'impresa">
          <input className={`${sel} h-9`} type="color" value={colore} onChange={(e) => setColore(e.target.value)} />
        </Campo>
        <Campo etichetta="Logo (PNG o JPG)">
          <input className="text-sm" type="file" accept="image/png,image/jpeg" onChange={(e) => caricaLogo(e.target.files?.[0])} />
        </Campo>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border p-3" style={{ background: sfondo === "trasparente" ? "repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 20px 20px" : "#fff" }}>
          <img src={url} alt={`Anteprima: ${nome}`} className="mx-auto max-h-[70vh] w-auto" />
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-lg border p-4">
            <h2 className="font-semibold">PDF in scala</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Campo etichetta="Foglio">
                <select className={sel} value={formato} onChange={(e) => setFormato(e.target.value as FormatoFoglio)}><option>A4</option><option>A3</option></select>
              </Campo>
              <Campo etichetta="Verso">
                <select className={sel} value={orientamento} onChange={(e) => setOrientamento(e.target.value as Orientamento)}>
                  <option value="orizzontale">Orizzontale</option><option value="verticale">Verticale</option>
                </select>
              </Campo>
              <Campo etichetta="Scala">
                <select className={sel} value={scala} onChange={(e) => setScala(e.target.value)}>
                  <option value="auto">Adatta</option><option value="20">1:20</option><option value="50">1:50</option>
                  <option value="100">1:100</option><option value="200">1:200</option>
                </select>
              </Campo>
            </div>
            <button className={`${btn} mt-3 w-full`} disabled={lavoro} onClick={pdf}>Scarica il PDF</button>
            <button className="mt-2 w-full rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50" disabled={lavoro} onClick={allegato}>
              PDF da allegare al preventivo (A4, scala adatta)
            </button>
          </section>

          <section className="rounded-lg border p-4">
            <h2 className="font-semibold">DXF per il tecnico</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Campo etichetta="Unità">
                <select className={sel} value={unita} onChange={(e) => setUnita(e.target.value as UnitaDxf)}>
                  <option value="cm">Centimetri</option><option value="m">Metri</option><option value="mm">Millimetri</option>
                </select>
              </Campo>
              <Campo etichetta="Motore">
                <select className={sel} value={motoreDxf} onChange={(e) => setMotoreDxf(e.target.value as "migliore" | "typescript")}>
                  <option value="migliore">cadcraft se c'è (R2000)</option><option value="typescript">TypeScript (R12)</option>
                </select>
              </Campo>
            </div>
            <button className={`${btn} mt-3 w-full`} disabled={lavoro} onClick={dxf}>Scarica il DXF</button>
          </section>

          <section className="rounded-lg border p-4">
            <h2 className="font-semibold">Immagine</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Campo etichetta="Sfondo">
                <select className={sel} value={sfondo} onChange={(e) => setSfondo(e.target.value as "bianco" | "trasparente")}>
                  <option value="bianco">Bianco</option><option value="trasparente">Trasparente</option>
                </select>
              </Campo>
              <Campo etichetta="Risoluzione (PNG)">
                <select className={sel} value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
                  <option value={150}>150 dpi</option><option value={300}>300 dpi (stampa)</option><option value={600}>600 dpi</option>
                </select>
              </Campo>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className={btn} disabled={lavoro} onClick={png}>Scarica PNG</button>
              <button className={btn} disabled={lavoro} onClick={svg}>Scarica SVG</button>
            </div>
          </section>

          {esito && <p className="rounded-md bg-muted p-3 text-sm" data-testid="esito">{esito}</p>}
          {errore && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" data-testid="errore">{errore}</p>}
        </div>
      </div>
    </main>
  );
}

if (import.meta.env.DEV) createRoot(document.getElementById("root")!).render(<Pagina />);
