import { UniformSelect } from "@/components/ui/uniform-select";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  FileQuestion,
  ListTree,
  ListTodo,
  Plus,
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
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { eMateriale } from "@/lib/distinta/elencoArticoli";
import { useMaterialiPerFase } from "@/hooks/useMaterialiPerFase";
import type { VistaOperazione } from "@/hooks/useMovimentiOperazione";
import type { ModuloScheda, PropsScheda } from "../tipiScheda";
import { MovimentiOperazione } from "./MovimentiOperazione";

/** Valore del selettore per «tutta l'operazione»: generale e figlie insieme, sola lettura. */
const TUTTA = "__tutta__";

const SCHEDE = [
  { id: "da-seguire", nome: "Da seguire", icona: ListTodo },
  { id: "rapportini", nome: "Rapportini", icona: ClipboardList },
  { id: "lavorazioni", nome: "Lavorazioni", icona: ListTree },
  { id: "cronoprogramma", nome: "Cronoprogramma", icona: CalendarRange },
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
  cronoprogramma: "cronoprogramma",
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
  lavorazioni: "lavorazioni",
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
  const g = riepilogo.generale;
  const [parametri, setParametri] = useSearchParams();
  const costi = riepilogo.permessi.costi;
  const schedeDisponibili = costi ? SCHEDE : SCHEDE.filter(s => s.id !== "contabilita");
  const richiesta = parametri.get("vista-cantiere") ?? "";
  const scheda: Scheda = (() => {
    const s = Object.hasOwn(SCHEDA_DELLA_SEZIONE, richiesta) ? SCHEDA_DELLA_SEZIONE[richiesta] : undefined;
    // Senza il permesso dei costi la scheda delle fatture non c'è.
    return !s || (s === "contabilita" && !costi) ? "da-seguire" : s;
  })();
  const vista = scheda;
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
  const setVista = (x: string) => {
    const p = new URLSearchParams(parametri);
    p.set("vista-cantiere", x);
    p.delete("fase-cantiere");
    setNuovoOda(false);
    setParametri(p, { replace: true });
  };
  // I link diretti ai pagamenti o ai subappalti conservano la loro sezione.
  useEffect(() => {
    if (!["pagamenti", "subappalti"].includes(richiesta)) return;
    const t = window.setTimeout(() => document.getElementById(`cantiere-${richiesta}`)?.scrollIntoView({ block: "start" }), 300);
    return () => window.clearTimeout(t);
  }, [richiesta, scheda]);
  const [nuovoOda, setNuovoOda] = useState(false);
  const ambitoUrl = parametri.get("ambito-cantiere");
  const sezioneSingola = ["pagamenti", "subappalti"].includes(richiesta);
  const ambito = ambitoUrl === g.id || ambitoUrl === TUTTA || riepilogo.figlie.some(f => f.id === ambitoUrl)
    ? ambitoUrl
    : riepilogo.figlie.length && !sezioneSingola ? TUTTA : g.id;
  const fase = parametri.get("fase-cantiere");
  const setAmbito = (id: string, faseId?: string, schedaDaAprire?: Scheda) => {
    setNuovoOda(false);
    const p = new URLSearchParams(parametri);
    p.set("ambito-cantiere", id);
    if (schedaDaAprire) p.set("vista-cantiere", schedaDaAprire);
    if (faseId) {
      p.set("vista-cantiere", "lavorazioni");
      p.set("fase-cantiere", faseId);
    }
    else p.delete("fase-cantiere");
    setParametri(p, { replace: true });
  };
  const tutta = ambito === TUTTA && riepilogo.figlie.length > 0;
  const figlia = riepilogo.figlie.find(f => f.id === ambito);
  const scelto = figlia ?? g;
  const orderId = scelto.id;
  const permessi = usePermissions();
  const puoCreareOda = puoModificare && !permessi.solaLettura && permessi.canViewCosts && permessi.canEditOrders;
  const navigaForniture = vista === "acquisti" && costi;
  const creaOdaGenerale = navigaForniture && tutta && !mostraControllo && puoCreareOda;
  const gestisciFasiGenerale = vista === "lavorazioni" && tutta && puoModificare;
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
        aria-label="Cantiere della commessa generale"
        className="generale-cantiere min-w-0"
      >
        <DocumentiInPopup orderId={orderId}>
          <Tabs className="min-w-0" value={vista} onValueChange={setVista}>
            <div className="generale-cantiere-toolbar">
              <div ref={scorrimentoSchede} className="generale-cantiere-scroll min-w-0 overflow-x-auto">
                <TabsList className="generale-subtabs generale-section-navigation generale-cantiere-nav h-auto justify-start"
                  aria-label="Sezioni del cantiere">
                  {schedeDisponibili.map(({ id, nome, icona: Icona }) => (
                    <TabsTrigger key={id} value={id}><Icona aria-hidden="true" />{nome}</TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <label className="generale-cantiere-vista-mobile min-w-0 text-xs font-medium">
                <span>Sezione</span>
                <UniformSelect aria-label="Vista del cantiere" value={vista} onChange={e => setVista(e.target.value)}
                  className="h-8 w-full min-w-0 bg-background pl-2.5 font-normal">
                  {schedeDisponibili.map(({ id, nome }) => <option key={id} value={id}>{nome}</option>)}
                </UniformSelect>
              </label>
              <div className="generale-cantiere-ambito">
                <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
                  <span>Ambito</span>
                  <UniformSelect aria-label="Ambito del cantiere" value={tutta ? TUTTA : orderId}
                    onChange={e => setAmbito(e.target.value)}
                    className="h-8 min-w-0 flex-1 rounded-md border bg-background pl-2.5 font-normal">
                    {riepilogo.figlie.length > 0 && <option value={TUTTA}>Tutta l’operazione</option>}
                    <option value={g.id}>Commessa generale · {g.codice ?? g.nome}</option>
                    {riepilogo.figlie.length > 0 && (
                      <optgroup label={DEFINIZIONI_MODELLI[g.modello].figlia.tante}>
                        {riepilogo.figlie.map(f => <option key={f.id} value={f.id}>{[f.nome, f.codice].filter(Boolean).join(" · ")}</option>)}
                      </optgroup>
                    )}
                  </UniformSelect>
                </label>
              </div>
            </div>

            {(navigaForniture || gestisciFasiGenerale) && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                {navigaForniture && (
                  <div role="group" aria-label="Vista ordini d’acquisto" className="flex w-fit flex-wrap gap-0.5 rounded-lg border bg-card p-0.5">
                    <Button type="button" size="sm" variant={mostraControllo ? "ghost" : "secondary"} aria-pressed={!mostraControllo} onClick={() => setVista("acquisti")}>
                      <PackageCheck className="size-4" aria-hidden="true" /> Ordini
                    </Button>
                    <Button type="button" size="sm" variant={mostraControllo ? "secondary" : "ghost"} aria-pressed={mostraControllo} onClick={() => setVista("controllo")}>
                      <ClipboardCheck className="size-4" aria-hidden="true" /> Controllo forniture
                    </Button>
                  </div>
                )}
                {creaOdaGenerale && (
                  <Button type="button" size="sm" className="ml-auto gap-1.5" onClick={() => setNuovoOda(true)}>
                    <Plus className="size-4" aria-hidden="true" /> Nuovo OdA sulla generale
                  </Button>
                )}
                {gestisciFasiGenerale && (
                  <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => setAmbito(g.id)}>
                    Gestisci fasi della generale
                  </Button>
                )}
              </div>
            )}

            <Suspense fallback={<Skeleton className="mt-4 h-64 w-full" />}>
              {nuovoOda && puoCreareOda && <NuovoOda key={g.id} open onOpenChange={setNuovoOda}
                orderId={g.id} orderCode={g.codice} items={righeAcquisto} />}
              {mostraControllo ? (
                <TabsContent value="acquisti" className="mt-2.5">
                  <Riconciliazione key={tutta ? TUTTA : orderId} riepilogo={riepilogo} commessaId={tutta ? undefined : orderId}
                    onApriFase={setAmbito} onApriPagamenti={() => setVista("contabilita")} />
                </TabsContent>
              ) : vista === "offerte" ? (
                <TabsContent value="offerte" className="mt-2.5">
                  <Offerte key={tutta ? TUTTA : orderId} orderId={orderId} orderCode={scelto.codice}
                    commesse={tutta ? [g, ...riepilogo.figlie] : undefined} />
                </TabsContent>
              ) : (tutta || vista === "da-seguire") && vistaOperazione ? (
                <TabsContent value={vista} className="mt-2.5">
                  <MovimentiOperazione riepilogo={riepilogo} vista={vistaOperazione} onApri={setAmbito}
                    commessaId={tutta ? undefined : orderId} onApriRapportini={id => setAmbito(id, undefined, "rapportini")} />
                  {vista === "ddt" && costi && <Button className="mt-3" type="button" size="sm" variant="outline" onClick={() => setVista("controllo")}>
                    Controllo forniture <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>}
                </TabsContent>
              ) : (
              <>
              <TabsContent value="rapportini" className="mt-2.5 space-y-4">
                <Sezione id="rapportini" titolo="Rapportini">
                  {puoModificare && (
                    <RapportiniUfficio
                      key={orderId}
                      orderId={orderId}
                      className="border"
                    />
                  )}
                  <DaApprovare key={`approva-${orderId}`} orderId={orderId} />
                  <Rapportini key={`rapporti-${orderId}`} orderId={orderId} />
                </Sezione>
              </TabsContent>
              <TabsContent value="lavorazioni" className="mt-2.5 space-y-3">
                {orderId === g.id && puoModificare && g.modello !== "appalto" && riepilogo.permessi.margini && (
                  <InvitoFasiDalPiano riepilogo={riepilogo} />
                )}
                <Lavorazioni key={orderId} orderId={orderId} orderCode={scelto.codice} figlia={!!figlia}
                  importo={figlia ? figlia.importo : g.valore} fase={fase} onApriCronoprogramma={() => setVista("cronoprogramma")} />
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
                {costi && <Button type="button" size="sm" variant="outline" onClick={() => setVista("controllo")}>
                  Controllo forniture <ArrowRight className="size-4" aria-hidden="true" />
                </Button>}
              </TabsContent>
              {costi && (
                <TabsContent value="contabilita" className="mt-2.5 space-y-4">
                  <Sezione id="fatture" titolo="Fatture e costi">
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
                  <Sezione id="pagamenti" titolo="Pagamenti">
                    <Pagamenti
                      key={orderId}
                      orderId={orderId}
                      onApriSubappalti={() => setVista("subappalti")}
                    />
                  </Sezione>
                </TabsContent>
              )}
              <TabsContent value="squadre" className="mt-2.5 space-y-4">
                <Sezione id="squadre" titolo="Squadre, ore e accessi">
                  <Squadre
                    key={orderId}
                    orderId={orderId}
                    editable={puoModificare}
                  />
                </Sezione>
                {costi && (
                  <Sezione id="subappalti" titolo="Ditte e subappalti">
                    <p className="text-sm text-muted-foreground">
                      Le ore di una ditta nei rapportini contano la presenza: il costo della ditta
                      arriva dalla sua fattura o dal SAL, se non ha un listino.
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
