import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2, PenLine, ScanLine, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { cn } from "@/lib/utils";
import { useSalvaVersionePlanimetria } from "@/lib/planimetrie/archivio";
import { aggiungiTracciaSullaTavola, aggiornaLarghezzaTavolaIndicativa, esaminaPropostaTavola, ETICHETTE_TAVOLA, leggiTavolaArchiviata, type TipoTracciaTavola } from "@/lib/planimetrie/letturaAssistita";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import { TIPI_TAVOLA, type ElementoLetturaTavola, type PuntoTavola, type TipoTavola } from "../../../shared/planimetrie/letturaAssistita.ts";
import type { Livello, Planimetria } from "../../../shared/planimetrie/modello.ts";

const FILTRI: Record<TipoTavola, string> = { muro: "Muri", porta: "Porte", finestra: "Finestre", scala: "Scale", locale: "Locali" };
const nomeProposta = (p: ElementoLetturaTavola) => p.nome ?? `${ETICHETTE_TAVOLA[p.tipo]} ${p.id.split("-").at(-1)}`;
const STRUMENTI_TRACCIA = [{ tipo: "muro", nome: "Traccia muro" }, { tipo: "porta", nome: "Segna porta" }, { tipo: "finestra", nome: "Segna finestra" }] as const;

export function LetturaAssistitaTavola({ documento, livello, tavola, id, versione, puoScrivere, onCorrezioni }: {
  documento: Planimetria;
  livello: Livello;
  tavola: string;
  id: string;
  versione: number;
  puoScrivere: boolean;
  onCorrezioni?: () => void;
}) {
  const [bozza, setBozza] = useState(documento);
  const [attiva, setAttiva] = useState<string>();
  const [filtro, setFiltro] = useState<TipoTavola | "tutti">("tutti");
  const [ingrandita, setIngrandita] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [avviso, setAvviso] = useState("");
  const [errore, setErrore] = useState("");
  const [propostaBozza, setPropostaBozza] = useState(false);
  const [bozzaIndicativa, setBozzaIndicativa] = useState(false);
  const [larghezzaTavola, setLarghezzaTavola] = useState(String((livello.ricalco?.larghezzaCm ?? 1000) / 100));
  const [spessore, setSpessore] = useState("15");
  const [strumento, setStrumento] = useState<TipoTracciaTavola | null>(null);
  const [primoPunto, setPrimoPunto] = useState<PuntoTavola | null>(null);
  const controller = useRef<AbortController | undefined>(undefined);
  const scrittura = useRef(false);
  const salvaVersione = useSalvaVersionePlanimetria();
  const piano = bozza.livelli.find((p) => p.id === livello.id) ?? livello;
  const lettura = piano.letturaAssistita?.percorso === piano.ricalco?.percorso ? piano.letturaAssistita : undefined;
  const elementi = lettura?.elementi ?? [];
  const riprovaScritte = !!lettura && !(lettura.etichetteLette ?? elementi.some((e) => e.tipo === "locale"));
  const visibili = elementi.filter((e) => e.stato !== "scartato" && (filtro === "tutti" || e.tipo === filtro));
  const selezionata = visibili.find((e) => e.id === attiva);
  const daVerificare = elementi.filter((e) => e.stato === "da_verificare").length;
  const inseriti = elementi.filter((e) => e.stato === "inserito").length;
  const calibrata = piano.ricalco?.calibrata === true;
  const puoTracciare = puoScrivere && !!piano.ricalco && (calibrata || bozzaIndicativa);
  const occupato = inCorso || salvaVersione.isPending;
  const modifica = bozza !== documento;
  useSettingsDraftGuard(modifica);
  useEffect(() => () => controller.current?.abort(), []);

  const analizza = async () => {
    if (controller.current || !piano.ricalco?.percorso || !puoScrivere) return;
    const percorso = piano.ricalco.percorso;
    const avvio = new AbortController();
    controller.current = avvio;
    setInCorso(true);
    setErrore("");
    setAvviso("");
    try {
      const esito = await leggiTavolaArchiviata(tavola, avvio.signal);
      if (avvio.signal.aborted) return;
      if (!lettura && !esito.elementi.length) { setAvviso("Non ho trovato elementi leggibili. Puoi ricalcare la tavola nell’editor."); return; }
      if (!esito.etichetteLette) setAvviso("Il lettore locale delle scritte non ha risposto. Le proposte grafiche sono disponibili.");
      if (lettura && !esito.etichetteLette) return;
      const rilevate = lettura ? [...lettura.elementi, ...esito.elementi.filter((e) => e.tipo === "locale" && !lettura.elementi.some((p) => p.id === e.id))] : esito.elementi;
      setBozza((d) => ({ ...d, livelli: d.livelli.map((l) => l.id === livello.id ? {
        ...l, letturaAssistita: { percorso, elementi: rilevate, etichetteLette: esito.etichetteLette },
      } : l) }));
    } catch (e) {
      if (!avvio.signal.aborted) setErrore(e instanceof Error ? e.message : "Lettura della tavola non riuscita.");
    } finally {
      controller.current = undefined;
      if (!avvio.signal.aborted) setInCorso(false);
    }
  };

  const esamina = (esito: "inserito" | "scartato") => {
    if (!selezionata || occupato || !puoScrivere) return;
    try {
      setBozza(esaminaPropostaTavola(bozza, livello.id, selezionata.id, esito, bozzaIndicativa));
      setErrore("");
      if (esito === "scartato") setAttiva(undefined);
    } catch (e) { setErrore(e instanceof Error ? e.message : "Proposta non applicata."); }
  };

  const salva = async () => {
    if (!modifica || !puoScrivere || occupato || scrittura.current) return;
    scrittura.current = true;
    setErrore("");
    try {
      await salvaVersione.mutateAsync({ planimetriaId: id, documento: bozza, versioneAttesa: versione, nota: `Lettura assistita · ${livello.nome}` });
      toast.success("Verifiche salvate");
    } catch (e) { setErrore(e instanceof Error ? e.message : "Verifiche non salvate."); }
    finally { scrittura.current = false; }
  };

  const iniziaBozza = () => {
    if (!piano.ricalco || !puoScrivere || occupato) return;
    try {
      const metri = Number(larghezzaTavola.trim().replace(",", "."));
      if (Math.abs(metri * 100 - piano.ricalco.larghezzaCm) > 0.01 || !Number.isFinite(metri)) {
        setBozza(aggiornaLarghezzaTavolaIndicativa(bozza, livello.id, metri));
      }
      setBozzaIndicativa(true);
      setPropostaBozza(false);
      setErrore("");
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "La scala di lavoro non è disponibile.");
    }
  };

  const tracciaPunto = (punto: PuntoTavola) => {
    if (!strumento || !puoTracciare || occupato) return;
    if (!primoPunto) { setPrimoPunto(punto); setErrore(""); return; }
    try {
      const traccia = aggiungiTracciaSullaTavola(bozza, livello.id, strumento, primoPunto, punto,
        strumento === "muro" ? Number(spessore.trim().replace(",", ".")) : 2);
      setBozza(traccia.documento);
      setAttiva(traccia.id);
      setFiltro("tutti");
      setErrore("");
      setPrimoPunto(null);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Il tratto non si può aggiungere.");
      setPrimoPunto(null);
    }
  };

  const seleziona = (elemento: ElementoLetturaTavola) => { setAttiva(elemento.id); setErrore(""); };
  const larghezzaImmagine = Math.round(560 / (livello.ricalco?.proporzione || 1));

  return <section aria-label="Lettura assistita della tavola" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Verifica tavola · {livello.nome}</h2>
          <span className={cn("rounded-full px-2 py-0.5 text-xs", calibrata ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-950")}>{calibrata ? "Scala impostata" : bozzaIndicativa || piano.riscontroScala?.stato === "da_verificare" ? "Scala indicativa" : "Scala da impostare"}</span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{lettura ? `${daVerificare} da verificare · ${inseriti} aggiunti al disegno`
          : "Evidenzia possibili muri, aperture, scale ed etichette sulla tavola originale."}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {onCorrezioni && <Button type="button" size="sm" variant="outline" disabled={modifica || occupato} onClick={onCorrezioni}>Correzioni della pianta</Button>}
        {puoScrivere && <Button asChild size="sm" variant="outline"><Link to={percorsiPlanimetrie.modifica(id, livello.id)}>Apri l’editor</Link></Button>}
        {puoScrivere && (!lettura || riprovaScritte) && <Button type="button" size="sm" variant={lettura ? "outline" : "default"} className="gap-1.5" onClick={() => void analizza()} disabled={occupato}>
          {inCorso ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <ScanLine className="h-4 w-4" aria-hidden="true" />}
          {inCorso ? "Analisi in corso…" : lettura ? "Riprova lettura scritte" : "Riconosci elementi"}
        </Button>}
        {puoScrivere && (lettura || modifica) && <Button type="button" size="sm" onClick={() => void salva()} disabled={!modifica || occupato}>{inseriti ? "Salva modello modificabile" : "Salva verifiche"}</Button>}
      </div>
    </header>

    {puoScrivere && piano.ricalco && <section className="space-y-2 border-b bg-muted/25 p-3" aria-label="Ricostruzione modificabile">
      {!puoTracciare && !propostaBozza && <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setPropostaBozza(true)}>
        <PenLine className="h-4 w-4" aria-hidden="true" />Crea una bozza modificabile
      </Button>}
      {!puoTracciare && propostaBozza && <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs font-medium" htmlFor="larghezza-tavola-indicativa">Larghezza di lavoro del foglio (m)
          <Input id="larghezza-tavola-indicativa" inputMode="decimal" className="h-8 w-36" value={larghezzaTavola} onChange={(e) => setLarghezzaTavola(e.target.value)} />
        </label>
        <Button size="sm" type="button" disabled={occupato} onClick={iniziaBozza}>Usa scala indicativa</Button>
        <p className="w-full text-xs text-muted-foreground">La bozza si può modificare nell’editor. Verifica le quote prima del computo.</p>
      </div>}
      {puoTracciare && <>
        <div className="flex flex-wrap items-end gap-2">
          {STRUMENTI_TRACCIA.map(({ tipo, nome }) => <Button type="button" key={tipo} variant={strumento === tipo ? "secondary" : "outline"} size="sm"
            aria-pressed={strumento === tipo} disabled={occupato} onClick={() => { setStrumento(tipo); setPrimoPunto(null); setErrore(""); }}>{nome}</Button>)}
          {strumento === "muro" && <label className="flex flex-wrap items-center gap-2 text-xs font-medium" htmlFor="spessore-muro-tavola">Spessore (cm)
            <Input id="spessore-muro-tavola" inputMode="decimal" className="h-8 w-20" value={spessore} onChange={e => setSpessore(e.target.value)} />
          </label>}
          {strumento && <Button type="button" size="sm" variant="ghost" onClick={() => { setStrumento(null); setPrimoPunto(null); }}>Termina ricalco</Button>}
        </div>
        <p aria-live="polite" className="text-xs text-muted-foreground">{strumento ? primoPunto ? "Seleziona il secondo estremo." : "Seleziona il primo estremo sulla tavola."
          : "Traccia gli assi delle pareti, poi posiziona porte e finestre sulle pareti disegnate."}</p>
      </>}
    </section>}
    {avviso && <p role="status" className="border-b bg-muted/30 px-4 py-2 text-sm">{avviso}</p>}
    <div className={cn(lettura && "grid lg:grid-cols-[minmax(0,1fr)_19rem]")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-3 py-2">
          <span className="text-xs text-muted-foreground">{lettura ? "Arancione da verificare · Verde aggiunto" : "Tavola originale"}</span>
          <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5" onClick={() => setIngrandita((v) => !v)}>
            {ingrandita ? <ZoomOut className="h-4 w-4" aria-hidden="true" /> : <ZoomIn className="h-4 w-4" aria-hidden="true" />} {ingrandita ? "Adatta tavola" : "Ingrandisci tavola"}
          </Button>
        </div>
        <div className="max-h-[65vh] overflow-auto bg-slate-50 p-3 dark:bg-muted/25">
          <figure className="relative mx-auto" style={{ width: ingrandita ? `${larghezzaImmagine * 1.7}px` : `min(100%, ${larghezzaImmagine}px)` }}>
            <img src={tavola} alt={`Tavola originale · ${livello.nome}`} className="block h-auto w-full" draggable={false}/>
            {visibili.filter(e => !strumento || e.stato === "inserito").map((e) => <button key={e.id} type="button" onClick={() => seleziona(e)} aria-label={`Mostra sulla tavola ${nomeProposta(e)}`} aria-pressed={e.id === attiva} tabIndex={strumento ? -1 : undefined}
              className={cn("absolute min-h-2 min-w-2 rounded-sm border transition-colors focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                e.stato === "inserito" ? "border-emerald-700 bg-emerald-400/15 hover:bg-emerald-400/40" : "border-amber-700/80 bg-amber-300/20 hover:bg-amber-400/45",
                e.id === attiva && "z-10 border-2 ring-2 ring-blue-700 ring-offset-1", strumento && "pointer-events-none")}
              style={{ left: `${e.zona.x * 100}%`, top: `${e.zona.y * 100}%`, width: `${e.zona.larghezza * 100}%`, height: `${e.zona.altezza * 100}%` }} />)}
            {strumento && <button type="button" className="absolute inset-0 z-30 cursor-crosshair focus-visible:outline focus-visible:outline-primary"
              aria-label="Seleziona un punto sul foglio"
              onClick={(e) => {
                if (e.detail === 0) return;
                const r = e.currentTarget.getBoundingClientRect();
                tracciaPunto({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
              }}>
              {primoPunto && <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-white"
                style={{ left: `${primoPunto.x * 100}%`, top: `${primoPunto.y * 100}%` }} />}
            </button>}
          </figure>
        </div>
      </div>
      {lettura && <aside aria-label="Elementi da verificare" className="min-w-0 space-y-3 border-t p-3 lg:border-l lg:border-t-0">
        <div className="flex flex-wrap gap-1.5" aria-label="Filtra gli elementi">
          <Button type="button" size="sm" className="h-7 px-2 text-xs" variant={filtro === "tutti" ? "default" : "outline"} aria-pressed={filtro === "tutti"} onClick={() => setFiltro("tutti")}>Tutti</Button>
          {TIPI_TAVOLA.map((tipo) => {
            const quanti = elementi.filter((e) => e.tipo === tipo && e.stato !== "scartato").length;
            return <Button key={tipo} type="button" size="sm" className="h-7 px-2 text-xs" variant={filtro === tipo ? "default" : "outline"} aria-pressed={filtro === tipo} disabled={!quanti}
              onClick={() => setFiltro(tipo)}>{FILTRI[tipo]} {quanti}</Button>;
          })}
        </div>
        {!calibrata && puoScrivere && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-950">{bozzaIndicativa
          ? "Per usare le quantità, prima verifica la scala della bozza."
          : "Puoi impostare una quota nota nell’editor o iniziare una bozza in scala indicativa."}</p>}
        {selezionata && <div className="space-y-2 rounded-lg border bg-muted/35 p-2.5">
          <p className="break-words text-sm font-semibold">{nomeProposta(selezionata)}</p>
          {selezionata.stato === "inserito" ? <p className="text-xs text-emerald-700">Aggiunto al disegno</p> : <>
            <p className="text-xs text-muted-foreground">{selezionata.tipo === "locale" ? "La scritta diventa il nome della stanza se il perimetro è chiuso, oppure un’etichetta sul disegno."
              : selezionata.tipo === "scala" ? "Verifica rampa, verso e dislivello sul disegno."
              : "Verifica posizione e dimensioni rispetto alla tavola."}</p>
            {puoScrivere && <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" onClick={() => esamina("inserito")} disabled={!puoTracciare || occupato}>{bozzaIndicativa ? "Aggiungi alla bozza" : "Conferma e aggiungi"}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => esamina("scartato")} disabled={occupato}>Scarta</Button>
            </div>}
          </>}
        </div>}
        <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label="Proposte sulla tavola">
          {visibili.map((e) => <li key={e.id}>
            <Button type="button" size="sm" variant={attiva === e.id ? "secondary" : "ghost"} className="h-auto min-h-8 w-full justify-start gap-2 whitespace-normal px-2 py-1.5 text-left" onClick={() => seleziona(e)} aria-pressed={attiva === e.id}>
              {e.stato === "inserito" ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />}
              {nomeProposta(e)}
            </Button>
          </li>)}
        </ul>
      </aside>}
    </div>
    {errore && <p role="alert" className="border-t bg-destructive/5 px-4 py-3 text-sm text-destructive">{errore}</p>}
  </section>;
}
