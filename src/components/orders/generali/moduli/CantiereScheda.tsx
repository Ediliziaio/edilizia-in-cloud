import { UniformSelect } from "@/components/ui/uniform-select";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  FileQuestion,
  ListTree,
  ListTodo,
  Plus,
  Package,
  PackageCheck,
  ReceiptText,
  Truck,
  Users,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AspettoOperativoProvider } from "../design/ContestoOperativo";
import { InvitoFasiDalPiano } from "../design/FasiDalPianoDialog";
import { DocumentiInPopup } from "@/components/orders/DocumentiInPopup";
import { DEFINIZIONI_MODELLI } from "@/lib/orders/commesseGenerali";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { eMateriale } from "@/lib/distinta/elencoArticoli";
import { useMaterialiPerFase } from "@/hooks/useMaterialiPerFase";
import type { VistaOperazione } from "@/hooks/useMovimentiOperazione";
import type { ModuloScheda, PropsScheda } from "../tipiScheda";
import { MovimentiOperazione } from "./MovimentiOperazione";
import { AmbitoOperazione } from "./AmbitoOperazione";
import { IndiceLavorazioni } from "./IndiceLavorazioni";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Valore del selettore per «tutta l'operazione»: generale e figlie insieme, sola lettura. */
const TUTTA = "__tutta__";
const RITORNO_CRONO = "ritorno-cronoprogramma";

const SCHEDE = [
  { id: "da-seguire", nome: "Da seguire", icona: ListTodo },
  { id: "rapportini", nome: "Rapportini", icona: ClipboardList },
  { id: "lavorazioni", nome: "Lavorazioni", icona: ListTree },
  { id: "cronoprogramma", nome: "Cronoprogramma", icona: CalendarRange },
  { id: "materiali", nome: "Materiali", icona: Package },
  { id: "offerte", nome: "Richieste d’offerta", icona: FileQuestion },
  { id: "acquisti", nome: "Ordini d’acquisto", icona: PackageCheck },
  { id: "ddt", nome: "DDT", icona: Truck },
  { id: "contabilita", nome: "Costi e pagamenti", icona: ReceiptText },
  { id: "squadre", nome: "Squadre e ditte", icona: Users },
] as const;
type Scheda = typeof SCHEDE[number]["id"];
const SCHEDA_DELLA_SEZIONE: Record<string, Scheda> = {
  "da-seguire": "da-seguire",
  rapportini: "rapportini",
  lavorazioni: "lavorazioni",
  computi: "lavorazioni",
  cronoprogramma: "cronoprogramma",
  materiali: "materiali",
  articoli: "materiali",
  offerte: "offerte",
  acquisti: "acquisti",
  forniture: "acquisti",
  controllo: "acquisti",
  ddt: "ddt",
  contabilita: "contabilita",
  fatture: "contabilita",
  pagamenti: "contabilita",
  squadre: "squadre",
  subappalti: "squadre",
};
const VISTA_OPERAZIONE: Partial<Record<Scheda, VistaOperazione>> = {
  "da-seguire": "da-seguire",
  rapportini: "rapportini",
  cronoprogramma: "cronoprogramma",
  acquisti: "acquisti",
  ddt: "ddt",
  contabilita: "fatture",
  squadre: "squadre",
};

/** Una parte di una scheda, col suo titolo: è il bersaglio dei collegamenti alle sezioni di prima. */
function Sezione({ id, titolo, children }: { id: string; titolo: string; children: React.ReactNode }) {
  return (
    <section id={`cantiere-${id}`} aria-labelledby={`cantiere-${id}-titolo`} className="scroll-mt-24 space-y-3">
      <h3 id={`cantiere-${id}-titolo`} className="generale-cantiere-sezione">{titolo}</h3>
      {children}
    </section>
  );
}

