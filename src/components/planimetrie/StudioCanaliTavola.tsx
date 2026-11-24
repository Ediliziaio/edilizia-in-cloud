import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, FileSpreadsheet, Focus, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { leggiSezioniVerticali, leggiTavolaTecnica } from "@/lib/planimetrie/analisiTavola";
import { ricostruisciCanali, type RicostruzioneCanali, type TrattoCanale } from "@/lib/planimetrie/canaliDaTavola";
import { apriComputoCanali, NOMI_RETE_ARIA, superficieRettifilo } from "@/lib/planimetrie/computoCanali";
import { NOMI_RACCORDI } from "@/lib/planimetrie/raccordiCanali";
import type { ReteAria } from "@/lib/planimetrie/tavolaTecnica";
import type { PiantaPer3D, Punto2, Telecamera3D } from "@/lib/planimetrie/tred/tipi";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const Vista3D = lazy(() => import("./Vista3D"));
const COLORE_RETE: Record<ReteAria, string> = { mandata: "#197bc4", ripresa: "#cb404d" };
const formato = new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 2 });
const QUOTE_SCHEMA_CM: Record<ReteAria, number> = { mandata: 300, ripresa: 220 };
const RETI = ["mandata", "ripresa"] as const;

function piantaPerCanali(studio: RicostruzioneCanali, tratti: TrattoCanale[], nodo?: string): PiantaPer3D {
  const { scala, larghezza, altezza, area } = studio;
  const cx = scala ? larghezza * scala.metriPerPixelX * 100 : 3000;
  const cy = scala ? altezza * scala.metriPerPixelY * 100 : cx * altezza / larghezza;
  const punto = (p: Punto2) => ({ x: (p.x - area.x) * cx, y: (p.y - area.y) * cy });
  const w = area.larghezza * cx, h = area.altezza * cy;
  const reteDi = new Map(tratti.map(t => [t.id, t.rete]));
  return {
    muri: [], aperture: [], locali: [], elementi: [],
    aree: [{ tipo: "piazzale", id: "base-studio-canali", contorno: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] }],
    canaliAria: tratti.map(t => ({
      id: t.id, rete: t.rete, da: punto(t.da), a: punto(t.a), quota: QUOTE_SCHEMA_CM[t.rete],
      larghezza: t.sezione && t.sezione.larghezzaMm / 10, altezza: t.sezione && t.sezione.altezzaMm / 10,
    })),
    raccordiAria: studio.raccordi.filter(r => r.rami.every(ramo => reteDi.has(ramo.trattoId))).map(r => ({
      id: r.id, tipo: r.tipo, rete: r.rete, punto: punto(r.punto), rami: r.rami, coperto: r.trattoCoperto, selezionato: r.id === nodo,
    })),
    incrociAria: studio.incroci.flatMap(i => {
      const [a, b] = i.tratti.map(id => reteDi.get(id));
      if (!a || !b) return [];
      const qa = QUOTE_SCHEMA_CM[a], qb = QUOTE_SCHEMA_CM[b];
      return [{ id: i.id, punto: punto(i.punto), quoteCm: [Math.min(qa, qb), Math.max(qa, qb)], selezionato: i.id === nodo }];
    }),
  };
}

function cameraNodo(pianta: PiantaPer3D | undefined, nodo: string | undefined): Telecamera3D | undefined {
  const incrocio = pianta?.incrociAria?.find(i => i.id === nodo);
  const raccordo = pianta?.raccordiAria?.find(r => r.id === nodo);
  const p = incrocio?.punto ?? raccordo?.punto;
  if (!p) return undefined;
  const quota = incrocio ? (incrocio.quoteCm[0] + incrocio.quoteCm[1]) / 2 : QUOTE_SCHEMA_CM[raccordo!.rete];
  const x = p.x / 100, y = quota / 100, z = p.y / 100;
  return { posizione: [x + 3.2, y + 2, z + 3.85], guarda: [x, y, z], fov: 37 };
}

