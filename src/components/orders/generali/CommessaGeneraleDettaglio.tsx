import "../commessa-workspace.css";
// src/components/orders/generali/CommessaGeneraleDettaglio.tsx
// La pagina di una commessa generale: la regia. In alto quanto del valore è assegnato,
// eseguito, fatturato e incassato; sotto le commesse che contiene. Le commesse dentro
// restano commesse normali: si aprono e si lavorano come sempre.
// Da telefono si legge soltanto: creare, collegare e modificare si fa da tablet o computer.
// I moduli (contratto, piano economico, unità, investitori, documenti) aggiungono le loro
// schede accanto a «Panoramica», solo quando sono pronti e accesi dal modello (schede.tsx).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRightLeft, ArrowUpRight, Banknote, Building2, CalendarRange, ChartNoAxesCombined, ChevronDown, ClipboardList, CircleDollarSign, FileCheck2, FolderOpen, HardHat, Info, Landmark, LayoutDashboard, Link2, ListChecks, MoreHorizontal, Pencil, Plus, Search, TrendingUp, Unlink, Wallet } from "lucide-react";
import { ComposizioneCosti } from "@/components/orders/generali/design/ComposizioneCosti";
import { GraficoSpesa } from "@/components/orders/generali/design/GraficoSpesa";
import { FattureOperazione } from "@/components/orders/generali/design/FattureOperazione";
import { QuadroPrevisionale } from "@/components/orders/generali/design/QuadroPrevisionale";
import { SpesaControLavori } from "@/components/orders/generali/design/SpesaControLavori";
import { numeriOperazione, superficieOperazione } from "@/lib/orders/generali/numeriOperazione";
import { useUnitaGenerale } from "@/hooks/useGeneraleUnita";
import { useAvanzamentoCantiere } from "@/hooks/useAvanzamentoCantiere";
import { AvvisiPiano } from "@/components/orders/generali/design/AvvisiPiano";
import { RiquadroCantiereOperazione } from "@/components/orders/generali/design/RiquadroCantiereOperazione";
import { ArchivioDocumentiPanoramica } from "@/components/orders/generali/documenti/RiquadroDocumenti";
import { STILE_STATO } from "@/components/orders/generali/unita/aspetto";
import { STATI_VENDITA, statoVenditaConfermato, type StatoVendita } from "@/lib/orders/generali/unita";
import "./design/commessa-generale.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TablePagination } from "@/components/ui/table-pagination";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CollegaCommesseDialog } from "@/components/orders/generali/CollegaCommesseDialog";
import { ModificaGeneraleDialog } from "@/components/orders/generali/ModificaGeneraleDialog";
import { BottoneRendiconto } from "@/components/orders/generali/rendiconto/RendicontoGenerale";
import { PerPartire } from "@/components/orders/generali/PerPartire";
import { PerLavorare } from "@/components/orders/generali/PerLavorare";
import { riquadriDelModello, schedeDelModello } from "@/components/orders/generali/schede";
import { SpostaFigliaDialog, type AzioneFiglia } from "@/components/orders/generali/SpostaFigliaDialog";
import { useDatiContratto } from "@/hooks/useGeneraleContratto";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { useQuoteCostiComuni, type QuoteCostiComuni } from "@/hooks/useQuoteCostiComuni";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { useRiepilogoGenerale } from "@/hooks/useCommesseGenerali";
import { useUnitaDalPiano } from "@/hooks/useUnitaDalPiano";
import {
  DEFINIZIONI_MODELLI, avvisiGenerale, formattaEuro, quota, totaliGenerale,
  type FigliaGenerale, type RiepilogoGenerale, type TotaliGenerale,
} from "@/lib/orders/commesseGenerali";
import { SEZIONI_CONTRATTO, fineAggiornata, giorniTra, oggiIso, penaleMaturata, totaliSal, valoreContratto } from "@/lib/orders/generali/contratto";
import { numeriChiave, pianoPerNumeri, type NumeroChiave } from "@/lib/orders/generali/numeriChiave";
import { cantiereInAmbito, cercaNellOperazione } from "@/lib/orders/generali/registroOperazione";
import { cn } from "@/lib/utils";

const euro = (n: number | null) => (n === null ? "—" : formattaEuro(n));
const dataIt = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);
const percento = (n: number | null) => (n === null ? "" : `${Math.round(n)}%`);
const NESSUNA_SIGLA: string[] = [];