const RapportiniUfficio = lazy(() =>
  import("@/components/orders/RapportiniUfficio").then((m) => ({
    default: m.RapportiniUfficio,
  })),
);
const Rapportini = lazy(() =>
  import("@/components/orders/OrdineRapportiniCampo").then((m) => ({
    default: m.OrdineRapportiniCampo,
  })),
);
const DaApprovare = lazy(() =>
  import("@/components/orders/DaApprovareCommessa").then((m) => ({
    default: m.DaApprovareCommessa,
  })),
);
const Forniture = lazy(() =>
  import("@/components/orders/LinkedPurchaseOrdersCard").then((m) => ({
    default: m.LinkedPurchaseOrdersCard,
  })),
);
const NuovoOda = lazy(() =>
  import("@/components/orders/NuovoOdaCommessaDialog").then(m => ({ default: m.NuovoOdaCommessaDialog })),
);
const MaterialiOperazione = lazy(() => import("./MaterialiOperazione"));
const MaterialiAmbito = lazy(() => import("./MaterialiAmbito"));
const Squadre = lazy(() =>
  import("@/components/orders/OrderLaborCosts").then((m) => ({
    default: m.OrderLaborCosts,
  })),
);
const Lavorazioni = lazy(() =>
  import("./LavorazioniAmbito").then(m => ({ default: m.LavorazioniAmbito })),
);
const Cronoprogramma = lazy(() =>
  import("./LavorazioniAmbito").then(m => ({ default: m.CronoprogrammaAmbito })),
);
const Offerte = lazy(() =>
  import("@/components/orders/OrderRichiesteOfferta").then(m => ({ default: m.OrderRichiesteOfferta })),
);
const Computo = lazy(() => import("@/components/computo/commessa/OrderComputoTab"));
const Bolle = lazy(() =>
  import("@/components/orders/OrderDocumentiFornitore").then((m) => ({
    default: m.OrderBolleDdtCard,
  })),
);
const Fatture = lazy(() =>
  import("@/components/orders/OrderDocumentiFornitore").then((m) => ({
    default: m.OrderFattureFornitoriCard,
  })),
);
const Costi = lazy(() =>
  import("@/components/orders/OrderCostiCommessa").then((m) => ({
    default: m.OrderCostiCommessaCard,
  })),
);
const Pagamenti = lazy(() =>
  import("@/components/orders/QuadroPagamentiCommessa").then((m) => ({
    default: m.UsciteCommessa,
  })),
);
const Subappalti = lazy(() =>
  import("@/components/orders/SubappaltatoriCommessa").then((m) => ({
    default: m.SubappaltatoriCommessa,
  })),
);
const Riconciliazione = lazy(() =>
  import("./RiconciliazioneGenerale").then((m) => ({
    default: m.RiconciliazioneGenerale,
  })),
);

