import { useId, useRef, useState } from "react";
import { ArrowRight, Building2, CalendarRange, ChevronDown, ChevronRight, LocateFixed, PackageSearch, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDitteFaseOperazione, type FaseOperazione, type RapportinoCronoprogrammaOperazione } from "@/hooks/useMovimentiOperazione";
import {
  aggiungiGiorni, barra, fasiCronoprogramma, giornoLocale, intervalloCronoprogramma,
  intervalloPrevistoFase, intervalloRealeFase, lavoroRealeFasi, tacche, type FaseCrono,
} from "@/lib/orders/cronoprogramma";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { cercaNellOperazione } from "@/lib/orders/generali/registroOperazione";
import { planningDay } from "@/lib/orders/planning";
import { formattaFabbisogno, MOTIVI_FABBISOGNO, type ConsegnaFase } from "@/lib/orders/generali/consegneFasi";
import { cn } from "@/lib/utils";
import { dataBreve } from "../piano/formato";

const filtri = [
  ["tutte", "Tutte le fasi"],
  ["fine", "Scadenze superate"],
  ["inizio", "Avvii in ritardo"],
  ["prossime", "Prossimi 14 giorni"],
  ["date", "Date da verificare"],
  ["materiali", "Materiali mancanti"],
] as const;
type Filtro = (typeof filtri)[number][0];
type Scala = "automatica" | "settimane" | "mesi";
type Periodo = "previsto" | "confronto";
type FiltroAgenda = "crono-palazzina" | "crono-cerca" | "crono-filtro" | "crono-periodo";
const nomiStato = { da_iniziare: "Da iniziare", in_corso: "In corso", completata: "Completata" };
const formatoMese = new Intl.DateTimeFormat("it-IT", { month: "short", year: "2-digit", timeZone: "UTC" });