export function CommessaGeneraleDettaglio({ generaleId }: { generaleId: string }) {
  const { data: r, isLoading, isError, refetch } = useRiepilogoGenerale(generaleId);
  const costiComuni = useQuoteCostiComuni(r);
  const { quote } = costiComuni;
  const permissions = usePermissions();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [collega, setCollega] = useState(false);
  const [modifica, setModifica] = useState(false);
  const [analisiUnita, setAnalisiUnita] = useState(false);
  const [collegamentiVisibili, setCollegamentiVisibili] = useState(false);
  const [dettaglioLavori, setDettaglioLavori] = useState(false);
  const [cercaFiglie, setCercaFiglie] = useState("");
  const [paginaFiglie, setPaginaFiglie] = useState(1);
  const [righeFiglie, setRigheFiglie] = useState(25);
  const [parametri, setParametri] = useSearchParams();
  const sogliaSchede = useRef<HTMLDivElement>(null);
  const navigazioneSchede = useRef<HTMLDivElement>(null);
  const schedaUrl = parametri.get("scheda");
  useEffect(() => {
    if (!isMobile) return;
    const soglia = sogliaSchede.current;
    const rail = navigazioneSchede.current;
    const area = rail?.closest("main");
    const attiva = rail?.querySelector('[aria-selected="true"]');
    if (rail && attiva) {
      const bordo = rail.getBoundingClientRect();
      const voce = attiva.getBoundingClientRect();
      if (voce.right > bordo.right) rail.scrollLeft += voce.right - bordo.right;
      else if (voce.left < bordo.left) rail.scrollLeft += voce.left - bordo.left;
    }
    if (area && soglia) {
      const bordoSuperiore = area.getBoundingClientRect().top + Number.parseFloat(getComputedStyle(area).paddingTop);
      const distanza = soglia.getBoundingClientRect().top - bordoSuperiore;
      if (distanza < -1) area.scrollTop += distanza;
    }
  }, [isMobile, schedaUrl, isLoading]);
  const puoModificare = !!permissions.canEditOrders && !isMobile;

  const totali = useMemo(() => (r ? totaliGenerale(r) : null), [r]);
  // Un'operazione immobiliare appena nata da un business plan: le unità sono già scritte nelle vendite del piano.
  const senzaUnita = !!r && r.generale.modello !== "appalto" && r.figlie.length === 0;
  const dalPiano = useUnitaDalPiano(generaleId, NESSUNA_SIGLA, puoModificare && senzaUnita && !!r?.permessi.margini);

  if (isLoading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }
  if (isError || !r || !totali) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border p-6">
        <p>Non riesco a leggere questa commessa generale.</p>
        <div className="flex gap-2">
          <Button onClick={() => void refetch()}>Riprova</Button>
          <Button variant="outline" onClick={() => navigate("/azienda/ordini")}>Torna alle commesse</Button>
        </div>
      </div>
    );
  }

  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const immobiliare = r.generale.modello !== "appalto";
  const nomeNuovaFiglia = immobiliare ? def.figlia.nuova : "Nuovo lavoro collegato";
  const avvisi = avvisiGenerale(r, totali).filter(a => a.id !== "vuota");
  // Un'unità divisa non è più un'unità: si contano le sue parti.
  const quanteVive = r.figlie.filter((f) => !f.divisa).length;
  const filtrate = cercaFiglie.trim() ? r.figlie.filter(f => cercaNellOperazione(cercaFiglie, [f.codice, f.nome, f.indirizzo, f.statoNome])) : r.figlie;
  const pagineFiglie = Math.max(1, Math.ceil(filtrate.length / righeFiglie));
  const paginaVisibile = Math.min(pagineFiglie, paginaFiglie);
  const figlieVisibili = filtrate.slice((paginaVisibile - 1) * righeFiglie, paginaVisibile * righeFiglie);
  const urlAmbito = (id: string) => cantiereInAmbito(parametri, id);
  // Il cliente della generale arriva già scelto nella commessa nuova (customer_id è letto da CreateOrder).
  const nuovaFiglia = () => navigate(`/azienda/ordini/nuovo?generale=${generaleId}${r.generale.clienteId ? `&customer_id=${r.generale.clienteId}` : ""}`);
  const schede = schedeDelModello(r.generale.modello, isMobile);
  // Finché non si vende, il lavoro di un'operazione immobiliare sta nel cantiere: il bottone
  // principale porta lì, «nuova unità» va fra le altre azioni (stessa regola della testata).
  const inCostruzione = immobiliare && schede.some((s) => s.id === "cantiere")
    && !r.figlie.some((f) => !f.divisa && !!f.statoVendita && f.statoVendita !== "libera") && (totali.fatturato ?? 0) <= 0 && (totali.incassato ?? 0) <= 0;
  const riquadri = riquadriDelModello(r.generale.modello);
  const propsScheda = { riepilogo: r, totali, puoModificare };
  const iconeSchede = { dati: ClipboardList, unita: Building2, contratto: FileCheck2, piano: ChartNoAxesCombined, cantiere: HardHat, investitori: Landmark, documenti: FolderOpen };
  // La scheda aperta sta nell'indirizzo (?scheda=piano): si può mandare un link e tornare indietro.
  const richiesta = schedaUrl ?? (
    r.generale.modello === "appalto" && (SEZIONI_CONTRATTO as readonly string[]).includes(parametri.get("sezione") ?? "")
      ? "contratto" : null
  );
  const schedaAttiva = schede.some((x) => x.id === richiesta) ? richiesta! : "panoramica";
  const apriScheda = (id: string, vistaCantiere?: "da-seguire" | "cronoprogramma") => {
    const dopo = new URLSearchParams(parametri);
    if (id === "panoramica") {
      dopo.delete("scheda");
      dopo.delete("sezione");
    } else dopo.set("scheda", id);
    if (vistaCantiere) {
      dopo.set("vista-cantiere", vistaCantiere);
      dopo.delete("ambito-cantiere");
      dopo.delete("fase-cantiere");
      dopo.delete("rapportino-cantiere");
    }
    setParametri(dopo, { replace: true });
  };

  const elencoCommesse = (
      <section aria-labelledby="figlie-titolo" className="generale-panel generale-children">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 sm:px-4">
          <h2 id="figlie-titolo" className="flex items-center gap-2 text-base font-semibold">
            <span className="generale-section-icon">{immobiliare ? <Building2 aria-hidden="true" /> : <HardHat aria-hidden="true" />}</span>
            {immobiliare ? r.figlie.length ? def.figlia.tante : "Gestione dell'operazione" : "Lavori collegati"}
            {r.figlie.length > 0 && <span className="generale-count">{quanteVive}</span>}
          </h2>
          {r.figlie.length > 0 && (immobiliare ? (
            <Button size="sm" variant="ghost" aria-pressed={analisiUnita} onClick={() => setAnalisiUnita(v => !v)}>{analisiUnita ? "Torna alle vendite" : "Analisi per unità"}</Button>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => apriScheda("cantiere", "cronoprogramma")}><CalendarRange className="size-4" aria-hidden="true" /> Cronoprogramma</Button>
              {!isMobile && (r.permessi.importi || r.permessi.margini) && (
                <Button size="sm" variant="outline" aria-expanded={dettaglioLavori} onClick={() => setDettaglioLavori(v => !v)}>
                  <ChartNoAxesCombined className="size-4" aria-hidden="true" /> {dettaglioLavori ? "Riduci dettaglio" : "Importi per lavoro"}
                </Button>
              )}
              {puoModificare && <Button size="sm" variant="brand" onClick={nuovaFiglia}><Plus className="size-4" aria-hidden="true" /> {nomeNuovaFiglia}</Button>}
            </div>
          ))}
        </header>
        {r.figlie.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
          <div className="relative min-w-40 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" aria-hidden="true" />
            <Input type="search" aria-label={immobiliare ? "Cerca nelle unità collegate" : "Cerca nei lavori collegati"}
              placeholder="Cerca nome o codice…" className="h-8 pl-8 text-xs" value={cercaFiglie}
              onChange={e => { setCercaFiglie(e.target.value); setPaginaFiglie(1); }} />
          </div>
          {cercaFiglie.trim() && <span role="status" className="text-xs tabular-nums text-muted-foreground">{filtrate.length} di {r.figlie.length}</span>}
        </div>}
        {immobiliare && analisiUnita && <p className="border-b bg-muted/20 px-3 py-2 text-xs text-muted-foreground">La ripartizione dei costi registrati per unità è indicativa. Il margine complessivo è nel piano economico.</p>}
        {r.figlie.length === 0 && dalPiano ? (
          <div className="space-y-3 px-4 py-7 text-center">
            <div>
              <p className="text-sm">Il piano economico elenca <span className="font-medium">{dalPiano.composizione}</span>.</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Creale per seguire disponibilità, acquirenti e incassi. Nomi e prezzi vengono dal piano; prima di confermare li controlli.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="brand" onClick={() => { const p = new URLSearchParams(parametri); p.set("scheda", "unita"); p.set("dal-piano", "1"); setParametri(p, { replace: true }); }}>
                <ListChecks className="mr-1.5 h-3.5 w-3.5" /> Crea le unità dal piano
              </Button>
              {schede.some(s => s.id === "cantiere") && <Button size="sm" variant="outline" onClick={() => apriScheda("cantiere")}><HardHat className="mr-1.5 h-3.5 w-3.5" /> Apri il cantiere generale</Button>}
              <Button size="sm" variant="ghost" onClick={() => setCollega(true)}><Link2 className="mr-1.5 h-3.5 w-3.5" /> Collega commesse esistenti</Button>
            </div>
          </div>
        ) : r.figlie.length === 0 ? (
          <div className="space-y-3 px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">Puoi lavorare direttamente sulla commessa generale. {immobiliare ? "Le unità sono facoltative." : "Gli ordini di lavoro collegati sono facoltativi."}</p>
            {!isMobile && schede.some(s => s.id === "cantiere") && <Button size="sm" onClick={() => apriScheda("cantiere")}><HardHat className="mr-1.5 h-3.5 w-3.5" /> Apri il cantiere generale</Button>}
            {puoModificare && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="outline" onClick={nuovaFiglia}><Plus className="mr-1.5 h-3.5 w-3.5" /> {nomeNuovaFiglia}</Button>
                <Button size="sm" variant="outline" onClick={() => setCollega(true)}><Link2 className="mr-1.5 h-3.5 w-3.5" /> Collega commesse esistenti</Button>
              </div>
            )}
          </div>
        ) : !figlieVisibili.length ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">Nessun risultato per questa ricerca.</p>
        ) : isMobile ? (
          <ul className="divide-y">
            {figlieVisibili.map((f) => <FigliaCard key={f.id} f={f} permessi={r.permessi} commerciale={immobiliare} />)}
          </ul>
        ) : (
          <TabellaFiglie r={r} t={totali} figlie={figlieVisibili} urlAmbito={urlAmbito} puoModificare={puoModificare}
            quote={quote} costiInAttesa={costiComuni.inAttesa} analisi={!immobiliare || analisiUnita} compatta={!immobiliare && !dettaglioLavori} />
        )}
        {filtrate.length > 25 && <div className="border-t px-3 pb-3 sm:px-4">
          <TablePagination currentPage={paginaVisibile} totalPages={pagineFiglie} totalItems={filtrate.length} pageSize={righeFiglie}
            onPageChange={setPaginaFiglie} onPageSizeChange={n => { setRigheFiglie(n); setPaginaFiglie(1); }} />
        </div>}
      </section>
  );

  const riquadro = (id: string) => {
    const Riquadro = riquadri.find(scheda => scheda.id === id)?.Riquadro;
    return Riquadro ? <Riquadro {...propsScheda} /> : null;
  };
  const apriAvviso = (id: string) => {
    if (id === "titolo") return () => apriScheda("dati");
    if ((id === "oltre" || id === "perdita") && immobiliare) return () => apriScheda("unita");
    return undefined;
  };
  const etichettaAvviso: Record<string, string> = { titolo: "Apri i dati", oltre: "Apri le vendite", perdita: "Apri le unità" };

  const panoramica = (
    <>
      <section className="generale-priorita-panoramica generale-panel" aria-labelledby="generale-da-seguire">
        <h2 id="generale-da-seguire" className="flex items-center gap-2 border-b bg-muted/25 px-3 py-2 text-sm font-semibold sm:px-4">
          <ListChecks className="size-4 text-primary" aria-hidden="true" /> Da seguire
        </h2>
        <ul className="generale-priorita-panoramica-lista">
          {avvisi.filter(a => a.tono === "attenzione").map(a => {
            const azione = apriAvviso(a.id);
            return <li key={a.id} className="generale-priorita-avviso">
              <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span className="min-w-0 flex-1">{a.testo}</span>
              {azione && <button type="button" className="generale-text-link" onClick={azione}>{etichettaAvviso[a.id]}</button>}
            </li>;
          })}
          <li>{riquadro("documenti")}</li>
          <li><AvvisiPiano riepilogo={r} dalPiano={dalPiano} puoModificare={puoModificare} /></li>
          {puoModificare && <>
            <li><PerPartire riepilogo={r} nuovaFiglia={nuovaFiglia} /></li>
            <li><PerLavorare riepilogo={r} /></li>
          </>}
          {avvisi.filter(a => a.tono === "info").map(a => (
            <li key={a.id} className="generale-priorita-avviso">
              <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">{a.testo}</span>
              {a.id === "valore" && puoModificare && <button type="button" className="generale-text-link" onClick={() => setModifica(true)}>Modifica commessa</button>}
            </li>
          ))}
        </ul>
      </section>

      {immobiliare && schede.some(s => s.id === "cantiere") && <RiquadroCantiereOperazione riepilogo={r} puoModificare={puoModificare} />}
      {schede.some(s => s.id === "documenti") && <ArchivioDocumentiPanoramica {...propsScheda} />}
      {immobiliare && r.figlie.length > 0 ? (
        <>
          {riquadro("unita")}
          {puoModificare && (
            <details className="generale-panel generale-panoramica-dettagli" open={collegamentiVisibili}
              onToggle={event => setCollegamentiVisibili(event.currentTarget.open)}>
              <summary>Gestisci i collegamenti delle unità</summary>
              {collegamentiVisibili && elencoCommesse}
            </details>
          )}
        </>
      ) : elencoCommesse}

      {riquadro("contratto")}
      <FattureOperazione riepilogo={r} />

      {(r.permessi.costi || r.permessi.importi || r.permessi.margini) && (
        <details className="generale-panel generale-panoramica-dettagli">
          <summary>Andamento e analisi economica</summary>
          <div className="space-y-3 p-3">
            {(r.permessi.costi || r.permessi.importi) && <GraficoSpesa riepilogo={r} />}
            {r.permessi.costi && r.permessi.margini && <ComposizioneCosti riepilogo={r} />}
            <div className="grid gap-3 lg:grid-cols-2">
              {riquadro("piano")}
              {riquadro("investitori")}
            </div>
          </div>
        </details>
      )}
    </>
  );

  return (
    <div className="commessa-workspace generale-design space-y-3">
      {/* Testata */}
      <header className="generale-page-heading commessa-page-heading">
        <Link to="/azienda/ordini" className="generale-back-link inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Commesse
        </Link>
        <div className="generale-title-row">
          <div className="generale-title-copy">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="generale-type-badge font-normal">{!isMobile && "Commessa generale · "}{def.nome}</Badge>
              {r.generale.codice && <span className="text-xs text-muted-foreground">{r.generale.codice}</span>}
              <span className="generale-title-meta">
                {r.generale.cliente ? `${def.cliente.etichetta}: ${r.generale.cliente} · ` : ""}
                {immobiliare
                  ? `${quanteVive} ${quanteVive === 1 ? def.figlia.una : def.figlia.tante.toLowerCase()}`
                  : `${quanteVive} ${quanteVive === 1 ? "lavoro collegato" : "lavori collegati"}`}
              </span>
            </div>
            <h1 className="generale-page-title">{r.generale.nome}</h1>
          </div>
          <div className="generale-page-actions commessa-page-actions">
            <BottoneRendiconto riepilogo={r} />
            {puoModificare && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" aria-label="Altre azioni della commessa">
                      <MoreHorizontal aria-hidden="true" /> Altre azioni
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setModifica(true)}><Pencil aria-hidden="true" /> Modifica commessa</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setCollega(true)}><Link2 aria-hidden="true" /> Collega commesse</DropdownMenuItem>
                    {(!immobiliare || inCostruzione) && <DropdownMenuItem onSelect={nuovaFiglia}><Plus aria-hidden="true" /> {nomeNuovaFiglia}</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
                {immobiliare && (inCostruzione ? (
                  <Button variant="brand" size="sm" onClick={() => apriScheda("cantiere")}>
                    <HardHat className="mr-1.5 h-3.5 w-3.5" /> Apri il cantiere
                  </Button>
                ) : (
                  <Button variant="brand" size="sm" onClick={nuovaFiglia}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> {nomeNuovaFiglia}
                  </Button>
                ))}
              </>
            )}
          </div>
        </div>
      </header>

      <QuadroGenerale key={generaleId} inPanoramica={schedaAttiva === "panoramica"} telefono={isMobile}
        r={r} t={totali} costiComuni={costiComuni} puoModificare={puoModificare} />

      {schede.length === 0 ? panoramica : (
        <Tabs value={schedaAttiva} onValueChange={apriScheda}>
          <div ref={sogliaSchede} className="generale-nav-soglia" aria-hidden="true" />
          <div className="generale-nav-schede">
            <TabsList ref={navigazioneSchede} aria-label="Schede della commessa" className="generale-tabs commessa-main-tabs h-auto max-w-full flex-wrap justify-start">
              <TabsTrigger value="panoramica"><LayoutDashboard aria-hidden="true" />Panoramica</TabsTrigger>
              {schede.map((x) => { const Icona = iconeSchede[x.id]; return <TabsTrigger key={x.id} value={x.id} aria-label={x.titolo}>
                <Icona aria-hidden="true" />{isMobile && x.id === "unita" ? "Unità" : isMobile && x.id === "piano" ? "Piano" : x.titolo}
              </TabsTrigger>; })}
            </TabsList>
          </div>
          <TabsContent value="panoramica" className="mt-2.5 space-y-3">{panoramica}</TabsContent>
          {schede.map((x) => (
            <TabsContent key={x.id} value={x.id} className="mt-2.5">
              <x.Scheda {...propsScheda} />
            </TabsContent>
          ))}
        </Tabs>
      )}

      {puoModificare && (
        <>
          <CollegaCommesseDialog open={collega} onOpenChange={setCollega} riepilogo={r} />
          <ModificaGeneraleDialog open={modifica} onOpenChange={setModifica} riepilogo={r} />
        </>
      )}
    </div>
  );
}

