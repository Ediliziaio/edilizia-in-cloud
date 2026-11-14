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
import { AlertTriangle, ArrowLeft, ArrowRightLeft, Banknote, Building2, ChartNoAxesCombined, CircleDollarSign, FileCheck2, FolderOpen, HardHat, Info, Landmark, LayoutDashboard, Link2, ListChecks, MoreHorizontal, Pencil, Plus, TrendingUp, Unlink, Wallet } from "lucide-react";
import { ComposizioneCosti } from "@/components/orders/generali/design/ComposizioneCosti";
import { AvvisiPiano } from "@/components/orders/generali/design/AvvisiPiano";
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
import { SEZIONI_CONTRATTO, totaliSal, valoreContratto } from "@/lib/orders/generali/contratto";
import { numeriChiave, pianoPerNumeri, type NumeroChiave } from "@/lib/orders/generali/numeriChiave";
import { cn } from "@/lib/utils";

const euro = (n: number | null) => (n === null ? "—" : formattaEuro(n));
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
  // Il cliente della generale arriva già scelto nella commessa nuova (customer_id è letto da CreateOrder).
  const nuovaFiglia = () => navigate(`/azienda/ordini/nuovo?generale=${generaleId}${r.generale.clienteId ? `&customer_id=${r.generale.clienteId}` : ""}`);
  const schede = schedeDelModello(r.generale.modello, isMobile);
  const riquadri = riquadriDelModello(r.generale.modello);
  const propsScheda = { riepilogo: r, totali, puoModificare };
  const iconeSchede = { unita: Building2, contratto: FileCheck2, piano: ChartNoAxesCombined, cantiere: HardHat, investitori: Landmark, documenti: FolderOpen };
  const grafici = riquadri.filter(x => x.id === "contratto" || (x.id === "unita" && quanteVive > 0));
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

      {puoModificare && r.figlie.length > 0 && <PerPartire riepilogo={r} nuovaFiglia={nuovaFiglia} />}

      {(grafici.length > 0 || r.permessi.costi && r.permessi.margini) && <div className="generale-chart-grid">
        {r.permessi.costi && r.permessi.margini && <ComposizioneCosti riepilogo={r} />}
        {grafici.map(x => x.Riquadro && <x.Riquadro key={x.id} {...propsScheda} />)}
      </div>}

      <section aria-labelledby="figlie-titolo" className="generale-panel generale-children">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 id="figlie-titolo" className="flex items-center gap-2.5 text-base font-semibold"><span className="generale-section-icon">{immobiliare ? <Building2 aria-hidden="true" /> : <HardHat aria-hidden="true" />}</span>{r.figlie.length ? def.figlia.tante : "Gestione dell'operazione"}{r.figlie.length > 0 && <span className="generale-count">{quanteVive}</span>}</h2>
          {r.figlie.length > 0 && (immobiliare ? <Button size="sm" variant="ghost" aria-pressed={analisiUnita} onClick={() => setAnalisiUnita(v => !v)}>{analisiUnita ? "Torna alle vendite" : "Analisi per unità"}</Button> : <span className="text-xs text-muted-foreground">Avanzamento {Math.round(totali.avanzamento)}%</span>)}
        </header>
        {immobiliare && r.figlie.length > 0 && <p className="border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground">Costi e margine si controllano sull'intera operazione. L'analisi per unità mostra una ripartizione indicativa dei costi registrati, distinta dal margine finale del piano.</p>}
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
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="brand" size="sm" onClick={nuovaFiglia}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> {def.figlia.nuova}
                </Button>
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

  const righe = [
    ...(appalto || r.figlie.length ? [{ etichetta: appalto ? "Assegnato" : "Prezzi delle unità", valore: t.assegnato, tono: "bg-blue-300" }] : []),
    ...(appalto ? [{ etichetta: "Eseguito", valore: t.eseguito, tono: "bg-sky-400" }] : []),
    ...(appalto && aSal !== null ? [{ etichetta: "A SAL", valore: aSal, tono: "bg-orange-400" }] : []),
    { etichetta: "Fatturato", valore: t.fatturato, tono: "bg-indigo-300" },
    { etichetta: "Incassato", valore: t.incassato, tono: "bg-emerald-400" },
  ];
  const colonne = righe.length === 5 ? "lg:grid-cols-5" : righe.length === 3 ? "lg:grid-cols-3" : righe.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-4";

  return (
    <section aria-label={r.permessi.importi ? `${def.valore.etichetta}: ${euro(r.generale.valore ?? t.assegnato)}` : undefined} className="generale-hero">
      <header className="generale-hero-heading"><div><span className="generale-hero-icon"><LayoutDashboard aria-hidden="true" /></span><h2>La commessa in numeri</h2></div><span className="generale-hero-caption">{appalto ? "Il quadro dell'intero appalto" : "Il quadro dell'intera operazione"}</span></header>
      <div className="generale-kpi-grid">
        {r.permessi.importi ? (
          <>
            <Numero etichetta={def.valore.etichetta} valore={euro(r.generale.valore ?? t.assegnato)} nota={r.generale.valore === null ? `somma delle ${def.figlia.tante.toLowerCase()}` : undefined} />
            <Numero tipo="incasso" etichetta="Da incassare" valore={euro(t.daIncassare)} nota={appalto ? "fatturato e non ancora pagato" : "venduto o fatturato, non ancora pagato"} />
            {numeri.some((x) => x.id === "residuo") && <Numero etichetta="Residuo del contratto" valore={euro(di("residuo"))} nota="non ancora a SAL" />}
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
        {r.permessi.margini ? (
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

      {r.permessi.importi && (
        <div className="generale-hero-progress">
          <dl className={cn("space-y-1.5 lg:grid lg:gap-5 lg:space-y-0", colonne)}>
            {righe.map((riga) => {
              const q = quota(riga.valore, t.base);
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
            {t.daAssegnare !== null && (appalto || r.figlie.length > 0) && (
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

function Avanzamento({ valore }: { valore: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${valore}%` }} />
      </div>
      <span className="tabular-nums text-xs">{Math.round(valore)}%</span>
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
              {analisi && <td className="px-2 py-2"><Avanzamento valore={f.avanzamento} /></td>}
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
