import { lazy, Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ClipboardList,
  HardHat,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AspettoOperativoProvider } from "../design/ContestoOperativo";
import { DocumentiInPopup } from "@/components/orders/DocumentiInPopup";
import { IntestazioneScheda } from "../design/ElementiScheda";
import { DEFINIZIONI_MODELLI } from "@/lib/orders/commesseGenerali";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import type { ModuloScheda, PropsScheda } from "../tipiScheda";

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
  const viste = [
    "rapportini",
    "forniture",
    "squadre",
    "lavorazioni",
    ...(riepilogo.permessi.costi
      ? ["fatture", "pagamenti", "subappalti", "controllo"]
      : []),
  ];
  const richiesta = parametri.get("vista-cantiere");
  const vista =
    richiesta && viste.includes(richiesta) ? richiesta : "rapportini";
  const setVista = (x: string) => {
    const p = new URLSearchParams(parametri);
    p.set("vista-cantiere", x);
    setParametri(p, { replace: true });
  };
  const [ambito, setAmbito] = useState(g.id);
  const scelto =
    ambito === g.id ? g : (riepilogo.figlie.find((f) => f.id === ambito) ?? g);
  const orderId = scelto.id;
  const permessi = usePermissions();
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (vista === "controllo")
      void qc.invalidateQueries({ queryKey: ["generale-controllo-forniture"] });
  }, [qc, vista, orderId]);
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
                Rapportini e bolle
              </TabsTrigger>
              <TabsTrigger value="forniture">
                <PackageCheck className="mr-2 h-4 w-4" />
                Forniture e DDT
              </TabsTrigger>
              <TabsTrigger value="squadre">
                <HardHat className="mr-2 h-4 w-4" />
                Squadre e accessi
              </TabsTrigger>
              <TabsTrigger value="lavorazioni">
                <ClipboardList aria-hidden="true" />
                Lavorazioni e contratti
              </TabsTrigger>
              {riepilogo.permessi.costi && (
                <>
                  <TabsTrigger value="fatture">
                    <ReceiptText aria-hidden="true" />
                    Fatture e costi
                  </TabsTrigger>
                  <TabsTrigger value="pagamenti">
                    <Wallet aria-hidden="true" />
                    Pagamenti
                  </TabsTrigger>
                  <TabsTrigger value="subappalti">
                    <Users aria-hidden="true" />
                    Subappaltatori
                  </TabsTrigger>
                  <TabsTrigger value="controllo">
                    <ShieldCheck aria-hidden="true" />
                    Controllo forniture
                  </TabsTrigger>
                </>
              )}
            </TabsList>
            <div className="generale-toolbar">
              <label className="mt-4 block max-w-xl text-sm font-medium">
                Registra e consulta su
                <select
                  aria-label="Ambito del cantiere"
                  value={orderId}
                  onChange={(e) => setAmbito(e.target.value)}
                  className="mt-1 block h-10 w-full rounded-md border bg-background px-3 font-normal"
                >
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
                </select>
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                Società titolare:{" "}
                <strong>{effectiveCompany?.name ?? "azienda attiva"}</strong>.
                Documenti, costi e pagamenti appartengono a questa società. Per
                una SPV diversa seleziona la sua azienda nel portale prima di
                creare l'operazione.
              </p>
            </div>
            <nav
              className="generale-document-flow"
              aria-label="Percorso documenti del cantiere"
            >
              <button type="button" onClick={() => setVista("forniture")}>
                <PackageCheck aria-hidden="true" />
                <span>
                  Ordine <small>facoltativo</small>
                </span>
              </button>
              <ArrowRight aria-hidden="true" />
              <button type="button" onClick={() => setVista("forniture")}>
                <ClipboardList aria-hidden="true" />
                <span>
                  DDT <small>anche senza ordine</small>
                </span>
              </button>
              {riepilogo.permessi.costi && (
                <>
                  <ArrowRight aria-hidden="true" />
                  <button type="button" onClick={() => setVista("fatture")}>
                    <ReceiptText aria-hidden="true" />
                    <span>
                      Fattura <small>un solo costo</small>
                    </span>
                  </button>
                  <ArrowRight aria-hidden="true" />
                  <button type="button" onClick={() => setVista("pagamenti")}>
                    <Wallet aria-hidden="true" />
                    <span>
                      Pagamento <small>saldo e residuo</small>
                    </span>
                  </button>
                </>
              )}
            </nav>

            <Suspense fallback={<Skeleton className="mt-4 h-64 w-full" />}>
              <TabsContent value="rapportini" className="space-y-4 pt-2">
                {puoModificare && (
                  <RapportiniUfficio
                    key={orderId}
                    orderId={orderId}
                    className="border"
                  />
                )}
                <DaApprovare key={`approva-${orderId}`} orderId={orderId} />
                <Rapportini key={`rapporti-${orderId}`} orderId={orderId} />
              </TabsContent>
              <TabsContent value="forniture" className="space-y-3 pt-2">
                <p className="text-sm text-muted-foreground">
                  Puoi partire da «Carica bolla» senza un ordine d'acquisto e
                  collegare la fattura in seguito. Se la merce è ordinata, apri
                  l'ordine per gestire arrivi e DDT del fornitore.
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
              </TabsContent>
              <TabsContent value="squadre" className="pt-2">
                <Squadre
                  key={orderId}
                  orderId={orderId}
                  editable={puoModificare}
                />
              </TabsContent>
              <TabsContent value="lavorazioni" className="pt-2">
                <Lavorazioni
                  key={orderId}
                  orderId={orderId}
                  orderCode={scelto.codice}
                />
              </TabsContent>
              {riepilogo.permessi.costi && (
                <>
                  <TabsContent value="fatture" className="space-y-4 pt-2">
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
                  </TabsContent>
                  <TabsContent value="pagamenti" className="pt-2">
                    <Pagamenti
                      key={orderId}
                      orderId={orderId}
                      onApriSubappalti={() => setVista("subappalti")}
                    />
                  </TabsContent>
                  <TabsContent value="subappalti" className="pt-2">
                    <Subappalti
                      key={orderId}
                      orderId={orderId}
                      onApriCantiere={() => setVista("lavorazioni")}
                    />
                  </TabsContent>
                  <TabsContent value="controllo" className="pt-2">
                    <Riconciliazione riepilogo={riepilogo} />
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