function Numero({ etichetta, valore, nota, tono, tipo = "valore" }: { etichetta: string; valore: string; nota?: string; tono?: "rosso" | "verde"; tipo?: "valore" | "incasso" | "capitale" | "margine" | "avanzamento" | "fatturato" }) {
  const Icona = { valore: CircleDollarSign, incasso: Banknote, capitale: Wallet, margine: TrendingUp, avanzamento: HardHat, fatturato: FileCheck2 }[tipo];
  return (
    <div className={cn("generale-kpi", `generale-kpi--${tipo}`, tono === "verde" && "generale-kpi--positive", tono === "rosso" && "generale-kpi--negative")}>
      <p className="generale-kpi-label"><Icona aria-hidden="true" />{etichetta}</p>
      <p className={cn("generale-kpi-value tabular-nums", tono === "rosso" && "generale-negative", tono === "verde" && "generale-positive")}>{valore}</p>
      {nota && <p className="generale-kpi-note">{nota}</p>}
    </div>
  );
}

/**
 * In Panoramica i numeri sono completi. Nelle schede operative si parte dal riepilogo.
 */
function QuadroGenerale({ r, t, costiComuni, puoModificare, inPanoramica, telefono }: {
  r: RiepilogoGenerale; t: TotaliGenerale; inPanoramica: boolean; telefono: boolean;
  costiComuni: ReturnType<typeof useQuoteCostiComuni>; puoModificare: boolean;
}) {
  const { quote, inAttesa: costiInAttesa } = costiComuni;
  const [apertoInPanoramica, setApertoInPanoramica] = useState<boolean | null>(null);
  const [apertoNelleSchede, setApertoNelleSchede] = useState(false);
  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const appalto = r.generale.modello === "appalto";
  // Un'operazione immobiliare che non ha ancora venduto né fatturato sta costruendo: la testata
  // parla di spesa contro budget, non di «da incassare 0 €» e barre di vendita vuote (14/11/2026).
  const inVendita = r.figlie.some((f) => !f.divisa && !!f.statoVendita && f.statoVendita !== "libera") || (t.fatturato ?? 0) > 0 || (t.incassato ?? 0) > 0;
  const costruzione = !appalto && !inVendita;
  const mostraDettaglio = r.permessi.importi || r.permessi.margini || (costruzione && r.permessi.costi);
  const compatto = telefono && !inPanoramica;
  const aperto = inPanoramica ? apertoInPanoramica ?? !telefono : apertoNelleSchede;
  const dettagliAperti = mostraDettaglio && aperto;
  const alterna = () => {
    if (inPanoramica) setApertoInPanoramica(!aperto);
    else setApertoNelleSchede(!aperto);
  };
  const n = useGeneralePianoNumeri(r, { enabled: dettagliAperti || !appalto });
  const piano = pianoPerNumeri(n.piano);
  // Il SAL è del contratto: senza il valore del contratto non c'è né la riga né il residuo.
  const contratto = useDatiContratto(r.generale.id, appalto && dettagliAperti && r.permessi.importi);
  const aSal = contratto.data && valoreContratto(contratto.data.contratto, contratto.data.atti) ? totaliSal(contratto.data.sal).aSal : null;
  const numeri = numeriChiave(r.generale.modello, t, piano, { costiComuni: quote?.totale ?? 0, aSal });
  const di = (id: NumeroChiave["id"]) => numeri.find((x) => x.id === id)?.valore ?? null;
  // Senza un costo registrato il margine sarebbe tutto il ricavo: un numero verde che non dice niente.
  const senzaCosti = !piano && r.permessi.margini && (t.costo ?? 0) === 0 && (quote?.totale ?? 0) === 0;
  const margine = (!piano && !quote) || senzaCosti ? null : di("margine");
  const budget = r.permessi.costi && n.piano ? n.piano.confronto.totali.costi.previsto : null;
  const spesoReale = n.piano?.confronto.totali.costi.reale ?? (quote ? (t.costo ?? 0) + quote.totale : null);
  const speso = r.permessi.costi ? spesoReale : null;
  const budgetCompleto = n.piano?.budgetCompleto !== false;
  const budgetInBozza = n.inVista?.stato === "bozza";
  const conCapitale = numeri.some((x) => x.id === "capitale") && r.permessi.margini && n.piano?.calendarioCompleto !== false;
  // Appalto: quanto manca alla fine contrattuale (con le proroghe) e la penale se si è in ritardo (T3, 14/11/2026).
  const oggi = oggiIso();
  const fineContratto = appalto && contratto.data ? fineAggiornata(contratto.data.contratto, contratto.data.atti).data : null;
  const ultimati = appalto ? contratto.data?.contratto?.dataUltimazione ?? null : null;
  const penale = appalto && contratto.data ? penaleMaturata(contratto.data.contratto, contratto.data.atti, oggi) : null;
  const giorniAllaFine = fineContratto && !ultimati ? giorniTra(oggi, fineContratto) : null;

  // ── Previsionale e reale, col €/m² (16/11/2026) ──────────────────────────
  // I metri quadri: la somma delle unità (si aggiorna da sola), se no quelli scritti a mano
  // nella scheda Dati, se no la superficie dell'immobile comprato.
  const unita = useUnitaGenerale(aperto && !appalto && r.permessi.importi ? r.generale.id : undefined);
  // «Lavori fatti»: dalle fasi di cantiere, non da `percentuale_avanzamento` delle figlie — su
  // un'operazione immobiliare le figlie sono le unità in vendita, e lì quella percentuale è
  // zero per tutti (16/11/2026).
  const lavori = useAvanzamentoCantiere(r.generale.id, r.figlie.map((f) => f.id), !appalto);
  const superficie = superficieOperazione({
    unitaMq: unita.data?.unita?.map((u) => u.mq),
    mqVendibili: r.generale.dati?.area?.mq_vendibili,
    immobileMq: r.generale.dati?.immobile?.mq,
  });
  const confermate = r.figlie.filter(f => !f.divisa && statoVenditaConfermato(f.statoVendita));
  const daFatture = appalto || (confermate.length === 0 && (t.fatturato ?? 0) > 0);
  const nomeVendite = daFatture ? "Fatturato" : "Vendite confermate";
  const venduto = !r.permessi.importi ? null : daFatture
    ? t.fatturato
    : confermate.reduce((somma, f) => somma + (f.importo ?? 0), 0);
  // Una caparra di prenotazione può essere incassata, ma il saldo entra tra i crediti al preliminare.
  const daIncassare = appalto ? t.daIncassare : totaliGenerale({
    ...r,
    figlie: r.figlie.filter(f => !f.divisa).map(f => f.statoVendita === "prenotata" ? { ...f, residuoUnita: 0 } : f),
  }).daIncassare;
  const numeriPrevReale = numeriOperazione({
    venditaPrevista: r.permessi.importi ? r.generale.valore ?? t.assegnato : null,
    costiPrevisti: budget,
    venduto,
    speso,
    superficie,
  });
  // Il quadro si mostra quando c'è qualcosa da confrontare: commesse dentro, un budget nel piano
  // o qualcosa di speso. Su una generale appena nata vale di più il prossimo passo di una
  // tabella di trattini. Serve comunque almeno una colonna piena.
  const conPrevReale = r.permessi.importi
    && (r.figlie.length > 0 || budget !== null || (speso ?? 0) > 0)
    && (numeriPrevReale.previsionale.vendita !== null || numeriPrevReale.previsionale.costi !== null
      || numeriPrevReale.reale.vendita !== null || numeriPrevReale.reale.costi !== null);

  const righe = [
    ...(appalto || r.figlie.length ? [{ etichetta: appalto ? "Assegnato" : "Prezzi delle unità", valore: t.assegnato, tono: "bg-blue-300" }] : []),
    ...(appalto ? [{ etichetta: "Eseguito", valore: t.eseguito, tono: "bg-sky-400" }] : []),
    ...(appalto && aSal !== null ? [{ etichetta: "A SAL", valore: aSal, tono: "bg-orange-400" }] : []),
    { etichetta: "Fatturato", valore: t.fatturato, tono: "bg-blue-400" },
    { etichetta: "Incassato", valore: t.incassato, tono: "bg-emerald-400" },
  ];
  // In costruzione lo speso si legge contro il budget E contro i lavori fatti
  // (SpesaControLavori, 16/11/2026): le due barre di prima dicevano il budget — sempre al
  // 100%, è la base — e il resto da spendere.
  const conBudget = costruzione && speso !== null && budget !== null && budget > 0;
  // Compravendita: la catena acquisto → lavori → rivendita sulla stessa base (T4, 14/11/2026).
  const prezzoDati = r.generale.dati?.immobile?.prezzo;
  const prezzoAcquisto = typeof prezzoDati === "number" ? prezzoDati
    : n.piano ? n.piano.confronto.costi.filter((x) => x.categoria === "terreno").reduce((s, x) => s + x.previsto, 0) || null : null;
  const rivendita = r.generale.valore ?? t.assegnato;
  const catena = r.generale.modello === "compravendita" && costruzione && r.permessi.importi && r.permessi.costi
    && prezzoAcquisto !== null && prezzoAcquisto > 0 && rivendita !== null && rivendita > 0;
  const righeCatena = catena ? [
    { etichetta: "Acquisto", valore: prezzoAcquisto, tono: "bg-slate-400" },
    ...(budget !== null && budget > prezzoAcquisto! ? [{ etichetta: budgetCompleto ? "Lavori e spese" : "Lavori e spese (stime da completare)", valore: budget - prezzoAcquisto!, tono: "bg-orange-400" }] : []),
    { etichetta: "Rivendita", valore: rivendita, tono: "bg-emerald-400" },
  ] : [];
  const barre = catena ? righeCatena : costruzione ? [] : righe;
  const baseBarre = catena ? rivendita : costruzione ? budget : t.base;
  const colonne = barre.length === 5 ? "lg:grid-cols-5" : barre.length === 3 ? "lg:grid-cols-3" : barre.length === 2 ? "lg:grid-cols-2" : barre.length === 1 ? "lg:grid-cols-1" : "lg:grid-cols-4";
  const nomeValore = appalto && r.generale.valore === null ? "Importo dei lavori collegati" : def.valore.etichetta;
  const notaValore = r.generale.valore === null ? (appalto ? "Valore del contratto principale non indicato" : `somma delle ${def.figlia.tante.toLowerCase()}`) : undefined;

  const avanzamento = appalto ? t.avanzamento : lavori.percento;

  return (
    <section aria-labelledby="generale-numeri-titolo" className="generale-hero">
      <header className="generale-hero-heading">
        <div className="flex-wrap"><span className="generale-hero-icon"><LayoutDashboard aria-hidden="true" /></span><h2 id="generale-numeri-titolo">La commessa in numeri</h2>{budgetInBozza && <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-xs">Piano in bozza</span>}</div>
        {(mostraDettaglio || compatto) && <button type="button" className="generale-kpi-toggle"
          aria-label={aperto ? "Riduci i numeri" : compatto ? "Mostra i numeri" : "Dettaglio dei numeri"} aria-expanded={aperto}
          aria-controls={compatto ? "generale-numeri-sintesi generale-numeri-dettaglio" : "generale-numeri-indicatori generale-numeri-dettaglio"}
          onClick={alterna}>
          <span>{aperto ? "Riduci" : compatto ? "Mostra" : "Dettaglio"}<span className="generale-kpi-toggle-suffisso"> {aperto || compatto ? "i numeri" : "dei numeri"}</span></span><ChevronDown className={cn("size-3.5", aperto && "rotate-180")} aria-hidden="true" />
        </button>}
      </header>
      <div id="generale-numeri-sintesi" className={cn("generale-kpi-grid", compatto && !aperto && "!hidden")}>
        {r.permessi.importi
          ? <Numero etichetta={nomeValore} valore={euro(r.generale.valore ?? t.assegnato)} nota={notaValore} />
          : <Numero etichetta={def.figlia.tante} valore={String(t.figlie)} />}
        <Numero tipo="avanzamento" etichetta="Avanzamento" valore={avanzamento === null ? "—" : percento(avanzamento)} nota={avanzamento === null ? "Dalle fasi di cantiere" : undefined} />
        {costruzione ? (
          <>
            {r.permessi.costi && <Numero tipo="capitale" etichetta="Speso finora" valore={euro(speso)}
              nota={budget !== null && budget > 0 ? `su ${euro(budget)} ${budgetInBozza ? "di costi in bozza" : "di budget"}${budgetCompleto ? "" : " · stime da completare"}` : undefined} />}
            {r.permessi.importi && conCapitale && <Numero tipo="capitale" etichetta="Fabbisogno stimato" valore={euro(di("capitale"))} nota="picco di capitale previsto" />}
          </>
        ) : r.permessi.importi && (
          <>
            <Numero tipo="fatturato" etichetta={nomeVendite} valore={euro(venduto)}
              nota={t.incassato !== null ? `Incassato ${euro(t.incassato)}` : undefined} />
            <Numero tipo="incasso" etichetta="Da incassare" valore={euro(daIncassare)} />
          </>
        )}
        <div id="generale-numeri-indicatori" className="generale-kpi-extra" hidden={!dettagliAperti}>
          {dettagliAperti && <>
            {r.permessi.importi && <>
              {numeri.some((x) => x.id === "residuo") && <Numero etichetta="Residuo del contratto" valore={euro(di("residuo"))} nota="non ancora a SAL" />}
              {appalto && ultimati && <Numero etichetta="Fine lavori" valore="Ultimati" nota={`il ${dataIt(ultimati)}${penale ? ` · penale ${euro(penale.importo)}` : ""}`} tono={penale ? "rosso" : undefined} />}
              {appalto && !ultimati && giorniAllaFine !== null && (
                <Numero
                  etichetta="Fine lavori"
                  valore={giorniAllaFine >= 0 ? `tra ${giorniAllaFine} ${giorniAllaFine === 1 ? "giorno" : "giorni"}` : `${-giorniAllaFine} giorni di ritardo`}
                  tono={giorniAllaFine < 0 ? "rosso" : undefined}
                  nota={giorniAllaFine >= 0 ? `scadenza contrattuale ${dataIt(fineContratto!)}` : penale ? `penale maturata ${euro(penale.importo)}${penale.alTetto ? " (al tetto)" : ""}` : `scadenza ${dataIt(fineContratto!)}, penale non indicata`}
                />
              )}
              {!costruzione && numeri.some((x) => x.id === "capitale") && r.permessi.margini && <Numero tipo="capitale" etichetta="Fabbisogno stimato" valore={euro(di("capitale"))} nota={n.piano?.calendarioCompleto === false ? (n.voci.some((v) => v.importo > 0 && !v.mese) ? "completa il calendario del piano" : "completa le stime del piano") : "picco di capitale previsto"} />}
              {numeri.some((x) => x.id === "assegnare") && (
                <Numero
                  etichetta="Da assegnare"
                  valore={euro(t.daAssegnare)}
                  tono={t.daAssegnare !== null && t.daAssegnare < 0 ? "rosso" : undefined}
                  nota={t.daAssegnare === null ? "manca il valore" : undefined}
                />
              )}
            </>}
            {r.permessi.margini && (
              <Numero
                tipo="margine"
                etichetta={piano ? "Margine a finire" : "Margine dell'operazione"}
                valore={euro(margine)}
                tono={margine !== null && margine < 0 ? "rosso" : margine !== null && margine > 0 ? "verde" : undefined}
                nota={!piano && !quote
                  ? (costiInAttesa ? "costi comuni in caricamento" : "costi comuni non disponibili")
                  : senzaCosti
                  ? "nessun costo registrato"
                  : piano
                    ? budgetInBozza ? "stima dal piano in bozza" : "stima dal piano economico"
                    : quote
                      ? (quote.totale > 0 ? `${def.figlia.tante.toLowerCase()} ${euro(t.margine)} − costi comuni ${euro(quote.totale)}` : "ricavi meno costi registrati")
                      : undefined}
              />
            )}
          </>}
        </div>
      </div>
      <div id="generale-numeri-dettaglio" hidden={!dettagliAperti}>
        {dettagliAperti && <>
          {costiComuni.errore && (
            <div role="alert" className="generale-kpi-avviso">
              <p>Costi comuni non disponibili. Il margine complessivo è in attesa di aggiornamento.</p>
              <button type="button" className="generale-kpi-toggle" disabled={costiComuni.ricarica} onClick={() => void costiComuni.riprova()}>Riprova</button>
            </div>
          )}

          {conPrevReale && (
            <QuadroPrevisionale
              n={numeriPrevReale}
              etichettaVendita={nomeVendite}
              incassato={t.incassato}
              budgetParziale={!budgetCompleto} budgetInBozza={budgetInBozza}
              notaCostiPrevisti={r.permessi.costi ? "il piano non ha ancora un budget" : "costi non visibili"}
              appalto={appalto}
              superficieAMano={puoModificare ? { generaleId: r.generale.id, area: r.generale.dati?.area } : undefined}
            />
          )}

          {/* In costruzione: speso contro lavori fatti, non due barre di cui una sempre al 100%. */}
          {/* La compravendita tiene la sua catena acquisto → lavori → rivendita. */}
          {conBudget && !catena ? (
            <SpesaControLavori speso={speso!} budget={budget!} avanzamento={lavori.percento} fasi={lavori.fasi} budgetParziale={!budgetCompleto} budgetInBozza={budgetInBozza} />
          ) : r.permessi.importi && barre.length > 0 && (
            <div className="generale-hero-progress">
              <dl className={cn("space-y-1 lg:grid lg:gap-4 lg:space-y-0", colonne)}>
                {barre.map((riga) => {
                  const q = quota(riga.valore, baseBarre);
                  return (
                    <div key={riga.etichetta} className="grid min-w-0 grid-cols-[6.5rem_1fr] items-center gap-2 text-xs lg:flex lg:flex-col lg:items-stretch lg:gap-0.5">
                      <dt className="generale-progress-label lg:order-1">{riga.etichetta}</dt>
                      <dd className="text-right tabular-nums lg:order-2 lg:flex lg:items-baseline lg:justify-between lg:text-left">
                        <span className="font-medium">{euro(riga.valore)}</span> <span className="generale-progress-percent">{percento(q)}</span>
                      </dd>
                      {/* Da telefono bastano i numeri: la riga resta densa. */}
                      <div className="generale-progress-track h-1.5 overflow-hidden rounded-full max-lg:hidden lg:order-3" aria-hidden="true">
                        <div className={cn("h-full rounded-full", riga.tono)} style={{ width: `${q ?? 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </dl>
              <div className="generale-hero-note flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px]">
                <span>Importi al netto dell'IVA.</span>
                {!appalto && !costruzione && t.daAssegnare !== null && r.figlie.length > 0 && (
                  <span>Differenza ricavi previsti / prezzi unità: {euro(t.daAssegnare)}</span>
                )}
              </div>
            </div>
          )}
        </>}
      </div>
    </section>
  );
}

function Stato({ f }: { f: FigliaGenerale }) {
  if (!f.statoNome) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: f.statoColore ?? "hsl(var(--muted-foreground))" }} aria-hidden="true" />
      <span className="truncate">{f.statoNome}</span>
    </span>
  );
}

function Avanzamento({ valore, fasi, aMisura }: { valore: number; fasi?: number | null; aMisura?: boolean }) {
  // A misura, la barra è il misurato (quello che si fattura); le fasi si dicono accanto se diverse.
  const diverse = aMisura && fasi != null && Math.abs(fasi - valore) >= 5;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary" style={{ width: `${valore}%` }} />
        </div>
        <span className="tabular-nums text-xs">{Math.round(valore)}%{aMisura && <span className="text-muted-foreground"> misurato</span>}</span>
      </div>
      {diverse && <span className="text-[11px] text-amber-700" title="Le fasi del cantiere dicono un avanzamento diverso dalle misure contabilizzate">fasi in cantiere {Math.round(fasi!)}%</span>}
    </div>
  );
}

function TabellaFiglie({ r, t, figlie, urlAmbito, puoModificare, quote, costiInAttesa, analisi, compatta }: {
  r: RiepilogoGenerale; t: TotaliGenerale; figlie: FigliaGenerale[]; urlAmbito: (id: string) => string;
  puoModificare: boolean; quote: QuoteCostiComuni | null; costiInAttesa: boolean; analisi: boolean; compatta: boolean;
}) {
  // Il margine di ogni commessa è «pieno»: meno la sua quota dei costi comuni, se ce ne sono.
  const conQuote = !!quote && quote.totale > 0;
  const pieno = (f: FigliaGenerale) => (!quote || f.margine === null ? null : f.margine - (quote.perFiglia.get(f.id)?.importo ?? 0));
  const statoMargine = costiInAttesa ? "In caricamento" : "Non disponibile";
  const [azione, setAzione] = useState<{ figlia: FigliaGenerale; tipo: AzioneFiglia } | null>(null);
  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const importi = !compatta && r.permessi.importi;
  const margini = !compatta && analisi && r.permessi.margini;
  return (
    <div className="overflow-x-auto">
      {azione && (
        <SpostaFigliaDialog riepilogo={r} totali={t} figlia={azione.figlia} azione={azione.tipo} onClose={() => setAzione(null)} />
      )}
      <table className={cn("w-full text-sm", compatta && "generale-lavori-compatti")}>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">{r.generale.modello === "appalto" ? "Commessa" : def.figlia.tante}</th>
            <th className="px-2 py-2 font-medium">{analisi ? "Stato" : "Stato vendita"}</th>
            {analisi && <th className="px-2 py-2 font-medium">Avanzamento</th>}
            {importi && <th className="px-2 py-2 text-right font-medium">Importo</th>}
            {importi && analisi && <th className="px-2 py-2 text-right font-medium">Eseguito</th>}
            {importi && <th className="px-2 py-2 text-right font-medium">Fatturato</th>}
            {importi && <th className="px-2 py-2 text-right font-medium">Incassato</th>}
            {margini && <th className="px-2 py-2 text-right font-medium" title={`Ricavi meno i costi registrati finora${conQuote ? `. ${quote!.motivo}` : ""}`}>Margine a oggi</th>}
            {puoModificare && <th className="w-10 px-2 py-2"><span className="sr-only">Azioni</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {figlie.map((f) => (
            <tr key={f.id} className="hover:bg-muted/40">
              <td className="max-w-[22rem] px-4 py-2">
                <Link to={`/azienda/ordini/${f.id}`} className={cn("block min-w-0 hover:underline", compatta && "generale-link-lavoro")}>
                  <span className="font-medium">{f.nome}</span>
                  {f.codice && <span className="ml-1 text-xs text-muted-foreground">{f.codice}</span>}
                  {compatta && <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />}
                </Link>
                {f.indirizzo && <p className="truncate text-xs text-muted-foreground">{f.indirizzo}</p>}
                <Link to={urlAmbito(f.id)} aria-label={`Cantiere di ${f.nome}`}
                  className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <HardHat className="size-3" aria-hidden="true" /> Cantiere
                </Link>
              </td>
              <td className="max-w-[10rem] px-2 py-2 text-xs">{analisi ? <Stato f={f} /> : <StatoCommerciale stato={f.statoVendita} />}</td>
              {analisi && <td className="px-2 py-2"><Avanzamento valore={f.avanzamento} fasi={f.avanzamentoFasi} aMisura={f.aMisura} /></td>}
              {importi && <td className="px-2 py-2 text-right tabular-nums">{euro(f.importo)}</td>}
              {importi && analisi && <td className="px-2 py-2 text-right tabular-nums">{euro(f.eseguito)}</td>}
              {importi && <td className="px-2 py-2 text-right tabular-nums">{euro(f.fatturato)}</td>}
              {importi && <td className="px-2 py-2 text-right tabular-nums">{euro(f.incassato)}</td>}
              {margini && (
                <td
                  className={cn("px-2 py-2 text-right tabular-nums", (pieno(f) ?? 0) < 0 && "text-destructive")}
                  title={conQuote && f.margine !== null ? `Margine diretto ${euro(f.margine)} − quota costi comuni ${euro(quote!.perFiglia.get(f.id)?.importo ?? 0)}` : undefined}
                >
                  {/* Senza costi registrati il margine sarebbe tutto il ricavo: meglio dirlo. */}
                  {!quote
                    ? <span className="text-xs text-muted-foreground">{statoMargine}</span>
                    : f.costo === 0 && !conQuote ? <span className="text-xs text-muted-foreground">costi da registrare</span> : euro(pieno(f))}
                  {conQuote && f.margine !== null && !f.divisa && (
                    <span className="block text-[11px] text-muted-foreground">quota comuni −{euro(quote!.perFiglia.get(f.id)?.importo ?? 0)}</span>
                  )}
                </td>
              )}
              {puoModificare && (
                <td className="px-2 py-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Azioni per ${f.codice ?? f.nome}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild><Link to={`/azienda/ordini/${f.id}`}>Apri</Link></DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setAzione({ figlia: f, tipo: "sposta" })}>
                        <ArrowRightLeft className="mr-2 h-4 w-4" /> Sposta in un'altra generale
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setAzione({ figlia: f, tipo: "togli" })}>
                        <Unlink className="mr-2 h-4 w-4" /> Togli da questa generale
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {!compatta && r.figlie.length > 1 && (
          <tfoot>
            <tr className="border-t bg-muted/30 text-sm font-medium">
              <td className="px-4 py-2">{figlie.length < r.figlie.length ? "Totale dell’operazione" : "Totale"}</td>
              <td className="px-2 py-2" />
              {analisi && <td className="px-2 py-2"><Avanzamento valore={t.avanzamento} /></td>}
              {importi && <td className="px-2 py-2 text-right tabular-nums">{euro(t.assegnato)}</td>}
              {importi && analisi && <td className="px-2 py-2 text-right tabular-nums">{euro(t.eseguito)}</td>}
              {importi && <td className="px-2 py-2 text-right tabular-nums">{euro(t.fatturato)}</td>}
              {importi && <td className="px-2 py-2 text-right tabular-nums">{euro(t.incassato)}</td>}
              {margini && (() => {
                if (!quote) return <td className="px-2 py-2 text-right text-xs font-normal text-muted-foreground">{statoMargine}</td>;
                const totale = t.margine !== null && conQuote ? t.margine - quote!.totale : t.margine;
                if (t.costo === 0 && !conQuote) return <td className="px-2 py-2 text-right text-xs font-normal text-muted-foreground">—</td>;
                return <td className={cn("px-2 py-2 text-right tabular-nums", totale !== null && totale < 0 && "text-destructive")}>{euro(totale)}</td>;
              })()}
              {puoModificare && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function StatoCommerciale({ stato }: { stato?: string | null }) {
  const nomi: Record<string, string> = { libera: "Libera", prenotata: "Prenotata", compromesso: "Compromesso", rogitata: "Rogitata", divisa: "Divisa" };
  const stile = STATI_VENDITA.includes(stato as StatoVendita) ? STILE_STATO[stato as StatoVendita] : null;
  return <span className={cn("generale-sale-badge", stile?.casella ?? "bg-muted text-muted-foreground")}><span className={cn("h-1.5 w-1.5 rounded-full", stile?.punto ?? "bg-muted-foreground")} aria-hidden="true" />{stato ? nomi[stato] ?? "Da verificare" : "Da definire"}</span>;
}

/** Da telefono: una riga per commessa, con i due numeri che servono. */
function FigliaCard({ f, permessi, commerciale = false }: { f: FigliaGenerale; permessi: RiepilogoGenerale["permessi"]; commerciale?: boolean }) {
  return (
    <li>
      <Link to={`/azienda/ordini/${f.id}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-muted/60">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{f.nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[f.codice, commerciale ? null : f.statoNome].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {commerciale && permessi.importi && <p className="text-sm tabular-nums">{euro(f.importo)}</p>}
          {commerciale ? <StatoCommerciale stato={f.statoVendita} /> : <p className="text-xs tabular-nums text-muted-foreground">{Math.round(f.avanzamento)}%</p>}
        </div>
        {!commerciale && <ArrowUpRight className="size-3.5 shrink-0 text-primary" aria-hidden="true" />}
      </Link>
    </li>
  );
}
