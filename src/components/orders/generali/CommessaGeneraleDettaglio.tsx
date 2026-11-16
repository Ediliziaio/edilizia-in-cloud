import "../commessa-workspace.css";
// src/components/orders/generali/CommessaGeneraleDettaglio.tsx
// La pagina di una commessa generale: la regia. In alto quanto del valore è assegnato,
// eseguito, fatturato e incassato; sotto le commesse che contiene. Le commesse dentro
// restano commesse normali: si aprono e si lavorano come sempre.
// Da telefono si legge soltanto: creare, collegare e modificare si fa da tablet o computer.
// I moduli (contratto, piano economico, unità, investitori, documenti) aggiungono le loro
// schede accanto a «Panoramica», solo quando sono pronti e accesi dal modello (schede.tsx).
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRightLeft, Banknote, Building2, ChartNoAxesCombined, ClipboardList, CircleDollarSign, FileCheck2, FolderOpen, HardHat, Info, Landmark, LayoutDashboard, Link2, ListChecks, MoreHorizontal, Pencil, Plus, TrendingUp, Unlink, Wallet } from "lucide-react";
import { ComposizioneCosti } from "@/components/orders/generali/design/ComposizioneCosti";
import { GraficoSpesa } from "@/components/orders/generali/design/GraficoSpesa";
import { QuadroPrevisionale } from "@/components/orders/generali/design/QuadroPrevisionale";
import { SpesaControLavori } from "@/components/orders/generali/design/SpesaControLavori";
import { numeriOperazione, superficieOperazione } from "@/lib/orders/generali/numeriOperazione";
import { useUnitaGenerale } from "@/hooks/useGeneraleUnita";
import { AvvisiPiano } from "@/components/orders/generali/design/AvvisiPiano";
import { RiquadroCantiereOperazione } from "@/components/orders/generali/design/RiquadroCantiereOperazione";
import { STILE_STATO } from "@/components/orders/generali/unita/aspetto";
import { STATI_VENDITA, type StatoVendita } from "@/lib/orders/generali/unita";
import "./design/commessa-generale.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

const euro = (n: number | null) => (n === null ? "—" : formattaEuro(n));
const dataIt = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);
const percento = (n: number | null) => (n === null ? "" : `${Math.round(n)}%`);
const NESSUNA_SIGLA: string[] = [];