export function StudioCanaliTavola({ src, companyId, planimetriaId, versione, livelloId, titolo, puoComputo, vista, nodo, onVista }: {
  src: string;
  companyId: string;
  planimetriaId: string;
  versione: number;
  livelloId: string;
  titolo: string;
  puoComputo: boolean;
  vista: "tavola" | "3d";
  nodo?: string;
  onVista: (vista: "tavola" | "3d", nodo?: string) => void;
}) {
  const tr = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lettura, setLettura] = useState<{ src: string; studio?: RicostruzioneCanali; errore?: string }>();
  const [tentativo, setTentativo] = useState(0);
  const [rete, setRete] = useState<ReteAria | "entrambe">("entrambe");
  const [attivo, setAttivo] = useState<string>();
  const [erroreComputo, setErroreComputo] = useState("");
  const [creando, setCreando] = useState<"rettifili" | "raccordi" | null>(null);
  const bloccoComputo = useRef(false);
  const esito = lettura?.src === src ? lettura : undefined;
  const studio = esito?.studio;
  const visibili = useMemo(() => studio?.tratti.filter(t => rete === "entrambe" || rete === t.rete) ?? [], [studio, rete]);
  const pianta = useMemo(() => studio && piantaPerCanali(studio, visibili, nodo), [studio, visibili, nodo]);
  const camera = cameraNodo(pianta, nodo);
  const raccordiVisibili = studio?.raccordi.filter(r => rete === "entrambe" || rete === r.rete) ?? [];
  const incrociVisibili = studio?.incroci.filter(i => pianta?.incrociAria?.some(v => v.id === i.id)) ?? [];
  const incrociReti = incrociVisibili.filter(i => i.reti === "distinte");
  const incrociDaLeggere = incrociVisibili.filter(i => i.reti === "stessa");
  const siInquadra = (id: string) => onVista("3d", id);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      try {
        const risposta = await fetch(src, { signal });
        if (!risposta.ok) throw new Error(tr("Il foglio originale non è disponibile."));
        const analisi = await leggiTavolaTecnica(await risposta.blob(), signal, { quoteVerticali: true });
        if (analisi.tavola.tipo !== "hvac" || !analisi.tavola.codiceMandata) throw new Error(tr("Per distinguere mandata e ripresa serve una legenda leggibile insieme alla tavola."));
        const base = ricostruisciCanali(analisi.tavola, analisi.righe);
        if (!base.tratti.length) throw new Error(tr("I tracciati non sono leggibili. Prova con il PDF originale o con un’immagine più nitida."));
        const verticali = await leggiSezioniVerticali(analisi, base, signal);
        signal.throwIfAborted();
        setLettura({ src, studio: verticali.length ? ricostruisciCanali(analisi.tavola, [...analisi.righe, ...verticali]) : base });
      } catch (e) {
        if (!signal.aborted) setLettura({ src, errore: e instanceof Error ? e.message : tr("Impossibile leggere i canali.") });
      }
    })();
    return () => controller.abort();
  }, [src, tentativo, tr]);

  const apriComputo = async (tipo: "rettifili" | "raccordi") => {
    if (!studio || !user || !puoComputo || bloccoComputo.current) return;
    bloccoComputo.current = true;
    setCreando(tipo);
    setErroreComputo("");
    try {
      const rilievo = tipo === "rettifili" ? { ...studio, raccordi: [] } : studio;
      const id = await apriComputoCanali(rilievo, { companyId, userId: user.id, planimetriaId, versione, livelloId, titolo });
      navigate(`/azienda/marketing/preventivi/computo?${new URLSearchParams({ bozza: id, esistente: "1", fase: "3" })}`);
    } catch (e) {
      setErroreComputo(e instanceof Error ? e.message : tr("Il computo dei canali non è disponibile."));
    } finally {
      bloccoComputo.current = false;
      setCreando(null);
    }
  };

  return <section aria-labelledby="studio-canali" className="overflow-hidden rounded-xl border bg-card">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <div>
        <h2 id="studio-canali" className="text-base font-semibold">{tr("Canali di mandata e ripresa")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{tr("Ricostruzione dalla tavola HVAC · Versione {versione}", { versione: String(versione ?? "") })}</p>
      </div>
      {studio && puoComputo && <div className="flex flex-wrap gap-2">
        {studio.raccordi.length > 0 && <Button type="button" variant="outline" disabled={!!creando} onClick={() => { void apriComputo("rettifili"); }}>
          {creando === "rettifili" ? tr("Preparazione del computo…") : tr("Apri il computo dei rettifili")}
        </Button>}
        <Button type="button" className="gap-2" onClick={() => { void apriComputo("raccordi"); }} disabled={!!creando}>
          {creando === "raccordi" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
          {creando === "raccordi" ? tr("Preparazione del computo…") : studio.raccordi.length ? tr("Apri il computo con raccordi") : tr("Apri il computo modificabile")}
        </Button>
      </div>}
    </header>
    {!esito && <p role="status" className="flex items-center gap-2 p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {tr("Lettura dei tracciati e delle sezioni…")}</p>}
    {esito?.errore && <div className="flex flex-wrap items-center gap-3 p-4"><p role="alert" className="text-sm">{esito.errore}</p>
      <Button onClick={() => { setLettura(undefined); setTentativo((t) => t + 1); }} variant="outline" size="sm">{tr("Riprova")}</Button>
    </div>}
    {erroreComputo && <p role="alert" className="border-b px-4 py-2 text-sm text-destructive">{erroreComputo}</p>}
    {studio && <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.55fr)]">
      <div className="min-w-0 space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1" role="group" aria-label={tr("Vista dei canali")}>
            <Button type="button" size="sm" variant={vista === "tavola" ? "secondary" : "outline"} aria-pressed={vista === "tavola"} onClick={() => onVista("tavola")}>{tr("Tavola")}</Button>
            <Button type="button" size="sm" variant={vista === "3d" ? "secondary" : "outline"} aria-pressed={vista === "3d"} onClick={() => onVista("3d")} className="gap-1.5">
              <Box className="h-4 w-4" aria-hidden="true" />{tr("Modello 3D")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label={tr("Seleziona rete")}>
            <Button type="button" size="sm" variant={rete === "entrambe" ? "secondary" : "ghost"} aria-pressed={rete === "entrambe"} onClick={() => setRete("entrambe")}>{tr("Entrambe")}</Button>
            {RETI.map(r => <Button type="button" key={r} size="sm" variant={rete === r ? "secondary" : "ghost"} aria-pressed={rete === r}
              onClick={() => setRete(r)} className="gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORE_RETE[r] }} />{NOMI_RETE_ARIA[r]}</Button>)}
          </div>
        </div>
        {vista === "3d" && pianta ? <Suspense fallback={<p role="status">{tr("Apertura 3D…")}</p>}>
          <Vista3D key={camera ? nodo : "panoramica"} piante={{ fatto: pianta, progetto: pianta }} nomeFile="schema-canali-hvac" telecameraIniziale={camera} />
        </Suspense> : <svg viewBox={`0 0 ${studio.larghezza} ${studio.altezza}`} role="img"
          aria-label={tr("Tavola HVAC con gli assi dei canali ricostruiti")} className="h-auto w-full rounded-lg border bg-white">
          <image href={src} width={studio.larghezza} height={studio.altezza} opacity={0.49} />
          {visibili.map(t => <line key={t.id} x1={t.da.x * studio.larghezza} y1={t.da.y * studio.altezza} x2={t.a.x * studio.larghezza} y2={t.a.y * studio.altezza}
            stroke={COLORE_RETE[t.rete]} strokeWidth={attivo === t.id ? 7 : t.sezione ? 4 : 2.75} strokeDasharray={t.sezione ? undefined : "6 5"}
            strokeLinecap="round" />)}
          {raccordiVisibili.map(r => <circle key={r.id} cx={r.punto.x * studio.larghezza} cy={r.punto.y * studio.altezza}
            r={r.trattoCoperto ? 5 : 4} stroke={COLORE_RETE[r.rete]} strokeWidth={2} fill={r.trattoCoperto ? "white" : COLORE_RETE[r.rete]} />)}
          {incrociVisibili.map(i => <circle key={i.id} cx={i.punto.x * studio.larghezza} cy={i.punto.y * studio.altezza}
            r={i.reti === "distinte" ? 8 : 5} stroke="#b66600" strokeWidth={2} fill="none" />)}
        </svg>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {vista === "3d"
              ? tr("Quote grafiche di 3,00 m per la mandata e 2,20 m per la ripresa. Le altezze di posa restano da verificare.")
              : tr("Linea tratteggiata per gli assi senza sezione leggibile. I cerchi arancioni indicano le sovrapposizioni.")}
          </p>
          {vista === "3d" && camera && <Button type="button" size="sm" variant="outline" onClick={() => onVista("3d")}>{tr("Vista d’insieme")}</Button>}
        </div>
      </div>
      <aside className="min-w-0 space-y-4 border-t p-4 lg:border-l lg:border-t-0" aria-label={tr("Misure e verifiche dei canali")}>
        {incrociReti.length > 0 && <div className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold">{tr("Incroci tra mandata e ripresa")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{tr("Seleziona un punto per vedere le due reti in 3D. Verifica le quote di posa e la distanza libera.")}</p>
          </div>
          <ul className="divide-y rounded-lg border">
            {incrociReti.map(i => <li key={i.id}>
              <button type="button" aria-pressed={nodo === i.id && vista === "3d"} onClick={() => siInquadra(i.id)}
                className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50", nodo === i.id && vista === "3d" && "bg-muted")}>
                <span><span className="font-medium">{tr("Incrocio {valore}", { valore: String(i.id.split("-").at(-1) ?? "") })}</span>
                  {i.trattoCoperto && <span className="ml-2 text-muted-foreground">{" "}{tr("Tratto in parte coperto")}</span>}</span>
                <Focus className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            </li>)}
          </ul>
        </div>}
        {raccordiVisibili.length > 0 && <details className="rounded-lg border px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold">{tr("{n} raccordi dalla tavola", { n: raccordiVisibili.length })}</summary>
          <ul className="mt-2 divide-y">
            {raccordiVisibili.map(r => <li key={r.id}>
              <button type="button" aria-pressed={nodo === r.id && vista === "3d"} onClick={() => siInquadra(r.id)}
                className={cn("flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-xs hover:bg-muted/50", nodo === r.id && vista === "3d" && "bg-muted")}>
                <span><span className="font-medium">{NOMI_RACCORDI[r.tipo]} {r.id.split("-").at(-1)}</span>
                  <span className="block text-muted-foreground">{tr(NOMI_RETE_ARIA[r.rete])}{r.trattoCoperto ? ` ${tr("· collegamento coperto da confermare")}` : ""}</span></span>
                <Focus className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            </li>)}
          </ul>
        </details>}
        {incrociDaLeggere.length > 0 && <details className="rounded-lg border px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold">{tr("{n} nodi della stessa rete da verificare", { n: incrociDaLeggere.length })}</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {incrociDaLeggere.map(i => <Button key={i.id} type="button" size="sm" variant="outline"
              aria-pressed={nodo === i.id && vista === "3d"} onClick={() => siInquadra(i.id)}>{tr("Nodo {valore}", { valore: String(i.id.split("-").at(-1) ?? "") })}</Button>)}
          </div>
        </details>}
        <div>
          <h3 className="text-sm font-semibold">{tr("Rettifili con sezione leggibile")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{studio.scala
            ? tr("Metri in pianta stimati dalle catene di quote sui due assi. La superficie è lo sviluppo laterale del canale.")
            : tr("Verifica entrambe le quote d’asse per calcolare i metri sulla tavola.")}</p>
        </div>
        <ul className="divide-y rounded-lg border">
          {visibili.filter(t => t.sezione).map(t => <li key={t.id}>
            <button type="button" aria-pressed={attivo === t.id}
              onClick={() => { if (vista !== "tavola") onVista("tavola"); setAttivo(attivo === t.id ? undefined : t.id); }}
              className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50", attivo === t.id && "bg-muted")}>
              <span><span className="block font-medium">{tr("{valore} · {larghezzaMm} × {altezzaMm} mm", { valore: tr(NOMI_RETE_ARIA[t.rete]), larghezzaMm: String(t.sezione!.larghezzaMm ?? ""), altezzaMm: String(t.sezione!.altezzaMm ?? "") })}</span>
                <span className="text-muted-foreground">{tr("Tratto {valore}", { valore: String(t.id.split("-").at(-1) ?? "") })}</span></span>
              {t.lunghezzaM !== null && <span className="shrink-0 text-right tabular-nums">{formato.format(t.lunghezzaM)} m
                <span className="block text-muted-foreground">{formato.format(superficieRettifilo(t)!)} m²</span></span>}
            </button>
          </li>)}
          {!visibili.some(t => t.sezione) && <li className="px-3 py-2 text-xs text-muted-foreground">{tr("Nessuna sezione associabile a un tratto visibile.")}</li>}
        </ul>
        {studio.scala && <div className="grid grid-cols-2 gap-2">
          {RETI.map(r => {
            const quantita = studio.tratti.filter(t => t.rete === r).map(superficieRettifilo).filter(n => n !== null);
            return <div key={r} className="rounded-lg border bg-muted/30 p-2.5">
              <p className="text-xs text-muted-foreground">{tr(NOMI_RETE_ARIA[r])}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{quantita.length ? `${formato.format(quantita.reduce((s, t) => s + t, 0))} m²` : tr("Da misurare")}</p>
            </div>;
          })}
        </div>}
        <div className="rounded-lg border bg-muted/25 p-3 text-xs leading-relaxed">
          <p className="font-semibold">{tr("Da verificare sulla tavola originale")}</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>{tr("{n} tratti senza sezione associata.", { n: studio.tratti.filter(t => !t.sezione).length })}</li>
            {studio.scalaDiscordante && <li>{tr("Scala diversa fra i due assi della foto. Conferma entrambe le quote.")}</li>}
            <li>{tr("Raggi, riduzioni, attacchi all’UTA, tratti coperti, altezze di posa e accessori.")}</li>
          </ul>
        </div>
      </aside>
    </div>}
  </section>;
}
