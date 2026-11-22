import { UniformSelect } from "@/components/ui/uniform-select";
import { lazy, Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarRange,
  ClipboardList,
  FileQuestion,
  HardHat,
  ListTree,
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
import { IntestazioneScheda } from "../design/ElementiScheda";
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

type Scheda = "rapportini" | "lavorazioni" | "cronoprogramma" | "offerte" | "acquisti" | "ddt" | "contabilita" | "squadre";
const SCHEDA_DELLA_SEZIONE: Record<string, Scheda> = {
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
  const richiesta = parametri.get("vista-cantiere") ?? "";
  const scheda: Scheda = (() => {
    const s = SCHEDA_DELLA_SEZIONE[richiesta];
    // Senza il permesso dei costi la scheda delle fatture non c'è.
    return !s || (s === "contabilita" && !costi) ? "rapportini" : s;
  })();
  const vista = scheda;
  const vistaOperazione = VISTA_OPERAZIONE[scheda];
  const setVista = (x: string) => {
    const p = new URLSearchParams(parametri);
    p.set("vista-cantiere", x);
    p.delete("fase-cantiere");
    setNuovoOda(false);
    setParametri(p, { replace: true });
  };
  // Un collegamento a una sezione di prima (pagamenti, controllo…) scorre fino a lei.
  useEffect(() => {
    if (!richiesta || richiesta === scheda) return;
    const t = window.setTimeout(() => document.getElementById(`cantiere-${richiesta}`)?.scrollIntoView({ block: "start" }), 300);
    return () => window.clearTimeout(t);
  }, [richiesta, scheda]);
  const [nuovoOda, setNuovoOda] = useState(false);
  const ambitoUrl = parametri.get("ambito-cantiere");
  const sezioneSingola = ["controllo", "pagamenti", "subappalti"].includes(richiesta);
  const ambito = ambitoUrl === g.id || ambitoUrl === TUTTA || riepilogo.figlie.some(f => f.id === ambitoUrl)
    ? ambitoUrl
    : riepilogo.figlie.length && !sezioneSingola ? TUTTA : g.id;
  const fase = parametri.get("fase-cantiere");
  const setAmbito = (id: string, faseId?: string) => {
    setNuovoOda(false);
    const p = new URLSearchParams(parametri);
    p.set("ambito-cantiere", id);
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
  const materiali = useMaterialiPerFase(vista === "acquisti" && costi && (!tutta || nuovoOda) ? orderId : undefined);
  const righeAcquisto = (materiali.data?.righe ?? []).filter(eMateriale);
  const qc = useQueryClient();
  useEffect(() => {
    if (vista === "acquisti" && costi)
      void qc.invalidateQueries({ queryKey: ["generale-controllo-forniture"] });
  }, [qc, vista, orderId, costi]);
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
        className="generale-sheet generale-cantiere space-y-4"
      >
        <IntestazioneScheda
          icona={HardHat}
          titolo="Cantiere"
          descrizione="Consulta l’intera operazione o lavora sulla commessa che scegli."
        />
        <DocumentiInPopup orderId={orderId}>
          <Tabs className="space-y-4" value={vista} onValueChange={setVista}>
            <div className="overflow-x-auto pb-1">
              <TabsList className="generale-subtabs generale-section-navigation generale-cantiere-nav h-auto min-w-max justify-start lg:min-w-0"
                aria-label="Sezioni del cantiere">
                <TabsTrigger value="rapportini"><ClipboardList aria-hidden="true" />Rapportini</TabsTrigger>
                <TabsTrigger value="lavorazioni"><ListTree aria-hidden="true" />Lavorazioni</TabsTrigger>
                <TabsTrigger value="cronoprogramma"><CalendarRange aria-hidden="true" />Cronoprogramma</TabsTrigger>
                <TabsTrigger value="offerte"><FileQuestion aria-hidden="true" />Richieste d’offerta</TabsTrigger>
                <TabsTrigger value="acquisti"><PackageCheck aria-hidden="true" />Ordini d’acquisto</TabsTrigger>
                <TabsTrigger value="ddt"><Truck aria-hidden="true" />DDT</TabsTrigger>
                {costi && <TabsTrigger value="contabilita"><ReceiptText aria-hidden="true" />Costi e pagamenti</TabsTrigger>}
                <TabsTrigger value="squadre"><Users aria-hidden="true" />Squadre e ditte</TabsTrigger>
              </TabsList>
            </div>
            <div className="generale-toolbar flex flex-wrap items-center justify-between gap-3">
              <label className="flex w-full min-w-0 max-w-xl items-center gap-3 text-sm font-medium">
                <span>Ambito</span>
                <UniformSelect aria-label="Ambito del cantiere" value={tutta ? TUTTA : orderId}
                  onChange={e => setAmbito(e.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 font-normal">
                  {riepilogo.figlie.length > 0 && <option value={TUTTA}>Tutta l’operazione</option>}
                  <option value={g.id}>Commessa generale · {g.codice ?? g.nome}</option>
                  {riepilogo.figlie.length > 0 && (
                    <optgroup label={DEFINIZIONI_MODELLI[g.modello].figlia.tante}>
                      {riepilogo.figlie.map(f => <option key={f.id} value={f.id}>{f.codice} · {f.nome}</option>)}
                    </optgroup>
                  )}
                </UniformSelect>
              </label>
              {vista === "acquisti" && tutta && puoCreareOda && (
                <Button type="button" size="sm" className="gap-1.5" onClick={() => setNuovoOda(true)}>
                  <Plus className="size-4" aria-hidden="true" /> Nuovo OdA sulla generale
                </Button>
              )}
              {vista === "lavorazioni" && tutta && puoModificare && (
                <Button type="button" size="sm" variant="outline" onClick={() => setAmbito(g.id)}>
                  Gestisci fasi della generale
                </Button>
              )}
              {!tutta && riepilogo.figlie.length > 0 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setAmbito(TUTTA)}>
                  <ArrowLeft className="size-4" aria-hidden="true" /> Tutta l’operazione
                </Button>
              )}
            </div>

            <Suspense fallback={<Skeleton className="mt-4 h-64 w-full" />}>
              {nuovoOda && puoCreareOda && <NuovoOda key={g.id} open onOpenChange={setNuovoOda}
                orderId={g.id} orderCode={g.codice} items={righeAcquisto} />}
              {vista === "offerte" ? (
                <TabsContent value="offerte" className="pt-2">
                  <Offerte key={tutta ? TUTTA : orderId} orderId={orderId} orderCode={scelto.codice}
                    commesse={tutta ? [g, ...riepilogo.figlie] : undefined} />
                </TabsContent>
              ) : tutta && vistaOperazione ? (
                <TabsContent value={vista} className="pt-2">
                  <MovimentiOperazione riepilogo={riepilogo} vista={vistaOperazione} onApri={setAmbito} />
                </TabsContent>
              ) : (
              <>
              <TabsContent value="rapportini" className="space-y-6 pt-2">
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
              <TabsContent value="lavorazioni" className="space-y-4 pt-2">
                {orderId === g.id && puoModificare && g.modello !== "appalto" && riepilogo.permessi.margini && (
                  <InvitoFasiDalPiano riepilogo={riepilogo} />
                )}
                <Lavorazioni key={orderId} orderId={orderId} orderCode={scelto.codice} figlia={!!figlia}
                  importo={figlia ? figlia.importo : g.valore} fase={fase} onApriCronoprogramma={() => setVista("cronoprogramma")} />
              </TabsContent>
              <TabsContent value="cronoprogramma" className="pt-2">
                <Cronoprogramma key={orderId} orderId={orderId} onApriLavorazioni={() => setVista("lavorazioni")} />
              </TabsContent>
              <TabsContent value="acquisti" className="space-y-6 pt-2">
                <Sezione id="forniture" titolo="Ordini d’acquisto">
                  <Forniture
                    key={orderId}
                    orderId={orderId}
                    orderCode={scelto.codice}
                    items={righeAcquisto}
                  />
                </Sezione>
                {costi && (
                  <Sezione id="controllo" titolo="Controllo: ordini, bolle e fatture">
                    <Riconciliazione riepilogo={riepilogo} />
                  </Sezione>
                )}
              </TabsContent>
              <TabsContent value="ddt" className="space-y-4 pt-2">
                <Sezione id="ddt" titolo="Documenti di trasporto">
                  <Bolle
                    key={`bolle-${orderId}`}
                    orderId={orderId}
                    puoAprireDocumenti={permessi.canViewOrders}
                  />
                </Sezione>
              </TabsContent>
              {costi && (
                <TabsContent value="contabilita" className="space-y-6 pt-2">
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
              <TabsContent value="squadre" className="space-y-6 pt-2">
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