export function CommessaGeneraleDettaglio({ generaleId }: { generaleId: string }) {
  const { data: r, isLoading, isError, refetch } = useRiepilogoGenerale(generaleId);
  const quote = useQuoteCostiComuni(r);
  const permissions = usePermissions();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [collega, setCollega] = useState(false);
  const [modifica, setModifica] = useState(false);
  const [analisiUnita, setAnalisiUnita] = useState(false);
  const [elencoUnita, setElencoUnita] = useState(false);
  const [parametri, setParametri] = useSearchParams();
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
  const avvisi = avvisiGenerale(r, totali).filter(a => a.id !== "vuota");
  // Un'unità divisa non è più un'unità: si contano le sue parti.
  const quanteVive = r.figlie.filter((f) => !f.divisa).length;
  // Finché nessuna unità ha un acquirente l'elenco in Panoramica è una riga: chi costruisce non
  // deve scorrere 26 righe «Libera» per arrivare al resto. Torna tabella dalla prima prenotazione.
  const unitaTutteLibere = immobiliare && r.figlie.length > 0 && r.figlie.every((f) => !f.statoVendita || f.statoVendita === "libera");
  const unitaInUnaRiga = unitaTutteLibere && !elencoUnita && !analisiUnita;
  // Il cliente della generale arriva già scelto nella commessa nuova (customer_id è letto da CreateOrder).
  const nuovaFiglia = () => navigate(`/azienda/ordini/nuovo?generale=${generaleId}${r.generale.clienteId ? `&customer_id=${r.generale.clienteId}` : ""}`);
  const schede = schedeDelModello(r.generale.modello, isMobile);
  // Finché non si vende, il lavoro di un'operazione immobiliare sta nel cantiere: il bottone
  // principale porta lì, «nuova unità» va fra le altre azioni (stessa regola della testata).
  const inCostruzione = immobiliare && schede.some((s) => s.id === "cantiere")
    && !r.figlie.some((f) => !!f.statoVendita && f.statoVendita !== "libera") && (totali.fatturato ?? 0) <= 0 && (totali.incassato ?? 0) <= 0;
  const riquadri = riquadriDelModello(r.generale.modello);
  const propsScheda = { riepilogo: r, totali, puoModificare };
  const iconeSchede = { dati: ClipboardList, unita: Building2, contratto: FileCheck2, piano: ChartNoAxesCombined, cantiere: HardHat, investitori: Landmark, documenti: FolderOpen };
  // Il grafico delle vendite compare dalla prima prenotazione: con tutte le unità libere ripete
  // la riga delle unità (26 «Libere», tutto a zero) a chi sta ancora costruendo.
  const grafici = riquadri.filter(x => x.id === "contratto" || (x.id === "unita" && quanteVive > 0 && !unitaTutteLibere));
  // La scheda aperta sta nell'indirizzo (?scheda=piano): si può mandare un link e tornare indietro.
  const richiesta = parametri.get("scheda") ?? (
    r.generale.modello === "appalto" && (SEZIONI_CONTRATTO as readonly string[]).includes(parametri.get("sezione") ?? "")
      ? "contratto" : null
  );
  const schedaAttiva = schede.some((x) => x.id === richiesta) ? richiesta! : "panoramica";
  const apriScheda = (id: string) => {
    const dopo = new URLSearchParams(parametri);
    if (id === "panoramica") {
      dopo.delete("scheda");
      dopo.delete("sezione");
    } else dopo.set("scheda", id);
    setParametri(dopo, { replace: true });
  };

  const panoramica = (
    <>
      <QuadroGenerale r={r} t={totali} quote={quote} />

      {/* 16/11/2026: l'ordine della panoramica è «dove siamo → cosa manca → cosa non va → il
          resto». «Completa l'operazione» sta attaccato ai numeri perché spiega proprio perché
          sono incompleti (margine finale e fabbisogno di capitale sospesi): prima stava sotto
          due blocchi di avvisi e si leggeva dopo. */}
      {puoModificare && <PerPartire riepilogo={r} nuovaFiglia={nuovaFiglia} />}

      <div className="generale-attention" aria-label="Da seguire"><AvvisiPiano riepilogo={r} dalPiano={dalPiano} puoModificare={puoModificare} />{riquadri.filter(x => x.id === "documenti").map(x => x.Riquadro && <x.Riquadro key={x.id} {...propsScheda} />)}</div>

      {avvisi.length > 0 && (
        <section aria-label="Cosa richiede attenzione" className="space-y-1.5">
          {avvisi.slice(0,3).map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                a.tono === "attenzione" ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200" : "bg-muted/40",
              )}
            >
              {a.tono === "attenzione" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <span>{a.testo}</span>
            </div>
          ))}
        </section>
      )}

      {puoModificare && <PerLavorare riepilogo={r} />}

      {/* Sviluppo e compravendita: finché si costruisce, il lavoro si segue dal cantiere. */}
      {immobiliare && schede.some(s => s.id === "cantiere") && <RiquadroCantiereOperazione riepilogo={r} puoModificare={puoModificare} />}

      {(r.permessi.costi || r.permessi.importi) && <div className="generale-appare" style={{ "--i": 0 } as React.CSSProperties}><GraficoSpesa riepilogo={r} /></div>}

      {(grafici.length > 0 || r.permessi.costi && r.permessi.margini) && <div className="generale-chart-grid">
        {r.permessi.costi && r.permessi.margini && <ComposizioneCosti riepilogo={r} />}
        {grafici.map(x => x.Riquadro && <x.Riquadro key={x.id} {...propsScheda} />)}
      </div>}

      <section aria-labelledby="figlie-titolo" className="generale-panel generale-children">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 id="figlie-titolo" className="flex items-center gap-2.5 text-base font-semibold"><span className="generale-section-icon">{immobiliare ? <Building2 aria-hidden="true" /> : <HardHat aria-hidden="true" />}</span>{r.figlie.length ? def.figlia.tante : immobiliare ? "Gestione dell'operazione" : "Lavori sulla commessa generale"}{r.figlie.length > 0 && <span className="generale-count">{quanteVive}</span>}</h2>
          {r.figlie.length > 0 && (immobiliare ? <Button size="sm" variant="ghost" aria-pressed={analisiUnita} onClick={() => setAnalisiUnita(v => !v)}>{analisiUnita ? "Torna alle vendite" : "Analisi per unità"}</Button> : <span className="text-xs text-muted-foreground">Avanzamento {Math.round(totali.avanzamento)}%</span>)}
        </header>
        {immobiliare && r.figlie.length > 0 && !unitaInUnaRiga && <p className="border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground">Costi e margine si controllano sull'intera operazione. L'analisi per unità mostra una ripartizione indicativa dei costi registrati, distinta dal margine finale del piano.</p>}
        {unitaInUnaRiga ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{quanteVive === 1 ? "1 unità" : `${quanteVive} unità`}</span>, {quanteVive === 1 ? "libera" : "tutte libere"}
              {r.permessi.importi && totali.assegnato !== null && <> · listino <span className="tabular-nums">{euro(totali.assegnato)}</span></>}
              <span className="block text-xs text-muted-foreground">Nessuna è ancora prenotata: quando inizi a vendere, qui torna l'elenco con acquirenti e incassi.</span>
            </span>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setElencoUnita(true)}>Mostra l'elenco</Button>
            {!isMobile && <Button size="sm" variant="outline" className="h-8" onClick={() => apriScheda("unita")}><Building2 className="mr-1.5 h-3.5 w-3.5" /> Unità e vendite</Button>}
          </div>
        ) : r.figlie.length === 0 && dalPiano ? (
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
                <Button size="sm" variant="outline" onClick={nuovaFiglia}><Plus className="mr-1.5 h-3.5 w-3.5" /> {def.figlia.nuova}</Button>
                <Button size="sm" variant="outline" onClick={() => setCollega(true)}><Link2 className="mr-1.5 h-3.5 w-3.5" /> Collega commesse esistenti</Button>
              </div>
            )}
          </div>
        ) : isMobile ? (
          <ul className="divide-y">
            {r.figlie.map((f) => <FigliaCard key={f.id} f={f} permessi={r.permessi} commerciale={immobiliare} />)}
          </ul>
        ) : (
          <TabellaFiglie r={r} t={totali} puoModificare={puoModificare} quote={quote} analisi={!immobiliare || analisiUnita} />
        )}
      </section>

      {/* Dopo le commesse, i dettagli dei moduli: affiancati, non uno sopra l'altro a tutta larghezza. */}
      {riquadri.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {riquadri.filter(x => x.id !== "unita" && x.id !== "contratto" && x.id !== "documenti").map((x) => x.Riquadro && (
            <div key={x.id} className={cn("min-w-0", (x.id === "unita" || x.id === "documenti") && "lg:col-span-2")}>
              <x.Riquadro {...propsScheda} />
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="commessa-workspace generale-design space-y-4">
      {/* Testata */}
      <header className="generale-page-heading commessa-page-heading">
        <Link to="/azienda/ordini" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Commesse
        </Link>
        <div className="generale-title-row">
          <div className="generale-title-copy">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="generale-type-badge font-normal">Commessa generale · {def.nome}</Badge>
              {r.generale.codice && <span className="text-xs text-muted-foreground">{r.generale.codice}</span>}
            <span className="generale-title-meta">
              {r.generale.cliente ? `${def.cliente.etichetta}: ${r.generale.cliente} · ` : ""}
              {quanteVive === 1 ? `1 ${def.figlia.una}` : `${quanteVive} ${def.figlia.tante.toLowerCase()}`}
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
                    {inCostruzione && <DropdownMenuItem onSelect={nuovaFiglia}><Plus aria-hidden="true" /> {def.figlia.nuova}</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
                {inCostruzione ? (
                  <Button variant="brand" size="sm" onClick={() => apriScheda("cantiere")}>
                    <HardHat className="mr-1.5 h-3.5 w-3.5" /> Apri il cantiere
                  </Button>
                ) : (
                  <Button variant="brand" size="sm" onClick={nuovaFiglia}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> {def.figlia.nuova}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {schede.length === 0 ? panoramica : (
        <Tabs value={schedaAttiva} onValueChange={apriScheda}>
          <TabsList className="generale-tabs commessa-main-tabs h-auto max-w-full flex-wrap justify-start">
            <TabsTrigger value="panoramica"><LayoutDashboard aria-hidden="true" />Panoramica</TabsTrigger>
            {schede.map((x) => { const Icona = iconeSchede[x.id]; return <TabsTrigger key={x.id} value={x.id}><Icona aria-hidden="true" />{x.titolo}</TabsTrigger>; })}
          </TabsList>
          <TabsContent value="panoramica" className="mt-4 space-y-4">{panoramica}</TabsContent>
          {schede.map((x) => (
            <TabsContent key={x.id} value={x.id} className="mt-4">
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

function Numero({ etichetta, valore, nota, tono, tipo = "valore" }: { etichetta: string; valore: string; nota?: string; tono?: "rosso" | "verde"; tipo?: "valore" | "incasso" | "capitale" | "margine" }) {
  const Icona = { valore: CircleDollarSign, incasso: Banknote, capitale: Wallet, margine: TrendingUp }[tipo];
  return (
    <div className={cn("generale-kpi", `generale-kpi--${tipo}`, tono === "verde" && "generale-kpi--positive", tono === "rosso" && "generale-kpi--negative")}>
      <p className="generale-kpi-label"><Icona aria-hidden="true" />{etichetta}</p>
      <p className={cn("generale-kpi-value tabular-nums", tono === "rosso" && "generale-negative", tono === "verde" && "generale-positive")}>{valore}</p>
      {nota && <p className="generale-kpi-note">{nota}</p>}
    </div>
  );
}

/**
 * Il quadro in cima: una card sola con i quattro numeri (valore, come va, cosa devono pagarti,
 * cosa resta) e sotto il valore che «scala», dall'assegnato all'incassato, sulla stessa base.
 */
function QuadroGenerale({ r, t, quote }: { r: RiepilogoGenerale; t: TotaliGenerale; quote: QuoteCostiComuni | null }) {
  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const appalto = r.generale.modello === "appalto";
  const n = useGeneralePianoNumeri(r);
  const piano = pianoPerNumeri(n.piano);
  // Il SAL è del contratto: senza il valore del contratto non c'è né la riga né il residuo.
  const contratto = useDatiContratto(r.generale.id, appalto);
  const aSal = contratto.data && valoreContratto(contratto.data.contratto, contratto.data.atti) ? totaliSal(contratto.data.sal).aSal : null;
  const numeri = numeriChiave(r.generale.modello, t, piano, { costiComuni: quote?.totale ?? 0, aSal });
  const di = (id: NumeroChiave["id"]) => numeri.find((x) => x.id === id)?.valore ?? null;
  // Senza un costo registrato il margine sarebbe tutto il ricavo: un numero verde che non dice niente.
  const senzaCosti = !piano && r.permessi.margini && (t.costo ?? 0) === 0 && (quote?.totale ?? 0) === 0;
  const margine = senzaCosti ? null : di("margine");
  // Un'operazione immobiliare che non ha ancora venduto né fatturato sta costruendo: la testata
  // parla di spesa contro budget, non di «da incassare 0 €» e barre di vendita vuote (14/11/2026).
  const inVendita = r.figlie.some((f) => !!f.statoVendita && f.statoVendita !== "libera") || (t.fatturato ?? 0) > 0 || (t.incassato ?? 0) > 0;
  const costruzione = !appalto && !inVendita;
  const budget = r.permessi.costi && n.piano ? n.piano.confronto.totali.costi.previsto : null;
  const speso = r.permessi.costi ? (n.piano ? n.piano.confronto.totali.costi.reale : (t.costo ?? 0) + (quote?.totale ?? 0)) : null;
  const budgetCompleto = n.piano?.budgetCompleto !== false;
  const conCapitale = numeri.some((x) => x.id === "capitale") && r.permessi.margini && n.piano?.calendarioCompleto !== false;
  const conMargine = r.permessi.margini && margine !== null;
  // Appalto: quanto manca alla fine contrattuale (con le proroghe) e la penale se si è in ritardo (T3, 14/11/2026).
  const oggi = oggiIso();
  const fineContratto = appalto && contratto.data ? fineAggiornata(contratto.data.contratto, contratto.data.atti).data : null;
  const ultimati = appalto ? contratto.data?.contratto?.dataUltimazione ?? null : null;
  const penale = appalto && contratto.data ? penaleMaturata(contratto.data.contratto, contratto.data.atti, oggi) : null;
  const giorniAllaFine = fineContratto && !ultimati ? giorniTra(oggi, fineContratto) : null;

  // ── Previsionale e reale, col €/m² (16/11/2026) ──────────────────────────
  // I metri quadri: la somma delle unità (si aggiorna da sola), se no quelli scritti a mano
  // nella scheda Dati, se no la superficie dell'immobile comprato.
  const unita = useUnitaGenerale(r.permessi.importi ? r.generale.id : undefined);
  const superficie = superficieOperazione({
    unitaMq: unita.data?.unita?.map((u) => u.mq),
    mqVendibili: r.generale.dati?.area?.mq_vendibili,
    immobileMq: r.generale.dati?.immobile?.mq,
  });
  // Venduto davvero: le unità non più libere. Per un appalto è quello che si è fatturato.
  const vendutoUnita = r.figlie
    .filter((f) => f.statoVendita && f.statoVendita !== "libera")
    .reduce((somma, f) => somma + (f.importo ?? 0), 0);
  const venduto = !r.permessi.importi ? null : appalto ? t.fatturato : vendutoUnita > 0 ? vendutoUnita : t.fatturato;
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
    { etichetta: "Fatturato", valore: t.fatturato, tono: "bg-indigo-300" },
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
  const quantiNumeri = costruzione
    ? 1 + (speso !== null ? 1 : 0) + (conCapitale ? 1 : 0) + (conMargine ? 1 : 0)
    : 4 + (appalto && (fineContratto || ultimati) ? 1 : 0);

  return (
    <section aria-label={r.permessi.importi ? `${def.valore.etichetta}: ${euro(r.generale.valore ?? t.assegnato)}` : undefined} className="generale-hero">
      <header className="generale-hero-heading"><div><span className="generale-hero-icon"><LayoutDashboard aria-hidden="true" /></span><h2>La commessa in numeri</h2></div><span className="generale-hero-caption">{appalto ? "Il quadro dell'intero appalto" : costruzione ? "L'operazione in costruzione" : "Il quadro dell'intera operazione"}</span></header>
      <div className="generale-kpi-grid" style={{ "--kpi-colonne": Math.max(2, quantiNumeri) } as React.CSSProperties}>
        {costruzione && r.permessi.importi ? (
          <>
            <Numero etichetta={def.valore.etichetta} valore={euro(r.generale.valore ?? t.assegnato)} nota={r.generale.valore === null ? `somma delle ${def.figlia.tante.toLowerCase()}` : undefined} />
            {speso !== null && (
              <Numero
                tipo="capitale"
                etichetta="Speso finora"
                valore={euro(speso)}
                nota={budget !== null && budget > 0 ? `su ${euro(budget)} di budget${budgetCompleto ? "" : ", stime da completare"}` : "il piano non ha ancora un budget"}
              />
            )}
            {conCapitale && <Numero tipo="capitale" etichetta="Capitale impegnato" valore={euro(di("capitale"))} nota="il massimo previsto" />}
          </>
        ) : r.permessi.importi ? (
          <>
            <Numero etichetta={def.valore.etichetta} valore={euro(r.generale.valore ?? t.assegnato)} nota={r.generale.valore === null ? `somma delle ${def.figlia.tante.toLowerCase()}` : undefined} />
            <Numero tipo="incasso" etichetta="Da incassare" valore={euro(t.daIncassare)} nota={appalto ? "fatturato e non ancora pagato" : "venduto o fatturato, non ancora pagato"} />
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
            {numeri.some((x) => x.id === "capitale") && r.permessi.margini && <Numero tipo="capitale" etichetta="Capitale impegnato" valore={euro(di("capitale"))} nota={n.piano?.calendarioCompleto === false ? (n.voci.some((v) => v.importo > 0 && !v.mese) ? "completa il calendario del piano" : "completa le stime del piano") : "il massimo previsto"} />}
            {numeri.some((x) => x.id === "assegnare") && (
              <Numero
                etichetta="Da assegnare"
                valore={euro(t.daAssegnare)}
                tono={t.daAssegnare !== null && t.daAssegnare < 0 ? "rosso" : undefined}
                nota={t.daAssegnare === null ? "manca il valore" : undefined}
              />
            )}
          </>
        ) : (
          <Numero etichetta={def.figlia.tante} valore={String(t.figlie)} />
        )}
        {costruzione && r.permessi.importi && !conMargine ? null : r.permessi.margini ? (
          <Numero
            tipo="margine"
            etichetta={piano ? "Margine a finire" : quote || r.figlie.length === 0 ? "Margine dell'operazione" : `Margine delle ${def.figlia.tante.toLowerCase()}`}
            valore={euro(margine)}
            tono={margine !== null && margine < 0 ? "rosso" : margine !== null && margine > 0 ? "verde" : undefined}
            nota={senzaCosti
              ? "nessun costo registrato"
              : piano
                ? "stima dal piano economico"
                : quote
                  ? (quote.totale > 0 ? `${def.figlia.tante.toLowerCase()} ${euro(t.margine)} − costi comuni ${euro(quote.totale)}` : "ricavi meno costi registrati")
                  : "senza i costi comuni registrati sulla generale"}
          />
        ) : (
          <Numero etichetta="Avanzamento" valore={`${Math.round(t.avanzamento)}%`} />
        )}
      </div>

      {conPrevReale && (
        <QuadroPrevisionale
          n={numeriPrevReale}
          etichettaVendita={appalto ? "Fatturato" : "Venduto"}
          incassato={t.incassato}
          budgetParziale={!budgetCompleto}
          notaCostiPrevisti={r.permessi.costi ? "il piano non ha ancora un budget" : "costi non visibili"}
        />
      )}

      {/* In costruzione: speso contro lavori fatti, non due barre di cui una sempre al 100%. */}
      {/* La compravendita tiene la sua catena acquisto → lavori → rivendita. */}
      {conBudget && !catena ? (
        <SpesaControLavori speso={speso!} budget={budget!} avanzamento={t.avanzamento} budgetParziale={!budgetCompleto} />
      ) : r.permessi.importi && barre.length > 0 && (
        <div className="generale-hero-progress">
          <dl className={cn("space-y-1.5 lg:grid lg:gap-5 lg:space-y-0", colonne)}>
            {barre.map((riga) => {
              const q = quota(riga.valore, baseBarre);
              return (
                <div key={riga.etichetta} className="grid min-w-0 grid-cols-[6.5rem_1fr] items-center gap-2 text-xs lg:flex lg:flex-col lg:items-stretch lg:gap-1">
                  <dt className="generale-progress-label lg:order-1">{riga.etichetta}</dt>
                  <dd className="text-right tabular-nums lg:order-2 lg:flex lg:items-baseline lg:justify-between lg:text-left">
                    <span className="font-medium lg:text-sm">{euro(riga.valore)}</span> <span className="generale-progress-percent">{percento(q)}</span>
                  </dd>
                  {/* Da telefono bastano i numeri: la riga resta densa. */}
                  <div className="generale-progress-track h-1.5 overflow-hidden rounded-full max-lg:hidden lg:order-3" aria-hidden="true">
                    <div className={cn("h-full rounded-full", riga.tono)} style={{ width: `${q ?? 0}%` }} />
                  </div>
                </div>
              );
            })}
          </dl>
          <div className="generale-hero-note mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px]">
            <span>Importi al netto dell'IVA.</span>
            {!costruzione && t.daAssegnare !== null && (appalto || r.figlie.length > 0) && (
              <span className={cn(t.daAssegnare < 0 && "font-medium text-destructive")}>
                {appalto ? (t.daAssegnare < 0 ? `Oltre di ${euro(-t.daAssegnare)}` : `Da assegnare ${euro(t.daAssegnare)}`) : `Differenza ricavi previsti / prezzi unità: ${euro(t.daAssegnare)}`}
              </span>
            )}
          </div>
        </div>
      )}
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

function TabellaFiglie({ r, t, puoModificare, quote, analisi }: { r: RiepilogoGenerale; t: TotaliGenerale; puoModificare: boolean; quote: QuoteCostiComuni | null; analisi: boolean }) {
  // Il margine di ogni commessa è «pieno»: meno la sua quota dei costi comuni, se ce ne sono.
  const conQuote = !!quote && quote.totale > 0;
  const pieno = (f: FigliaGenerale) => (f.margine === null ? null : f.margine - (quote?.perFiglia.get(f.id)?.importo ?? 0));
  const [azione, setAzione] = useState<{ figlia: FigliaGenerale; tipo: AzioneFiglia } | null>(null);
  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const p = r.permessi;
  return (
    <div className="overflow-x-auto">
      {azione && (
        <SpostaFigliaDialog riepilogo={r} totali={t} figlia={azione.figlia} azione={azione.tipo} onClose={() => setAzione(null)} />
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">{def.figlia.tante}</th>
            <th className="px-2 py-2 font-medium">{analisi ? "Stato" : "Stato vendita"}</th>
            {analisi && <th className="px-2 py-2 font-medium">Avanzamento</th>}
            {p.importi && <th className="px-2 py-2 text-right font-medium">Importo</th>}
            {p.importi && analisi && <th className="px-2 py-2 text-right font-medium">Eseguito</th>}
            {p.importi && <th className="px-2 py-2 text-right font-medium">Fatturato</th>}
            {p.importi && <th className="px-2 py-2 text-right font-medium">Incassato</th>}
            {p.margini && analisi && <th className="px-2 py-2 text-right font-medium" title={`Ricavi meno i costi registrati finora${conQuote ? `. ${quote!.motivo}` : ""}`}>Margine a oggi</th>}
            {puoModificare && <th className="w-10 px-2 py-2"><span className="sr-only">Azioni</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {r.figlie.map((f) => (
            <tr key={f.id} className="hover:bg-muted/40">
              <td className="max-w-[22rem] px-4 py-2">
                <Link to={`/azienda/ordini/${f.id}`} className="block min-w-0 hover:underline">
                  {f.codice && <span className="mr-1.5 text-xs text-muted-foreground">{f.codice}</span>}
                  <span className="font-medium">{f.nome}</span>
                </Link>
                {f.indirizzo && <p className="truncate text-xs text-muted-foreground">{f.indirizzo}</p>}
              </td>
              <td className="max-w-[10rem] px-2 py-2 text-xs">{analisi ? <Stato f={f} /> : <StatoCommerciale stato={f.statoVendita} />}</td>
              {analisi && <td className="px-2 py-2"><Avanzamento valore={f.avanzamento} fasi={f.avanzamentoFasi} aMisura={f.aMisura} /></td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(f.importo)}</td>}
              {p.importi && analisi && <td className="px-2 py-2 text-right tabular-nums">{euro(f.eseguito)}</td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(f.fatturato)}</td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(f.incassato)}</td>}
              {p.margini && analisi && (
                <td
                  className={cn("px-2 py-2 text-right tabular-nums", (pieno(f) ?? 0) < 0 && "text-destructive")}
                  title={conQuote && f.margine !== null ? `Margine diretto ${euro(f.margine)} − quota costi comuni ${euro(quote!.perFiglia.get(f.id)?.importo ?? 0)}` : undefined}
                >
                  {/* Senza costi registrati il margine sarebbe tutto il ricavo: meglio dirlo. */}
                  {f.costo === 0 && !conQuote ? <span className="text-xs text-muted-foreground">costi da registrare</span> : euro(pieno(f))}
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
        {r.figlie.length > 1 && (
          <tfoot>
            <tr className="border-t bg-muted/30 text-sm font-medium">
              <td className="px-4 py-2">Totale</td>
              <td className="px-2 py-2" />
              {analisi && <td className="px-2 py-2"><Avanzamento valore={t.avanzamento} /></td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(t.assegnato)}</td>}
              {p.importi && analisi && <td className="px-2 py-2 text-right tabular-nums">{euro(t.eseguito)}</td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(t.fatturato)}</td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(t.incassato)}</td>}
              {p.margini && analisi && (() => {
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
          {permessi.importi && <p className="text-sm tabular-nums">{euro(f.importo)}</p>}
          {commerciale ? <StatoCommerciale stato={f.statoVendita} /> : <p className="text-xs tabular-nums text-muted-foreground">{Math.round(f.avanzamento)}%</p>}
        </div>
      </Link>
    </li>
  );
}