export function CronoprogrammaOperazione({ riepilogo, fasi, rapportini, onApri, onApriRapportino, consegne, onApriMateriali, avvisoMateriali,
  edificioPerCommessa, edificiCaricamento, riprovaEdifici }: {
  riepilogo: RiepilogoGenerale;
  fasi: FaseOperazione[];
  rapportini: RapportinoCronoprogrammaOperazione[];
  onApri: (orderId: string, faseId?: string) => void;
  onApriRapportino: (orderId: string, rapportinoId: string) => void;
  consegne?: ConsegnaFase[];
  onApriMateriali?: (orderId: string, faseId: string, articolo?: string) => void;
  avvisoMateriali?: React.ReactNode;
  edificioPerCommessa?: ReadonlyMap<string, string>;
  edificiCaricamento?: boolean;
  riprovaEdifici?: () => void;
}) {
  const [parametri, setParametri] = useSearchParams();
  const [periodoDesktop, setPeriodoDesktop] = useState<Periodo>("confronto");
  const [filtroDesktop, setFiltroDesktop] = useState<Filtro>("tutte");
  const [scala, setScala] = useState<Scala>("automatica");
  const [gruppiChiusi, setGruppiChiusi] = useState<ReadonlySet<string>>(new Set());
  const [faseAperta, setFaseAperta] = useState<string | null>(null);
  const rigaAperta = useRef<HTMLButtonElement | null>(null);
  const grafico = useRef<HTMLDivElement>(null);
  const indicatoreOggi = useRef<HTMLSpanElement>(null);
  const mobile = useIsMobile();
  const palazzina = parametri.get("crono-palazzina") ?? "";
  const cerca = parametri.get("crono-cerca")?.slice(0, 100) ?? "";
  const filtroUrl = parametri.get("crono-filtro");
  const filtro = mobile ? filtri.find(([id]) => id === filtroUrl)?.[0] ?? "tutte" : filtroDesktop;
  const periodo = mobile ? (parametri.get("crono-periodo") === "previsto" ? "previsto" : "confronto") : periodoDesktop;
  const oggi = giornoLocale(new Date().toISOString());
  const traDueSettimane = aggiungiGiorni(oggi, 14);
  const conReale = periodo === "confronto";
  const fasiPerId = new Map(fasi.map(f => [f.id, f]));
  const commesse = [riepilogo.generale, ...riepilogo.figlie];
  const commessePerId = new Map(commesse.map(c => [c.id, c]));
  const lavoro = lavoroRealeFasi(rapportini);
  const materialiPerFase = new Map<string, ConsegnaFase[]>();
  for (const riga of consegne ?? []) {
    const righe = materialiPerFase.get(riga.idFase);
    if (righe) righe.push(riga);
    else materialiPerFase.set(riga.idFase, [riga]);
  }
  const calendario = fasiCronoprogramma(fasi.map(f => ({
    ...f, percentuale: f.percentuale ?? 0, completata_il: f.completata_il ? giornoLocale(f.completata_il) : null,
  })), lavoro, oggi);
  const criteri: Record<Filtro, (f: FaseCrono) => boolean> = {
    tutte: () => true,
    fine: f => f.stato !== "completata" && f.ritardoFine > 0,
    inizio: f => f.stato !== "completata" && f.ritardoInizio > 0,
    prossime: f => f.stato !== "completata" && !f.dateIncoerenti &&
      !!f.previstoFine && f.previstoFine >= oggi && f.previstoFine <= traDueSettimane,
    date: dateDaVerificare,
    materiali: f => materialiPerFase.has(f.id),
  };
  const filtroAttivo = filtro === "materiali" && !consegne ? "tutte" : filtro;
  const nomeGruppo = (orderId: string) => {
    const commessa = commessePerId.get(orderId);
    if (orderId === riepilogo.generale.id) return "Aree comuni e generale";
    return edificioPerCommessa?.get(orderId)?.trim() ||
      (riepilogo.generale.modello === "appalto"
        ? commessa?.nome || commessa?.codice || "Lavori collegati"
        : "Unità senza palazzina");
  };
  const palazzine = mobile ? [...new Set(fasi.map(f => nomeGruppo(f.order_id)))]
    .sort((a, b) => a.localeCompare(b, "it", { numeric: true })) : [];
  const palazzinaAttiva = !edificiCaricamento && palazzine.includes(palazzina) ? palazzina : "";
  const ambitoAgenda = mobile ? calendario.filter(f => {
    const orderId = fasiPerId.get(f.id)!.order_id;
    const commessa = commessePerId.get(orderId);
    const gruppo = nomeGruppo(orderId);
    return (!palazzinaAttiva || gruppo === palazzinaAttiva) &&
      (!cerca.trim() || cercaNellOperazione(cerca, [f.nome, commessa?.nome, commessa?.codice, gruppo]));
  }) : calendario;
  const fasiVisibili = ambitoAgenda.filter(criteri[filtroAttivo]);
  const filtriDisponibili = filtri.filter(([id]) => id !== "materiali" || onApriMateriali);
  const fasiPerCommessa = new Map<string, FaseCrono[]>();
  for (const fase of fasiVisibili) {
    const orderId = fasiPerId.get(fase.id)!.order_id;
    const gruppo = fasiPerCommessa.get(orderId) ?? [];
    gruppo.push(fase);
    fasiPerCommessa.set(orderId, gruppo);
  }
  const asse = intervalloCronoprogramma(calendario, [], oggi, periodo);
  const segni = tacche(asse, scala === "automatica" ? (asse.giorni > 75 ? "mesi" : "settimane") : scala);
  const oggiVisibile = oggi >= asse.da && oggi <= asse.a;
  const posizioneOggi = barra(oggi, oggi, asse).left;
  const dettaglio = faseAperta ? calendario.find(f => f.id === faseAperta) : undefined;
  const commessaDettaglio = dettaglio && commessePerId.get(fasiPerId.get(dettaglio.id)!.order_id);

  const apriFase = (id: string, pulsante: HTMLButtonElement) => {
    rigaAperta.current = pulsante;
    setFaseAperta(id);
  };
  const aggiornaAgenda = (modifiche: Partial<Record<FiltroAgenda, string>>) => {
    setParametri(attuali => {
      const dopo = new URLSearchParams(attuali);
      for (const [chiave, valore] of Object.entries(modifiche)) {
        if (valore) dopo.set(chiave, valore);
        else dopo.delete(chiave);
      }
      return dopo;
    }, { replace: true, preventScrollReset: true });
  };
  const cambiaPeriodo = (id: Periodo) => {
    if (mobile) aggiornaAgenda({ "crono-periodo": id === "previsto" ? id : "" });
    else setPeriodoDesktop(id);
  };
  const cambiaFiltro = (id: Filtro) => {
    if (mobile) aggiornaAgenda({ "crono-filtro": id === "tutte" ? "" : id });
    else {
      setFiltroDesktop(id);
      setGruppiChiusi(new Set());
    }
  };
  const cambiaGruppo = (id: string) => {
    setGruppiChiusi(chiusi => {
      const aggiornati = new Set(chiusi);
      if (aggiornati.has(id)) aggiornati.delete(id);
      else aggiornati.add(id);
      return aggiornati;
    });
  };
  const vaiAOggi = () => {
    const contenitore = grafico.current;
    const indicatore = indicatoreOggi.current;
    if (!contenitore || !indicatore) return;
    const offset = indicatore.getBoundingClientRect().left - contenitore.getBoundingClientRect().left;
    contenitore.scrollTo({ left: contenitore.scrollLeft + offset - contenitore.clientWidth * 0.65 });
  };

  return (
    <section aria-labelledby="cronoprogramma-operazione" className="min-w-0 rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
        <div>
          <h3 id="cronoprogramma-operazione" className="flex items-center gap-2 text-sm font-semibold">
            <CalendarRange className="size-4 text-primary" aria-hidden="true" /> Cronoprogramma dell’operazione
          </h3>
          {fasi.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{dataBreve(asse.da)} – {dataBreve(asse.a)}</p>}
        </div>
        {fasi.length > 0 && <div className={cn("flex flex-wrap items-center gap-1.5", mobile && "w-full")}>
          {!mobile && <>
            <UniformSelect aria-label="Scala del cronoprogramma" className="h-8 rounded-md border px-2 text-xs"
              value={scala} onChange={e => setScala(e.target.value as Scala)}>
              <option value="automatica">Scala automatica</option>
              <option value="settimane">Settimane</option>
              <option value="mesi">Mesi</option>
            </UniformSelect>
            {oggiVisibile && (
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={vaiAOggi}>
                <LocateFixed className="size-3.5" aria-hidden="true" /> Oggi
              </Button>
            )}
          </>}
          <div role="group" aria-label="Periodo del cronoprogramma" className={cn("flex rounded-md border p-0.5", mobile && "w-full [&>button]:h-10 [&>button]:min-w-0 [&>button]:flex-1")}>
            <Button type="button" size="sm" className="h-7 px-2.5 text-xs" variant={conReale ? "secondary" : "ghost"}
              aria-pressed={conReale} onClick={() => cambiaPeriodo("confronto")}>Previsto e reale</Button>
            <Button type="button" size="sm" className="h-7 px-2.5 text-xs" variant={conReale ? "ghost" : "secondary"}
              aria-pressed={!conReale} onClick={() => cambiaPeriodo("previsto")}>Solo previsto</Button>
          </div>
        </div>}
      </header>
      {avvisoMateriali}
      {mobile && fasi.length > 0 && <div className="grid grid-cols-2 gap-2 border-t bg-muted/20 p-2.5">
        {palazzine.length > 1 && <label className="grid min-w-0 gap-1 text-xs font-medium">
          {riepilogo.generale.modello === "appalto" ? "Lavori" : "Palazzina"}
          <UniformSelect aria-label={riepilogo.generale.modello === "appalto" ? "Lavori del cronoprogramma" : "Palazzina del cronoprogramma"} value={palazzinaAttiva} onChange={e => aggiornaAgenda({ "crono-palazzina": e.target.value })}
            className="h-10 w-full min-w-0 bg-background px-2.5 text-xs font-normal">
            <option value="">{riepilogo.generale.modello === "appalto" ? "Tutti i lavori" : "Tutte le palazzine"}</option>
            {palazzine.map(nome => <option key={nome} value={nome}>{nome}</option>)}
          </UniformSelect>
        </label>}
        <label className={cn("grid min-w-0 gap-1 text-xs font-medium", palazzine.length <= 1 && "col-span-2")}>
          Fasi da mostrare
          <UniformSelect aria-label="Filtra le fasi del cronoprogramma" value={filtroAttivo} onChange={e => cambiaFiltro(e.target.value as Filtro)}
            className="h-10 w-full min-w-0 bg-background px-2.5 text-xs font-normal">
            {filtriDisponibili.map(([id, etichetta]) => <option key={id} value={id} disabled={id === "materiali" && !consegne}>
              {etichetta} ({ambitoAgenda.filter(criteri[id]).length})
            </option>)}
          </UniformSelect>
        </label>
        <div className="relative col-span-2 min-w-0">
          <Search className="pointer-events-none absolute left-2.5 top-3 size-4 text-muted-foreground" aria-hidden="true" />
          <Input className="h-10 pl-8 text-base" type="search" aria-label="Cerca fase o unità" placeholder="Cerca fase o unità…"
            maxLength={100} value={cerca} onChange={e => aggiornaAgenda({ "crono-cerca": e.target.value })} />
        </div>
        {!edificiCaricamento && (palazzina || cerca || filtroUrl) && <div className="col-span-2 flex items-center justify-between gap-2">
          <span role="status" className="text-xs text-muted-foreground">
            {fasiVisibili.length} {fasiVisibili.length === 1 ? "fase trovata" : "fasi trovate"}
          </span>
          <Button type="button" size="sm" variant="ghost" className="h-9 px-2 text-xs" onClick={() =>
            aggiornaAgenda({ "crono-palazzina": "", "crono-cerca": "", "crono-filtro": "" })}>
            Azzera filtri
          </Button>
        </div>}
        {riprovaEdifici && <p role="status" className="col-span-2 text-xs text-muted-foreground">
          Palazzine non disponibili. <button type="button" className="text-primary underline" onClick={riprovaEdifici}>Riprova</button>
        </p>}
      </div>}
      {!mobile && fasi.length > 0 && (
        <div role="group" aria-label="Filtra le fasi del cronoprogramma" className="flex flex-wrap gap-1.5 border-t bg-muted/20 px-3 py-2 sm:px-4">
          {filtriDisponibili.map(([id, etichetta]) => {
            const numero = calendario.filter(criteri[id]).length;
            return (
              <Button key={id} type="button" size="sm" variant={id === filtroAttivo ? "secondary" : "outline"}
                disabled={id === "materiali" && !consegne}
                aria-pressed={id === filtroAttivo} aria-label={`${etichetta}, ${numero} ${numero === 1 ? "fase" : "fasi"}`}
                className="h-8 gap-1.5 px-2 text-xs sm:h-7" onClick={() => cambiaFiltro(id)}>
                {etichetta}
                <span aria-hidden="true" className="rounded bg-background/80 px-1 text-[11px] tabular-nums text-muted-foreground">{numero}</span>
              </Button>
            );
          })}
        </div>
      )}
      {mobile && edificiCaricamento ? (
        <p role="status" className="border-t p-4 text-sm text-muted-foreground">Carico le palazzine…</p>
      ) : fasiVisibili.length === 0 ? (
        <p role="status" className="border-t p-4 text-sm text-muted-foreground">
          {fasi.length === 0 ? "Scegli una commessa in Lavorazioni per aggiungere le prime fasi." : "Nessuna fase corrisponde ai filtri."}
        </p>
      ) : mobile ? (
        <AgendaFasi fasi={fasiVisibili} nomeGruppo={f => nomeGruppo(fasiPerId.get(f.id)!.order_id)}
          nomeUnita={f => {
            const orderId = fasiPerId.get(f.id)!.order_id;
            const c = commessePerId.get(orderId);
            return orderId === riepilogo.generale.id ? undefined : c?.codice || c?.nome || undefined;
          }}
          conReale={conReale} apriFase={apriFase} materialiPerFase={materialiPerFase}
          espandiPerRicerca={!!cerca.trim() || !!palazzinaAttiva} />
      ) : (
        <>
          <div ref={grafico} role="region" aria-label="Grafico delle fasi per commessa" tabIndex={0}
            className="max-h-[64dvh] overflow-auto border-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <div style={{ minWidth: Math.max(768, 288 + segni.length * 58) }}>
              <div className="sticky top-0 z-20 flex border-b bg-muted text-xs text-muted-foreground">
                <div className="sticky left-0 z-10 w-72 shrink-0 border-r bg-muted px-3 py-2.5 font-medium">Commessa e fase</div>
                <div className="relative flex-1">
                  {segni.map(t => (
                    <span key={t.data} className="absolute bottom-1.5 whitespace-nowrap"
                      style={{ left: `clamp(0px, calc(${t.left}% - 1rem), 100% - 3rem)` }}>
                      {t.mese ? formatoMese.format(new Date(t.data + "T12:00:00Z")) : dataBreve(t.data).slice(0, 5)}
                    </span>
                  ))}
                  {oggiVisibile && <span ref={indicatoreOggi} className="absolute top-0 rounded-b bg-orange-100 px-1 text-[10px] font-medium text-orange-900 dark:bg-orange-950 dark:text-orange-200"
                    style={{ left: `${posizioneOggi}%` }}>Oggi</span>}
                </div>
              </div>
              {commesse.map(c => {
                const gruppo = fasiPerCommessa.get(c.id);
                if (!gruppo) return null;
                const chiuso = gruppiChiusi.has(c.id);
                const idGruppo = `crono-fasi-${c.id}`;
                const nome = c.nome ?? c.codice ?? "Commessa";
                return (
                  <div key={c.id}>
                    <div className="border-b bg-muted/45">
                      <div className="sticky left-0 flex w-fit max-w-full items-center gap-1 px-2 py-1">
                        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0"
                          aria-expanded={!chiuso} aria-controls={idGruppo} aria-label={`${chiuso ? "Espandi" : "Comprimi"} ${nome}`}
                          onClick={() => cambiaGruppo(c.id)}>
                          {chiuso ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                        </Button>
                        <button type="button" className="text-left text-xs font-semibold text-primary hover:underline" onClick={() => onApri(c.id)}>
                          {[c.codice, c.nome].filter(Boolean).join(" · ")}
                        </button>
                        <span className="ml-1 text-xs text-muted-foreground">{gruppo.length === 1 ? "1 fase" : `${gruppo.length} fasi`}</span>
                      </div>
                    </div>
                    <div id={idGruppo} hidden={chiuso}>
                      {gruppo.map(f => {
                        const piano = intervalloPrevistoFase(f);
                        const consuntivo = conReale && intervalloRealeFase(f, lavoro.get(f.id)?.ultimo ?? oggi);
                        const chiusura = conReale && !consuntivo && f.realeFine;
                        const titoloPiano = piano ? `Previsto ${dataBreve(piano[0])} – ${dataBreve(piano[1])}` : "Da pianificare";
                        const titoloReale = consuntivo ? `Registrato ${dataBreve(consuntivo[0])} – ${dataBreve(consuntivo[1])}` : chiusura ? `Chiusura ${dataBreve(chiusura)}` : "";
                        return (
                          <button key={f.id} type="button" aria-haspopup="dialog"
                            className="group flex w-full border-b text-left hover:bg-muted/30 focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-primary"
                            onClick={e => apriFase(f.id, e.currentTarget)}>
                            <span className="sticky left-0 z-10 flex w-72 shrink-0 items-center border-r bg-card px-3 py-2 group-hover:bg-muted">
                              <VoceFase fase={f} conReale={conReale} materiali={materialiPerFase.get(f.id)} />
                              <ChevronRight className="ml-1 size-3.5 shrink-0 text-muted-foreground/70 group-hover:text-primary" aria-hidden="true" />
                            </span>
                            <span role="img" aria-label={[titoloPiano, titoloReale].filter(Boolean).join(". ")} className="relative min-h-12 flex-1">
                              {segni.map(t => <span key={t.data} className="absolute inset-y-0 border-l border-border/70" style={{ left: `${t.left}%` }} />)}
                              {oggiVisibile && <span className="absolute inset-y-0 border-l border-dashed border-orange-500" style={{ left: `${posizioneOggi}%` }} />}
                              {piano && <span title={titoloPiano} style={stileBarra(barra(...piano, asse))}
                                className="absolute top-[27%] h-2 min-w-px rounded-sm border border-slate-400 bg-slate-100 dark:bg-slate-700" />}
                              {consuntivo && <span title={titoloReale} style={stileBarra(barra(...consuntivo, asse))}
                                className={cn("absolute top-[56%] h-2 min-w-px rounded-sm", f.stato === "completata" ? "bg-emerald-600" : "bg-blue-600")} />}
                              {chiusura && <span title={titoloReale} className="absolute top-[56%] size-2 rounded-full bg-emerald-600"
                                style={{ left: stileBarra(barra(chiusura, chiusura, asse)).left }} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs text-muted-foreground sm:px-4">
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm border border-slate-400 bg-slate-100 dark:bg-slate-700" />Previsto</span>
            {conReale && <>
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-blue-600" />Lavoro registrato</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-600" />Fase completata</span>
            </>}
          </div>
        </>
      )}
      <Sheet open={!!dettaglio && !!commessaDettaglio} onOpenChange={aperto => { if (!aperto) setFaseAperta(null); }}>
        {dettaglio && commessaDettaglio && (
          <SheetContent className="space-y-5 overflow-y-auto p-4 sm:max-w-md sm:p-5" overlayClassName="bg-black/40" onCloseAutoFocus={event => {
            if (!rigaAperta.current?.isConnected) return;
            event.preventDefault();
            rigaAperta.current.focus();
          }}>
            <DettaglioFase fase={dettaglio} commessa={commessaDettaglio}
              rapportini={rapportini} ultimaData={lavoro.get(dettaglio.id)?.ultimo}
              consegne={materialiPerFase.get(dettaglio.id)}
              onMateriali={onApriMateriali ? articolo => {
                setFaseAperta(null);
                onApriMateriali(commessaDettaglio.id, dettaglio.id, articolo);
              } : undefined}
              onApri={() => { setFaseAperta(null); onApri(commessaDettaglio.id, dettaglio.id); }}
              onRapportino={id => { setFaseAperta(null); onApriRapportino(commessaDettaglio.id, id); }} />
          </SheetContent>
        )}
      </Sheet>
    </section>
  );
}

function AgendaFasi({ fasi, nomeGruppo, nomeUnita, conReale, apriFase, materialiPerFase, espandiPerRicerca }: {
  fasi: FaseCrono[];
  nomeGruppo: (f: FaseCrono) => string;
  nomeUnita: (f: FaseCrono) => string | undefined;
  conReale: boolean;
  apriFase: (id: string, pulsante: HTMLButtonElement) => void;
  materialiPerFase: ReadonlyMap<string, ConsegnaFase[]>;
  espandiPerRicerca: boolean;
}) {
  const [stati, setStati] = useState<Record<string, boolean>>({});
  const uid = useId();
  const gruppi = new Map<string, FaseCrono[]>();
  for (const fase of fasi) {
    const titolo = nomeGruppo(fase);
    const gruppo = gruppi.get(titolo);
    if (gruppo) gruppo.push(fase);
    else gruppi.set(titolo, [fase]);
  }
  const elenco = [...gruppi].sort(([a], [b]) => a.localeCompare(b, "it", { numeric: true }));
  const aperti = espandiPerRicerca || fasi.length <= 12 || elenco.length === 1;
  return <div aria-label="Agenda per palazzina" className="divide-y border-t">
    {elenco.map(([nome, righe], indice) => {
      const aperto = espandiPerRicerca || (stati[nome] ?? aperti);
      const id = `${uid}-${indice}`;
      const completate = righe.filter(f => f.stato === "completata").length;
      return <section key={nome} aria-labelledby={`${id}-titolo`} className="min-w-0">
        <h4>
          <button type="button" id={`${id}-titolo`} aria-expanded={aperto} aria-controls={id}
            disabled={espandiPerRicerca} onClick={() => setStati(s => ({ ...s, [nome]: !aperto }))}
            className="flex min-h-12 w-full min-w-0 items-center gap-2 bg-muted/25 px-3 py-2 text-left hover:bg-muted/50 disabled:opacity-100">
            <Building2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 break-words text-sm font-semibold">{nome}</span>
            <span className="text-right text-xs tabular-nums text-muted-foreground">
              {righe.length} {righe.length === 1 ? "fase" : "fasi"}{completate > 0 && <span className="block">{completate} concluse</span>}
            </span>
            {!espandiPerRicerca && <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground", aperto && "rotate-180")} aria-hidden="true" />}
          </button>
        </h4>
        <div id={id} hidden={!aperto}>
          {aperto && <ul aria-label={`Fasi di ${nome}`} className="divide-y border-t">
            {[...righe].sort(perScadenza).map(fase => <li key={fase.id}>
              <button type="button" aria-haspopup="dialog" className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30"
                onClick={e => apriFase(fase.id, e.currentTarget)}>
                <span className="min-w-0 flex-1">
                  <span className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                    {nomeUnita(fase) && <span className="font-medium text-primary">{nomeUnita(fase)}</span>}
                    <span>{nomiStato[fase.stato]}</span>
                  </span>
                  <VoceFase fase={fase} conReale={conReale} mostraDateReali materiali={materialiPerFase.get(fase.id)} />
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>)}
          </ul>}
        </div>
      </section>;
    })}
  </div>;
}

function VoceFase({ fase, conReale, materiali, mostraDateReali }: {
  fase: FaseCrono; conReale: boolean; materiali?: ConsegnaFase[]; mostraDateReali?: boolean;
}) {
  const da = dataBreve(fase.previstoInizio);
  const a = dataBreve(fase.previstoFine);
  const stessoAnno = fase.previstoInizio?.slice(0, 4) === fase.previstoFine?.slice(0, 4);
  const date = stessoAnno ? `${da.slice(0, 5)} – ${a.slice(0, 5)}` : `${da} – ${a}`;
  const aRischio = materiali?.filter(r => r.aRischio).length ?? 0;
  const dateReali = [
    fase.realeInizio && `Avvio registrato ${dataBreve(fase.realeInizio)}`,
    fase.chiusuraRegistrata && fase.realeFine && `Chiusura ${dataBreve(fase.realeFine)}`,
  ].filter(Boolean);
  return (
    <span className="block min-w-0 flex-1">
      <span className="flex items-start justify-between gap-2 text-xs font-semibold">
        <span className="min-w-0 break-words">{fase.nome}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{fase.avanzamento}%</span>
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
        {fase.previstoInizio || fase.previstoFine ? <span className="whitespace-nowrap tabular-nums">{date}</span> : null}
        {dateDaVerificare(fase) && (
          <span className="rounded bg-amber-50 px-1 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">Date da verificare</span>
        )}
        {conReale && <ScostamentiFase fase={fase} />}
        {conReale && fase.stato === "in_corso" && !fase.realeInizio && <span>Avvio non registrato</span>}
        {!!materiali?.length && <span className={cn("rounded px-1 font-medium", aRischio
          ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-muted")}>
          {aRischio > 0 ? `${aRischio} ${aRischio === 1 ? "materiale" : "materiali"} a rischio`
            : `${materiali.length} ${materiali.length === 1 ? "materiale mancante" : "materiali mancanti"}`}
        </span>}
      </span>
      {mostraDateReali && conReale && dateReali.length > 0 && <span className="mt-1 block text-xs text-muted-foreground">
        {dateReali.join(" · ")}
      </span>}
    </span>
  );
}

function ScostamentiFase({ fase }: { fase: FaseCrono }) {
  if (fase.stato === "completata") return null;
  return <>
    {fase.ritardoInizio > 0 && <span className="whitespace-nowrap rounded bg-amber-50 px-1 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      Avvio +{fase.ritardoInizio} gg
    </span>}
    {fase.ritardoFine > 0 && <span className="whitespace-nowrap rounded bg-rose-50 px-1 font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-200">
      Fine +{fase.ritardoFine} gg
    </span>}
  </>;
}

function DettaglioFase({ fase, commessa, rapportini, ultimaData, onApri, onRapportino, consegne, onMateriali }: {
  fase: FaseCrono;
  commessa: { id: string; codice: string | null; nome: string | null };
  rapportini: RapportinoCronoprogrammaOperazione[];
  ultimaData?: string;
  onApri: () => void;
  onRapportino: (id: string) => void;
  consegne?: ConsegnaFase[];
  onMateriali?: (articolo?: string) => void;
}) {
  const ditte = useDitteFaseOperazione(commessa.id, fase.id);
  let ultimo: RapportinoCronoprogrammaOperazione | undefined;
  for (const r of rapportini) {
    if (!ultimaData || r.order_id !== commessa.id || planningDay(r.data_lavoro) !== ultimaData || !Array.isArray(r.fasi_lavorate)) continue;
    if (r.fasi_lavorate.some(v => v?.phase_id === fase.id)) ultimo = r;
  }
  const fineReale = fase.chiusuraRegistrata ? dataBreve(fase.realeFine) : fase.stato === "completata" ? "Da registrare" : "Fase aperta";

  return (
    <>
      <SheetHeader className="space-y-1 pr-8 text-left">
        <SheetTitle>{fase.nome}</SheetTitle>
        <SheetDescription>{[commessa.codice, commessa.nome].filter(Boolean).join(" · ")}</SheetDescription>
      </SheetHeader>
      <div className="space-y-2 rounded-lg border bg-muted/25 p-3">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span>{nomiStato[fase.stato]}</span>
          <strong className="tabular-nums">{fase.avanzamento}%</strong>
        </div>
        <Progress aria-label="Avanzamento della fase" value={fase.avanzamento} className="h-1.5" />
        {(fase.ritardoInizio > 0 || fase.ritardoFine > 0) && fase.stato !== "completata" && (
          <div className="flex flex-wrap gap-2 text-xs"><ScostamentiFase fase={fase} /></div>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
        <Dato titolo="Inizio previsto" valore={fase.previstoInizio ? dataBreve(fase.previstoInizio) : "Da pianificare"} />
        <Dato titolo="Fine prevista" valore={fase.previstoFine ? dataBreve(fase.previstoFine) : "Da pianificare"} />
        <Dato titolo="Avvio registrato" valore={fase.realeInizio ? dataBreve(fase.realeInizio) : "Da registrare"} />
        <Dato titolo="Chiusura registrata" valore={fineReale} />
      </dl>
      {fase.dateIncoerenti && <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Date incoerenti da verificare in Lavorazioni
      </p>}
      <dl className="space-y-3 text-sm">
        <Dato titolo="Ditte assegnate" valore={ditte.isLoading ? "Caricamento…" : ditte.isError ? "Dati non disponibili" : ditte.data?.join(", ") || "Nessuna ditta assegnata"} />
        <Dato titolo="Ultimo rapportino" valore={ultimo ? dataBreve(ultimo.data_lavoro) : "Nessun rapportino collegato"} />
      </dl>
      {!!consegne?.length && <section aria-label="Materiali da completare" className="rounded-lg border">
        <header className="flex items-center justify-between gap-2 px-3 py-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold"><PackageSearch className="size-4 text-primary" aria-hidden="true" />
            Materiali da completare
          </h4>
          {onMateriali && <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => onMateriali()}>
            Apri materiali
          </Button>}
        </header>
        <ul className="max-h-60 divide-y overflow-auto border-t">
          {consegne.map(r => <li key={r.id} className="space-y-1 px-3 py-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              {onMateriali ? <button type="button" className="text-left font-medium text-primary hover:underline" onClick={() => onMateriali(r.articolo)}>
                {r.articolo}
              </button> : <strong>{r.articolo}</strong>}
              <span className={cn("shrink-0 rounded px-1.5 py-0.5", r.aRischio
                ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-muted text-muted-foreground")}>
                {MOTIVI_FABBISOGNO[r.motivo]}
              </span>
            </div>
            <p className="tabular-nums text-muted-foreground">
              {r.unitaDaVerificare ? "Verifica le unità dell’articolo e dell’ordine"
                : <>Arrivati {formattaFabbisogno(r.arrivati, r.unita)} su {formattaFabbisogno(r.previsti, r.unita)}
                  {r.assegnati > 0 && ` · Scorta assegnata ${formattaFabbisogno(r.assegnati, r.unita)}`}
                  {" · "}<strong className="text-foreground">Mancano {formattaFabbisogno(r.mancanti, r.unita)}</strong></>}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
              {!r.unitaDaVerificare && <span>{r.daOrdinare > 0 ? `Da ordinare ${formattaFabbisogno(r.daOrdinare, r.unita)}`
                : "Residuo già ordinato"}</span>}
              {r.serveEntro && <span>Serve entro il {dataBreve(r.serveEntro)}</span>}
              {r.oda && <Link to={`/azienda/ordini-acquisto/${r.oda.id}`} className="text-primary hover:underline">{r.oda.oda_number}</Link>}
            </div>
          </li>)}
        </ul>
      </section>}
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button type="button" size="sm" onClick={onApri}>Apri lavorazione <ArrowRight className="size-4" aria-hidden="true" /></Button>
        {ultimo && <Button type="button" size="sm" variant="outline" onClick={() => onRapportino(ultimo.id)}>Apri rapportino</Button>}
      </div>
    </>
  );
}

function Dato({ titolo, valore }: { titolo: string; valore: string }) {
  return <div>
    <dt className="text-xs text-muted-foreground">{titolo}</dt>
    <dd className="mt-0.5 break-words font-medium">{valore}</dd>
  </div>;
}

function perScadenza(a: FaseCrono, b: FaseCrono) {
  return Number(a.stato === "completata") - Number(b.stato === "completata")
    || (a.dateIncoerenti ? "9999" : a.previstoFine ?? "9999").localeCompare(b.dateIncoerenti ? "9999" : b.previstoFine ?? "9999")
    || a.nome.localeCompare(b.nome, "it");
}

function dateDaVerificare(fase: FaseCrono) {
  return !!fase.dateIncoerenti || (fase.stato !== "completata" && (!fase.previstoInizio || !fase.previstoFine));
}

function stileBarra({ left, width }: { left: number; width: number }) {
  return { left: `${left}%`, width: `${width}%` };
}