export function CantiereGenerale({ riepilogo, puoModificare }: PropsScheda) {
  const tr = useT();
  const g = riepilogo.generale;
  const [parametri, setParametri] = useSearchParams();
  const telefono = useIsMobile();
  const { effectiveCompany } = useAuth();
  const costi = riepilogo.permessi.costi;
  const schedeDisponibili = costi ? SCHEDE : SCHEDE.filter(s => s.id !== "contabilita");
  const richiesta = parametri.get("vista-cantiere") ?? "";
  const scheda: Scheda = (() => {
    const s = Object.hasOwn(SCHEDA_DELLA_SEZIONE, richiesta) ? SCHEDA_DELLA_SEZIONE[richiesta] : undefined;
    // Senza il permesso dei costi la scheda delle fatture non c'è.
    return !s || (s === "contabilita" && !costi) ? "da-seguire" : s;
  })();
  const vista = scheda;
  const [aperturaMateriali, setAperturaMateriali] = useState<{ id: string; genera?: boolean; ricerca?: string; computoId?: string; faseProposte?: string | null } | null>(null);
  const scorrimentoSchede = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = scorrimentoSchede.current;
    const attiva = rail?.querySelector('[aria-selected="true"]');
    if (!rail || !attiva) return;
    const area = rail.getBoundingClientRect();
    const posizione = attiva.getBoundingClientRect();
    if (posizione.right > area.right) rail.scrollLeft += posizione.right - area.right;
    else if (posizione.left < area.left) rail.scrollLeft -= area.left - posizione.left;
  }, [vista]);
  const vistaOperazione = VISTA_OPERAZIONE[scheda];
  const mostraControllo = vista === "acquisti" && richiesta === "controllo" && costi;
  const ambitoValido = (id: string | null): id is string =>
    id === g.id || (id === TUTTA && riepilogo.figlie.length > 0) || riepilogo.figlie.some(f => f.id === id);
  const ritornoCrono = parametri.get(RITORNO_CRONO);
  const tornaAlCrono = telefono && vista === "lavorazioni" && ambitoValido(ritornoCrono) ? ritornoCrono : null;
  const setVista = (x: string) => {
    setAperturaMateriali(null);
    const p = new URLSearchParams(parametri);
    p.set("vista-cantiere", x);
    if (x === "cronoprogramma" && tornaAlCrono) p.set("ambito-cantiere", tornaAlCrono);
    p.delete(RITORNO_CRONO);
    p.delete("fase-cantiere");
    p.delete("rapportino-cantiere");
    p.delete("materiali-fase");
    p.delete("materiale-ricerca-ambito");
    setNuovoOda(false);
    setParametri(p, { replace: true });
  };
  // I link diretti a computi, pagamenti e subappalti conservano la loro sezione.
  useEffect(() => {
    if (!["computi", "pagamenti", "subappalti"].includes(richiesta)) return;
    const t = window.setTimeout(() => document.getElementById(`cantiere-${richiesta}`)?.scrollIntoView({ block: "start" }), 300);
    return () => window.clearTimeout(t);
  }, [richiesta, scheda]);
  const [nuovoOda, setNuovoOda] = useState(false);
  const ambitoUrl = parametri.get("ambito-cantiere");
  const sezioneSingola = ["computi", "pagamenti", "subappalti"].includes(richiesta);
  const ambito = ambitoValido(ambitoUrl)
    ? ambitoUrl
    : riepilogo.figlie.length && !sezioneSingola ? TUTTA : g.id;
  const fase = parametri.get("fase-cantiere");
  const rapportino = parametri.get("rapportino-cantiere");
  const setAmbito = (id: string, faseId?: string, schedaDaAprire?: Scheda, rapportinoId?: string) => {
    setAperturaMateriali(null);
    setNuovoOda(false);
    const p = new URLSearchParams(parametri);
    p.set("ambito-cantiere", id);
    if (telefono && vista === "cronoprogramma" && faseId) p.set(RITORNO_CRONO, ambito);
    else if (id !== ambito || schedaDaAprire) p.delete(RITORNO_CRONO);
    p.delete("materiali-fase");
    p.delete("materiale-ricerca-ambito");
    if (id === TUTTA && vista === "lavorazioni" && p.has("lavorazioni-edificio")) {
      p.delete("lavorazioni-edificio");
      p.delete("mov-pagina-fasi");
    }
    if (schedaDaAprire) p.set("vista-cantiere", schedaDaAprire);
    if (faseId) {
      p.set("vista-cantiere", "lavorazioni");
      p.set("fase-cantiere", faseId);
    }
    else p.delete("fase-cantiere");
    if (rapportinoId) p.set("rapportino-cantiere", rapportinoId);
    else p.delete("rapportino-cantiere");
    setParametri(p, { replace: !rapportinoId });
  };
  const apriMaterialiFase = (id: string, faseId: string, articolo?: string) => {
    setAperturaMateriali(null);
    const p = new URLSearchParams(parametri);
    p.set("vista-cantiere", "materiali");
    p.set("ambito-cantiere", id);
    p.set("materiali-fase", faseId);
    if (articolo) p.set("materiale-ricerca-ambito", articolo);
    else p.delete("materiale-ricerca-ambito");
    p.delete("fase-cantiere");
    p.delete("rapportino-cantiere");
    p.delete(RITORNO_CRONO);
    setParametri(p);
  };
  const faseMateriali = parametri.get("materiali-fase") ?? undefined;
  const cercaMateriale = parametri.get("materiale-ricerca-ambito")?.slice(0, 100) ?? undefined;
  const tutta = ambito === TUTTA && riepilogo.figlie.length > 0;
  const figlia = riepilogo.figlie.find(f => f.id === ambito);
  const scelto = figlia ?? g;
  const orderId = scelto.id;
  const permessi = usePermissions();
  const puoCreareOda = puoModificare && !permessi.solaLettura && permessi.canViewCosts && permessi.canEditOrders;
  const navigaForniture = vista === "acquisti" && costi;
  const controllaDdt = vista === "ddt" && costi;
  const creaOdaGenerale = navigaForniture && tutta && !mostraControllo && puoCreareOda;
  const usaRegistro = !mostraControllo && !!vistaOperazione &&
    (tutta || vista === "da-seguire" || (telefono && vista === "cronoprogramma"));
  const comandi = (navigaForniture || controllaDdt) && (
    <>
      {navigaForniture && (
        <div role="group" aria-label={tr("Vista ordini d’acquisto")} className="flex w-fit flex-wrap gap-0.5">
          <Button type="button" size="sm" className="h-8 px-2 text-xs" variant={mostraControllo ? "ghost" : "secondary"} aria-pressed={!mostraControllo} onClick={() => setVista("acquisti")}>
            <PackageCheck className="size-4" aria-hidden="true" /> {tr("Ordini")}
          </Button>
          <Button type="button" size="sm" className="h-8 px-2 text-xs" variant={mostraControllo ? "secondary" : "ghost"} aria-pressed={mostraControllo} onClick={() => setVista("controllo")}>
            <ClipboardCheck className="size-4" aria-hidden="true" /> {tr("Controllo forniture")}
          </Button>
        </div>
      )}
      {controllaDdt && (
        <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => setVista("controllo")}>
          <ClipboardCheck className="size-4" aria-hidden="true" /> {tr("Controllo forniture")} <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      )}
      {creaOdaGenerale && (
        <Button type="button" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => setNuovoOda(true)}>
          <Plus className="size-4" aria-hidden="true" /> {tr("Nuovo OdA sulla generale")}
        </Button>
      )}
    </>
  );
  const materiali = useMaterialiPerFase(vista === "acquisti" && !mostraControllo && costi && (!tutta || nuovoOda) ? orderId : undefined);
  const righeAcquisto = (materiali.data?.righe ?? []).filter(eMateriale);
  const qc = useQueryClient();
  // Native mutations predate general projects. Refresh their consolidated figures when leaving the site workspace.
  useEffect(
    () => () => {
      void qc.invalidateQueries({ queryKey: ["generale-piano-reale", g.id] });
      void qc.invalidateQueries({
        queryKey: ["commessa-generale-riepilogo", g.id],
      });
    },
    [qc, g.id],
  );
  return (
    <AspettoOperativoProvider value={{ generaleId: g.id, codice: g.codice }}>
      <section
        aria-label={tr("Cantiere della commessa generale")}
        className="generale-cantiere min-w-0"
      >
        <DocumentiInPopup orderId={orderId}>
          <Tabs className="min-w-0" value={vista} onValueChange={setVista}>
            <div className="generale-cantiere-toolbar">
              <div ref={scorrimentoSchede} className="generale-cantiere-scroll min-w-0 overflow-x-auto">
                <TabsList className="generale-subtabs generale-section-navigation generale-cantiere-nav h-auto justify-start"
                  aria-label={tr("Sezioni del cantiere")}>
                  {schedeDisponibili.map(({ id, nome, icona: Icona }) => (
                    <TabsTrigger key={id} value={id}><Icona aria-hidden="true" />{tr(nome)}</TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <label className="generale-cantiere-vista-mobile min-w-0 text-xs font-medium">
                <span>{tr("Sezione")}</span>
                <UniformSelect aria-label={tr("Vista del cantiere")} value={vista} onChange={e => setVista(e.target.value)}
                  className="h-8 w-full min-w-0 bg-background pl-2.5 font-normal">
                  {schedeDisponibili.map(({ id, nome }) => <option key={id} value={id}>{tr(nome)}</option>)}
                </UniformSelect>
              </label>
              <div className="generale-cantiere-ambito">
                {riepilogo.figlie.length > 12 ? <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
                  <span>{tr("Ambito")}</span>
                  <AmbitoOperazione fissi={[{ id: TUTTA, nome: tr("Tutta l’operazione") }, { id: g.id, nome: tr("Commessa generale"), codice: g.codice }]}
                    figlie={riepilogo.figlie} valore={tutta ? TUTTA : orderId} onChange={setAmbito} />
                </div> : <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
                  <span>{tr("Ambito")}</span>
                  <UniformSelect aria-label={tr("Ambito del cantiere")} value={tutta ? TUTTA : orderId}
                    onChange={e => setAmbito(e.target.value)}
                    className="h-8 min-w-0 flex-1 rounded-md border bg-background pl-2.5 font-normal">
                    {riepilogo.figlie.length > 0 && <option value={TUTTA}>{tr("Tutta l’operazione")}</option>}
                    <option value={g.id}>{tr("Commessa generale · {tipo}", { tipo: g.codice ?? g.nome })}</option>
                    {riepilogo.figlie.length > 0 && (
                      <optgroup label={tr(DEFINIZIONI_MODELLI[g.modello].figlia.tante)}>
                        {riepilogo.figlie.map(f => <option key={f.id} value={f.id}>{[f.nome, f.codice].filter(Boolean).join(" · ")}</option>)}
                      </optgroup>
                    )}
                  </UniformSelect>
                </label>}
              </div>
              {!usaRegistro && comandi && <div className="generale-cantiere-comandi">{comandi}</div>}
            </div>

            <Suspense fallback={<Skeleton className="mt-4 h-64 w-full" />}>
              {nuovoOda && puoCreareOda && <NuovoOda key={g.id} open onOpenChange={setNuovoOda}
                orderId={g.id} orderCode={g.codice} items={righeAcquisto} />}
              {vista === "lavorazioni" ? (
                <TabsContent value="lavorazioni" className="mt-2.5">
                  {tornaAlCrono && <Button type="button" size="sm" variant="outline" className="mb-2 h-10 max-w-full"
                    onClick={() => setVista("cronoprogramma")}>
                    <ArrowLeft className="size-4" aria-hidden="true" /> {tr("Torna al cronoprogramma")}
                  </Button>}
                  <div className={riepilogo.figlie.length ? "grid min-w-0 items-start gap-2 lg:grid-cols-[12rem_minmax(0,1fr)]" : undefined}>
                    {riepilogo.figlie.length > 0 && <IndiceLavorazioni riepilogo={riepilogo} attiva={orderId} tutta={tutta}
                      apriTutte={() => setAmbito(TUTTA)} apriCommessa={setAmbito} />}
                    <div className="min-w-0 space-y-2">
                      {tutta ? (
                        <MovimentiOperazione riepilogo={riepilogo} vista="lavorazioni" onApri={setAmbito}
                          onApriRapportino={(id, reportId) => setAmbito(id, undefined, "rapportini", reportId)} />
                      ) : <>
                        {orderId === g.id && puoModificare && g.modello !== "appalto" && riepilogo.permessi.margini && (
                          <InvitoFasiDalPiano riepilogo={riepilogo} />
                        )}
                        <Lavorazioni key={orderId} orderId={orderId} orderCode={scelto.codice} figlia={!!figlia}
                          importo={figlia ? figlia.importo : g.valore} fase={fase} onApriCronoprogramma={() => setVista("cronoprogramma")} />
                        {effectiveCompany?.id && permessi.canViewOrders && g.modello !== "appalto" && (
                          <Sezione id="computi" titolo={tr("Computi del cantiere")}>
                            <Computo key={`${orderId}:${parametri.get("computo") ?? ""}`} orderId={orderId} companyId={effectiveCompany.id}
                              canEdit={puoModificare} canViewAmounts={riepilogo.permessi.importi} orderLabel={scelto.codice}
                              computoInizialeId={parametri.get("computo") || undefined} />
                          </Sezione>
                        )}
                      </>}
                    </div>
                  </div>
                </TabsContent>
              ) : vista === "materiali" ? (
                <TabsContent value="materiali" className="mt-2.5 min-w-0">
                  {tutta ? <MaterialiOperazione riepilogo={riepilogo} apri={(id, ricerca) => {
                      setAmbito(id);
                      if (ricerca) setAperturaMateriali({ id, ricerca });
                    }}
                    genera={puoModificare && permessi.canEditOrders && !permessi.solaLettura ? (id, computoId) => {
                      setAmbito(id);
                      setAperturaMateriali({ id, genera: true, computoId });
                    } : undefined}
                    apriProposte={puoModificare && permessi.canEditOrders && !permessi.solaLettura ? (id, faseProposte) => {
                      setAmbito(id);
                      setAperturaMateriali({ id, faseProposte });
                    } : undefined} />
                    : <MaterialiAmbito key={`${orderId}:${faseMateriali ?? ""}:${cercaMateriale ?? ""}`} orderId={orderId} orderCode={scelto.codice}
                      nome={figlia ? figlia.nome : tr("Materiali della generale")} puoModificare={puoModificare}
                      generaIniziale={aperturaMateriali?.id === orderId && aperturaMateriali.genera}
                      computoIniziale={aperturaMateriali?.id === orderId ? aperturaMateriali.computoId : undefined}
                      faseProposteIniziale={aperturaMateriali?.id === orderId ? aperturaMateriali.faseProposte : undefined}
                      faseIniziale={faseMateriali}
                      ricercaIniziale={cercaMateriale ?? (aperturaMateriali?.id === orderId ? aperturaMateriali.ricerca : undefined)}
                      apriRiepilogo={riepilogo.figlie.length > 0 ? () => setAmbito(TUTTA) : undefined}
                      apriOrdini={() => setVista("acquisti")} />}
                </TabsContent>
              ) : mostraControllo ? (
                <TabsContent value="acquisti" className="mt-2.5">
                  <Riconciliazione key={tutta ? TUTTA : orderId} riepilogo={riepilogo} commessaId={tutta ? undefined : orderId}
                    onApriFase={setAmbito} onApriPagamenti={() => setVista("contabilita")} />
                </TabsContent>
              ) : vista === "offerte" ? (
                <TabsContent value="offerte" className="mt-2.5">
                  <Offerte key={tutta ? TUTTA : orderId} orderId={orderId} orderCode={scelto.codice}
                    commesse={tutta ? [g, ...riepilogo.figlie] : undefined} />
                </TabsContent>
              ) : usaRegistro && vistaOperazione ? (
                <TabsContent value={vista} className="mt-2.5">
                  <MovimentiOperazione riepilogo={riepilogo} vista={vistaOperazione} onApri={setAmbito} azioni={comandi}
                    onApriMateriali={apriMaterialiFase}
                    commessaId={tutta ? undefined : orderId} onApriRapportino={(id, reportId) => setAmbito(id, undefined, "rapportini", reportId)} />
                </TabsContent>
              ) : (
              <>
              <TabsContent value="rapportini" className="mt-2.5 space-y-4">
                <Sezione id="rapportini" titolo={tr("Rapportini")}>
                  <DaApprovare key={`approva-${orderId}`} orderId={orderId} />
                  {puoModificare && (
                    <RapportiniUfficio
                      key={orderId}
                      orderId={orderId}
                      className="border"
                    />
                  )}
                  <Rapportini
                    key={`${orderId}:${rapportino ?? ""}`}
                    orderId={orderId}
                    rapportinoIniziale={rapportino}
                    onChiudiRapportinoIniziale={() => setAmbito(orderId)}
                  />
                </Sezione>
              </TabsContent>
              <TabsContent value="cronoprogramma" className="mt-2.5">
                <Cronoprogramma key={orderId} orderId={orderId} onApriLavorazioni={() => setVista("lavorazioni")} />
              </TabsContent>
              <TabsContent value="acquisti" className="mt-2.5 space-y-4">
                <Forniture
                    key={orderId}
                    orderId={orderId}
                    orderCode={scelto.codice}
                    items={righeAcquisto}
                />
              </TabsContent>
              <TabsContent value="ddt" className="mt-2.5 space-y-3">
                <Bolle
                    key={`bolle-${orderId}`}
                    orderId={orderId}
                    puoAprireDocumenti={permessi.canViewOrders}
                />
              </TabsContent>
              {costi && (
                <TabsContent value="contabilita" className="mt-2.5 space-y-4">
                  <Sezione id="fatture" titolo={tr("Fatture e costi")}>
                    <Fatture
                      key={orderId}
                      orderId={orderId}
                      mostraImporti
                      puoAprireFatture={permessi.canViewBilling}
                      puoModificare={puoModificare}
                    />
                    <Costi
                      key={`costi-${orderId}`}
                      orderId={orderId}
                      puoModificare={puoModificare}
                    />
                  </Sezione>
                  <Sezione id="pagamenti" titolo={tr("Pagamenti")}>
                    <Pagamenti
                      key={orderId}
                      orderId={orderId}
                      onApriSubappalti={() => setVista("subappalti")}
                    />
                  </Sezione>
                </TabsContent>
              )}
              <TabsContent value="squadre" className="mt-2.5 space-y-4">
                <Sezione id="squadre" titolo={tr("Squadre, ore e accessi")}>
                  <Squadre
                    key={orderId}
                    orderId={orderId}
                    editable={puoModificare}
                  />
                </Sezione>
                {costi && (
                  <Sezione id="subappalti" titolo={tr("Ditte e subappalti")}>
                    <p className="text-sm text-muted-foreground">
                      {tr("Le ore di una ditta nei rapportini contano la presenza: il costo della ditta arriva dalla sua fattura o dal SAL, se non ha un listino.")}
                    </p>
                    <Subappalti
                      key={orderId}
                      orderId={orderId}
                      onApriCantiere={() => setVista("lavorazioni")}
                    />
                  </Sezione>
                )}
              </TabsContent>
              </>
              )}
            </Suspense>
          </Tabs>
        </DocumentiInPopup>
      </section>
    </AspettoOperativoProvider>
  );
}

export const modulo: ModuloScheda = {
  pronto: true,
  titolo: "Cantiere",
  telefono: true,
  Scheda: CantiereGenerale,
};
