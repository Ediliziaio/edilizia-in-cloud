import { UniformSelect } from "@/components/ui/uniform-select";
import { lazy, Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  HardHat,
  PackageCheck,
  ReceiptText,
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
import { useAuth } from "@/contexts/AuthContext";
import type { ModuloScheda, PropsScheda } from "../tipiScheda";
import { MovimentiOperazione } from "./MovimentiOperazione";

/** Valore del selettore per «tutta l'operazione»: generale e figlie insieme, sola lettura. */
const TUTTA = "__tutta__";

/**
 * Le schede del cantiere (15/11/2026: erano otto, sono quattro). Le sezioni di prima restano
 * come parti di una scheda: un collegamento vecchio (?vista-cantiere=pagamenti) apre la scheda
 * che la contiene e scorre fino alla sezione.
 */
type Scheda = "rapportini" | "acquisti" | "contabilita" | "squadre";
const SCHEDA_DELLA_SEZIONE: Record<string, Scheda> = {
  rapportini: "rapportini",
  lavorazioni: "rapportini",
  acquisti: "acquisti",
  forniture: "acquisti",
  controllo: "acquisti",
  contabilita: "contabilita",
  fatture: "contabilita",
  pagamenti: "contabilita",
  squadre: "squadre",
  subappalti: "squadre",
};
/** In «Tutta l'operazione» ogni scheda ha il suo elenco unico. */
const VISTA_OPERAZIONE: Record<Scheda, string> = {
  rapportini: "rapportini",
  acquisti: "forniture",
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
const Squadre = lazy(() =>
  import("@/components/orders/OrderLaborCosts").then((m) => ({
    default: m.OrderLaborCosts,
  })),
);
const Lavorazioni = lazy(() =>
  import("@/components/orders/OrderWorkPhases").then((m) => ({
    default: m.OrderWorkPhases,
  })),
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
  const setVista = (x: string) => {
    const p = new URLSearchParams(parametri);
    p.set("vista-cantiere", x);
    setParametri(p, { replace: true });
  };
  // Un collegamento a una sezione di prima (pagamenti, controllo…) scorre fino a lei.
  useEffect(() => {
    if (!richiesta || richiesta === scheda) return;
    const t = window.setTimeout(() => document.getElementById(`cantiere-${richiesta}`)?.scrollIntoView({ block: "start" }), 300);
    return () => window.clearTimeout(t);
  }, [richiesta, scheda]);
  const [ambito, setAmbito] = useState(g.id);
  const tutta = ambito === TUTTA && riepilogo.figlie.length > 0;
  const scelto =
    ambito === g.id || tutta ? g : (riepilogo.figlie.find((f) => f.id === ambito) ?? g);
  const orderId = scelto.id;
  const permessi = usePermissions();
  const { effectiveCompany } = useAuth();
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
          titolo="Un cantiere per l'intera operazione"
          descrizione={`Rapportini, acquisti, DDT, fatture, pagamenti e subappalti su ${g.codice ?? g.nome}. Le commesse collegate sono facoltative.`}
        />
        <DocumentiInPopup orderId={orderId}>
          <Tabs className="space-y-4" value={vista} onValueChange={setVista}>
            <TabsList
              className="generale-subtabs generale-section-navigation h-auto flex-wrap justify-start"
              aria-label="Sezioni del cantiere"
            >
              <TabsTrigger value="rapportini">
                <ClipboardList className="mr-2 h-4 w-4" />
                Rapportini e lavorazioni
              </TabsTrigger>
              <TabsTrigger value="acquisti">
                <PackageCheck className="mr-2 h-4 w-4" />
                Acquisti e DDT
              </TabsTrigger>
              {costi && (
                <TabsTrigger value="contabilita">
                  <ReceiptText aria-hidden="true" />
                  Fatture e pagamenti
                </TabsTrigger>
              )}
              <TabsTrigger value="squadre">
                <Users aria-hidden="true" />
                Squadre e ditte
              </TabsTrigger>
            </TabsList>
            <div className="generale-toolbar">
              <label className="mt-4 block max-w-xl text-sm font-medium">
                Registra e consulta su
                <UniformSelect
                  aria-label="Ambito del cantiere"
                  value={tutta ? TUTTA : orderId}
                  onChange={(e) => setAmbito(e.target.value)}
                  className="mt-1 block h-10 w-full rounded-md border bg-background px-3 font-normal"
                >
                  {riepilogo.figlie.length > 0 && (
                    <option value={TUTTA}>
                      Tutta l'operazione · generale e {riepilogo.figlie.length} {riepilogo.figlie.length === 1 ? "commessa" : "commesse"} (consulta)
                    </option>
                  )}
                  <option value={g.id}>
                    Commessa generale · {g.codice ?? g.nome}
                  </option>
                  {/* Il cantiere si registra sulla generale; le commesse dentro stanno in un gruppo
                      a parte, sotto (un'operazione può averne 26). */}
                  {riepilogo.figlie.length > 0 && (
                    <optgroup label={`${DEFINIZIONI_MODELLI[g.modello].figlia.tante} (${riepilogo.figlie.length}) — solo ciò che è di una di loro`}>
                      {riepilogo.figlie.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.codice} · {f.nome}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </UniformSelect>
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                {tutta ? (
                  <>Elenchi unici di generale e commesse. Per registrare, scegli dove: la generale o una commessa (basta un clic sul codice).</>
                ) : (
                  <>
                    Società titolare:{" "}
                    <strong>{effectiveCompany?.name ?? "azienda attiva"}</strong>.
                    Documenti, costi e pagamenti appartengono a questa società.
                  </>
                )}
              </p>
            </div>

            <Suspense fallback={<Skeleton className="mt-4 h-64 w-full" />}>
                {tutta ? (
                <div className="pt-2">
                  <MovimentiOperazione riepilogo={riepilogo} vista={VISTA_OPERAZIONE[scheda]} onApri={setAmbito} />
                </div>
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
                <Sezione id="lavorazioni" titolo="Lavorazioni e avanzamento">
                  {orderId === g.id && puoModificare && g.modello !== "appalto" && riepilogo.permessi.margini && (
                    <InvitoFasiDalPiano riepilogo={riepilogo} />
                  )}
                  <Lavorazioni
                    key={orderId}
                    orderId={orderId}
                    orderCode={scelto.codice}
                  />
                </Sezione>
              </TabsContent>
              <TabsContent value="acquisti" className="space-y-6 pt-2">
                <Sezione id="forniture" titolo="Ordini e DDT">
                  <p className="text-sm text-muted-foreground">
                    L'ordine al fornitore è facoltativo: «Carica bolla» registra la merce anche senza,
                    e la fattura si collega dopo.
                  </p>
                  <Forniture
                    key={orderId}
                    orderId={orderId}
                    orderCode={scelto.codice}
                    items={[]}
                  />
                  <Bolle
                    key={`bolle-${orderId}`}
                    orderId={orderId}
                    puoAprireDocumenti={permessi.canViewOrders}
                  />
                </Sezione>
                {costi && (
                  <Sezione id="controllo" titolo="Controllo: ordini, bolle e fatture">
                    <Riconciliazione riepilogo={riepilogo} />
                  </Sezione>
                )}
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
  telefono: false,
  Scheda: CantiereGenerale,
};
