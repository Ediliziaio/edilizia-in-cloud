import { OdaNoteCard } from "@/components/orders/OdaNoteCard";
import { PurchaseOrderItemRow } from "@/components/orders/PurchaseOrderItemRow";
import { totaliRigheOda } from "@/lib/orders/articoloAcquisto";
import { useState, lazy, Suspense } from "react";
import {
  ODA_STATUS_LABELS as STATUS_LABELS,
  ODA_STATUS_CHIP_VARIANT as STATUS_CHIP_VARIANT,
} from "@/lib/odaStatus";
import { useParams, Link } from "react-router-dom";
import { useDentroPopupDocumento, useIdDocumento, useNavigaDocumento } from "@/lib/orders/documentoPopup";
import { useVociListinoFornitore } from "@/hooks/useListinoFornitore";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Loader2, Plus, Send, CheckCircle2, Package,
  Truck, XCircle, ExternalLink, FileCheck, ShieldCheck, Paperclip,
  AlertTriangle, ScanLine, ClipboardList, CalendarClock,
  PackageCheck,
} from "lucide-react";
import {
  QuotePageHeader,
  QuoteCard,
  QuoteChip,
  QuotePrimaryButton,
} from "@/components/marketing/preventivi/ui/builderUI";
import { useQuery } from "@tanstack/react-query";
import { usePurchaseOrderDetail, usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import type { DDTStato } from "@/hooks/useDDTRicezione";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { VerifyPurchaseOrderDialog } from "@/components/orders/VerifyPurchaseOrderDialog";
import { VerificationHistoryCard } from "@/components/orders/VerificationHistoryCard";
import { NewDDTDialog } from "@/components/ddt/NewDDTDialog";
import { DDTStatusBadge } from "@/components/ddt/DDTStatusBadge";
import { OdaAccountingCard } from "@/components/orders/OdaAccountingCard";
import { OdaImpattoCommessaCard } from "@/components/orders/OdaImpattoCommessaCard";
import { CommessaCombobox } from "@/components/orders/CommessaCombobox";
import { calcolaScadenza, TERMINI_PRESET } from "@/lib/terminiPagamento";
import { OdaDocumentoCard } from "@/components/orders/OdaDocumentoCard";
import { ODA_ORIGINE_INFO, ODA_ORIGINE_LABELS, prossimiStatiOda } from "@/lib/odaOrigine";
import { type ComposeContext } from "@/pages/azienda/email/components/EmailComposeDialog";
import { emailPerOrdini, terminiPagamentoTesto } from "@/lib/suppliers/anagraficaFornitore";
import { buildOdaEmailBody, buildOdaEmailSubject } from "@/lib/odaEmail";
import { DocumentoInvioDialog } from "@/components/documentiOperativi/DocumentoInvioDialog";
import { recapitiFornitore } from "@/lib/documentiOperativi/fornitore";
import type { DocumentoOperativo } from "@/lib/documentiOperativi/modello";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

// MP2 P1a: ricezione via scansione QR/barcode (lazy: trascina @zxing solo on-demand).
const OdaArrivoMerceSheet = lazy(() =>
  import("@/components/warehouse/OdaArrivoMerceSheet").then((m) => ({ default: m.OdaArrivoMerceSheet })),
);
const OdaReceiveSheet = lazy(() =>
  import("@/components/warehouse/OdaReceiveSheet").then((m) => ({ default: m.OdaReceiveSheet })),
);

const fmtEur = (n: number) => formatCurrency(n);


const STATUS_ICONS: Record<string, React.ReactNode> = {
  inviato: <Send className="h-3.5 w-3.5 mr-1" />,
  confermato: <CheckCircle2 className="h-3.5 w-3.5 mr-1" />,
  ricevuto: <Package className="h-3.5 w-3.5 mr-1" />,
  annullato: <XCircle className="h-3.5 w-3.5 mr-1" />,
};

export default function PurchaseOrderDetail() {
  const { odaId: odaIdIndirizzo } = useParams();
  const odaId = useIdDocumento(odaIdIndirizzo);
  const navigate = useNavigaDocumento();
  const inPopup = useDentroPopupDocumento();
  const { effectiveCompany } = useAuth();
  const { order, isLoading, items, isItemsLoading, addItem, updateItem, deleteItem } = usePurchaseOrderDetail(odaId || null);
  // Prezzi d'acquisto del fornitore: alimentano il suggerimento sulle righe.
  const { voci: vociFornitore } = useVociListinoFornitore(
    (order as { supplier_id?: string | null } | undefined)?.supplier_id ?? null,
  );
  const { updateStatus, update } = usePurchaseOrders();

  // AI Verification
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);

  // M4 — DDT ricezione (nuovo wizard procedurale)
  const [ddtDialogOpen, setDdtDialogOpen] = useState(false);
  const [receiveScanOpen, setReceiveScanOpen] = useState(false);
  const [arrivoOpen, setArrivoOpen] = useState(false);

  // Invio al fornitore: si usa il compositore email dell'app, lo stesso di
  // contatti/opportunita'/commesse, cosi' l'ordine parte dalla casella
  // aziendale, il testo si puo' modificare e la risposta del fornitore torna
  // nella posta invece che in un buco nero.
  const [sendOpen, setSendOpen] = useState(false);
  const queryClient = useQueryClient();
  // Incidenza acquisti/vendita = dato di margine; costi e fatture = dato di
  // costo. Chi lavora solo sugli ordini (magazzino) non deve vederli.
  const permissions = usePermissions();

  const { data: ddtList = [] } = useQuery({
    queryKey: ["ddt-ricezione", odaId],
    queryFn: async () => {
      const { data, error } = await supabase.from("ddt_ricezione").select("*").eq("purchase_order_id", odaId!).order("data_ricezione", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!odaId,
  });

  if (isLoading) {
    return (
      <div className="space-y-5 pb-10">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Ordine non trovato</p>
        <Button variant="outline" onClick={() => navigate("/azienda/ordini?tab=acquisto")}>Torna alla lista</Button>
      </div>
    );
  }

  const supplier = order.suppliers as any;
  const condizioniFornitore = recapitiFornitore({...supplier,id:order.supplier_id,name:supplier?.name || "Fornitore"}).pagamento;
  const pagamentoEffettivo = order.payment_terms?.trim() || condizioniFornitore;
  const totaliRighe = totaliRigheOda(items);
  const importiInAttesa = items.length > 0 && totaliRighe.daConfermare === items.length;
  const origine = (order as { origine?: string }).origine ?? "email";
  const infoOrigine = ODA_ORIGINE_INFO[origine] ?? ODA_ORIGINE_INFO.email;
  // I passaggi dipendono da come si e' ordinato: chi compra al banco ha gia'
  // la merce, "inviato" e "confermato" sarebbero due clic per finta.
  const nextStatuses = prossimiStatiOda(order.status, origine);

  // Oggetto e corpo precompilati per il compositore: sono solo una bozza, chi
  // invia li puo' riscrivere come vuole prima di mandare.
  const datiEmail = {
    odaNumber: order.oda_number,
    fornitoreNome: supplier?.name ?? null,
    aziendaNome: effectiveCompany?.name ?? null,
    dataEmissione: order.issue_date,
    consegnaPrevista: order.expected_delivery_date,
    pagamento: order.payment_terms,
    commessaCodice: order.orders?.order_code ?? null,
    codiceCliente: supplier?.codice_cliente ?? null,
    note: order.notes,
    subtotal: Number(order.subtotal),
    vatTotal: Number(order.vat_total),
    total: Number(order.total),
    righe: items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unit_of_measure: i.unit_of_measure,
      unit_price: i.unit_price,
      line_total: Number(i.line_total),
      sku: (i as { sku?: string | null }).sku ?? null,
    })),
  };
  const composeContext: ComposeContext = {
    mode: "new",
    // A chi va l'ordine: email per gli ordini, poi referente degli ordini, poi l'email generale.
    initialTo: emailPerOrdini(supplier) ? [emailPerOrdini(supplier)!] : [],
    initialSubject: buildOdaEmailSubject(datiEmail),
    initialBodyHtml: buildOdaEmailBody(datiEmail),
  };
  const documentoInvio: DocumentoOperativo = {
    tipo: "materiali", numero: order.oda_number, data: order.issue_date,
    prezziDaConfermare: items.length > 0 && items.some(i => i.price_pending),
    ...recapitiFornitore({...supplier,id:order.supplier_id,name:supplier?.name || "Fornitore"}),
    commessa:order.orders?.order_code, codiceCliente:supplier?.codice_cliente, luogo:order.delivery_address || order.orders?.work_address,
    indirizzoCantiere:order.orders?.work_address, magazzinoId:order.delivery_warehouse_id, destinazioneTipo:order.delivery_warehouse_id ? "magazzino" : order.order_id ? "cantiere" : order.delivery_address ? "altro" : "magazzino", riferimento:order.supplier_reference,
    consegna:order.expected_delivery_date,pagamento:order.payment_terms || recapitiFornitore({...supplier,id:order.supplier_id,name:supplier?.name || "Fornitore"}).pagamento,note:order.notes,
    righe:items.map(i=>({descrizione:i.description,nota:i.notes,unita:i.unit_of_measure || "pz",quantita:Number(i.quantity),prezzo:i.price_pending ? null : Number(i.unit_price),sconto:Number(i.discount_percent),iva:Number(i.vat_rate),importo:i.price_pending ? undefined : Number(i.line_total)})),
    totali:{imponibile:totaliRighe.imponibile,iva:totaliRighe.iva,totale:totaliRighe.totale},
  };
  const isEditable = order.status === "bozza";
  const righeInSalvataggio = addItem.isPending || updateItem.isPending || deleteItem.isPending || update.isPending;

  const handleStatusChange = async (ns: string) => {
    updateStatus.mutate({
      id: order.id,
      status: ns,
      // Senza questa data la riga "Consegna effettiva" nel riquadro info non
      // compariva mai: nessuno la scriveva, ne' qui ne' nella mutation.
      ...(ns === "ricevuto" ? { actual_delivery_date: format(new Date(), "yyyy-MM-dd") } : {}),
    }, {
      onSuccess: (esito) => {
        // Il costo NON si crea piu' qui: lo genera il trigger sul database
        // (migration 20280117000000) al passaggio a "ricevuto", cosi' anche
        // scanner, DDT e percorsi futuri lo producono — prima solo questo
        // pulsante lo faceva, e un ordine ricevuto via scan non esisteva per
        // la cassa. Qui resta solo il refresh della scheda Contabilita'.
        if (ns === "ricevuto") {
          queryClient.invalidateQueries({ queryKey: ["oda-contabilita", order.id] });
          // il costo nasce solo con l'ordine completo: con righe mancanti non c'è
          if (Number(order.subtotal) > 0 && (esito as { completo?: boolean } | undefined)?.completo !== false) {
            toast.success("Merce ricevuta", {
              description: "Costo registrato in Costi Aziendali con la scadenza dei termini di pagamento.",
            });
          }
        }
      },
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Back link — visible on all viewports */}
      {!inPopup && <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/azienda/ordini?tab=acquisto")}
          aria-label="Torna alla lista Ordini d'Acquisto"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Ordini Acquisto</span>
          <span className="sm:hidden">Indietro</span>
        </Button>
      </div>}

      <QuotePageHeader
        numero={order.oda_number}
        stato={
          <QuoteChip variant={STATUS_CHIP_VARIANT[order.status] || "default"}>
            {STATUS_LABELS[order.status] || order.status}
          </QuoteChip>
        }
        chips={
          <>
            {order.orders?.order_code ? (
              <Link to={`/azienda/ordini/${order.order_id}`} className="inline-flex">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors">
                  Ord. {order.orders.order_code} <ExternalLink className="h-3 w-3" />
                </span>
              </Link>
            ) : null}
            {/* Come e' stato comprato: spiega perche' i pulsanti sono quelli
                e non altri. Sugli ordini vecchi e' sempre "Email". */}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
              {ODA_ORIGINE_LABELS[origine] ?? origine}
            </span>
          </>
        }
        title={`OdA ${order.oda_number}`}
        subtitle={supplier?.name ? `Fornitore: ${supplier.name}` : undefined}
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <>
            {order.status !== "bozza" && order.status !== "annullato" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVerifyDialogOpen(true)}
              >
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                Verifica AI
              </Button>
            )}
            {(["inviato", "confermato", "parziale"] as Array<typeof order.status>).includes(order.status) && (
              <Button size="sm" onClick={() => setArrivoOpen(true)}>
                <PackageCheck className="h-3.5 w-3.5 mr-1" />
                Arrivata merce
              </Button>
            )}
            {(["inviato", "confermato", "parziale"] as Array<typeof order.status>).includes(order.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReceiveScanOpen(true)}
              >
                <ScanLine className="h-3.5 w-3.5 mr-1" />
                Ricevi via scansione
              </Button>
            )}
            {/* Reinvio: capita di dover rimandare l'ordine (email persa, referente
                cambiato). Non tocca lo stato, manda solo di nuovo la mail.
                Non ha senso su cio' che si e' comprati di persona. */}
            {origine !== "negozio" && ["inviato", "confermato", "parziale"].includes(order.status) && (
              <Button variant="outline" size="sm" disabled={righeInSalvataggio} onClick={() => setSendOpen(true)}>
                <Send className="h-3.5 w-3.5 mr-1" />
                Reinvia
              </Button>
            )}
            {nextStatuses.map((ns) =>
              // "Inviato" non e' un cambio di stato come gli altri: l'ordine deve
              // partire davvero al fornitore. Si apre il compositore email e lo
              // stato avanza solo quando l'email e' uscita. Chi ordina a voce ha
              // accanto la scorciatoia per segnarlo inviato senza mandare nulla.
              // Vale solo per gli ordini che partono da qui: se l'ordine e' gia'
              // stato piazzato altrove (sito, banco, documento) il pulsante dice
              // cosa fare davvero, senza fingere un invio.
              ns === "inviato" && origine === "email" ? (
                <div key={ns} className="flex items-center gap-1">
                  <QuotePrimaryButton size="sm" disabled={righeInSalvataggio} onClick={() => setSendOpen(true)}>
                    {STATUS_ICONS[ns]}
                    Invia al fornitore
                  </QuotePrimaryButton>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    disabled={updateStatus.isPending}
                    onClick={() => handleStatusChange("inviato")}
                  >
                    Già ordinato a voce
                  </Button>
                </div>
              ) : ns === "annullato" ? (
                <Button
                  key={ns}
                  variant="destructive"
                  size="sm"
                  onClick={() => handleStatusChange(ns)}
                  disabled={updateStatus.isPending}
                >
                  {STATUS_ICONS[ns]}
                  {STATUS_LABELS[ns]}
                </Button>
              ) : (
                <QuotePrimaryButton
                  key={ns}
                  size="sm"
                  onClick={() => handleStatusChange(ns)}
                  disabled={updateStatus.isPending}
                >
                  {STATUS_ICONS[ns]}
                  {/* Dalla bozza il pulsante parla la lingua di come si e'
                      comprato: "Registra acquisto" al banco, "Ordine
                      confermato" online. "Confermato" e basta non direbbe a
                      nessuno cosa sta per succedere. */}
                  {order.status === "bozza" ? infoOrigine.azione : STATUS_LABELS[ns]}
                </QuotePrimaryButton>
              )
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_20rem] gap-6">
        {/* Left: Editor */}
        <div className="min-w-0 space-y-4">
          {/* Items table */}
          <QuoteCard noHeader className="p-0 sm:p-0">
            <div className="px-5 sm:px-6 pt-5 pb-4 flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-[15px] font-bold text-slate-900 flex items-center gap-2.5">
                <span className="block w-1 h-4 rounded-sm bg-gradient-to-b from-orange-500 to-eic-amber" />
                <span className="text-orange-500"><Package className="h-4 w-4" /></span>
                Articoli
              </h3>
              {isEditable && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={addItem.isPending}
                  onClick={() => addItem.mutate({
                    purchase_order_id: order.id,
                    description: "Nuovo articolo",
                    quantity: 1,
                    unit_price: 0,
                    price_pending: true,
                    vat_rate: 22,
                  })}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
                </Button>
              )}
            </div>
            <p className="px-5 pb-3 text-xs text-slate-500">Prezzi di acquisto IVA esclusa. Puoi lasciare il prezzo vuoto e indicarlo come «Da confermare» in attesa del fornitore. Su schermi stretti puoi scorrere la tabella orizzontalmente.</p>
            {totaliRighe.daConfermare > 0 && <p role="status" className="mx-5 mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{totaliRighe.daConfermare} {totaliRighe.daConfermare === 1 ? "voce con prezzo da confermare" : "voci con prezzi da confermare"}. Gli importi visibili comprendono solo le voci già valorizzate.</p>}
            <div className="border-t border-slate-100">
              {isItemsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : items.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Nessun articolo. Clicca "Aggiungi" per iniziare.</p>
              ) : (
                <div className="overflow-x-auto" role="region" aria-label="Articoli dell’ordine" tabIndex={0}>
                  <table className="w-full min-w-[790px] text-sm">
                    <thead><tr className="border-b bg-muted/50">
                      <th className="text-left p-2 pl-4 font-medium">Descrizione</th>
                      <th className="text-right p-2 font-medium w-20">Qtà</th>
                      <th className="text-left p-2 font-medium w-16">UM</th>
                      <th className="text-right p-2 font-medium w-24">Prezzo acquisto</th>
                      <th className="text-right p-2 font-medium w-16">Sc.%</th>
                      <th className="text-right p-2 font-medium w-16">IVA%</th>
                      <th className="text-right p-2 font-medium w-24">Totale netto</th>
                      {isEditable && <th className="p-2 w-10"></th>}
                      {!isEditable && order.status !== "annullato" && <th className="text-right p-2 font-medium w-20">Ricevuti</th>}
                    </tr></thead>
                    <tbody>
                      {items.map((item) => (
                        <PurchaseOrderItemRow
                          // La quantita' ricevuta cambia anche da fuori questa
                          // riga (scansione barcode, DDT, passaggio a
                          // "ricevuto"). Includendola nella key la casella
                          // riparte dal valore vero invece di restare ferma a
                          // quello letto all'apertura della pagina, mentre la
                          // barra di avanzamento sopra diceva un'altra cosa.
                          key={`${item.id}:${item.quantity_received}`}
                          vociFornitore={vociFornitore}
                          supplierId={order.supplier_id}
                          item={item}
                          isEditable={isEditable}
                          showReceived={!isEditable && order.status !== "annullato"}
                          onUpdate={(updates) => updateItem.mutateAsync({ id: item.id, updates })}
                          onDelete={() => deleteItem.mutate(item.id)}
                        />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td colSpan={isEditable ? 6 : 6} className="p-2 pl-4 text-right font-medium">Imponibile:</td>
                        <td className="p-2 text-right font-medium">{importiInAttesa ? "Da confermare" : fmtEur(totaliRighe.imponibile)}</td>
                        {(isEditable || (!isEditable && order.status !== "annullato")) && <td></td>}
                      </tr>
                      <tr className="bg-muted/30">
                        <td colSpan={isEditable ? 6 : 6} className="p-2 pl-4 text-right text-muted-foreground">IVA:</td>
                        <td className="p-2 text-right text-muted-foreground">{importiInAttesa ? "Da confermare" : fmtEur(totaliRighe.iva)}</td>
                        {(isEditable || (!isEditable && order.status !== "annullato")) && <td></td>}
                      </tr>
                      <tr className="bg-muted/30 border-t">
                        <td colSpan={isEditable ? 6 : 6} className="p-2 pl-4 text-right font-bold">{totaliRighe.daConfermare ? "Totale parziale:" : "Totale:"}</td>
                        <td className="p-2 text-right font-bold">{importiInAttesa ? "Da confermare" : fmtEur(totaliRighe.totale)}</td>
                        {(isEditable || (!isEditable && order.status !== "annullato")) && <td></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </QuoteCard>

          <OdaNoteCard notes={order.notes} onSave={notes => update.mutateAsync({id:order.id,updates:{notes}})} />
        </div>

        {/* Right: Preview / Info */}
        <div className="space-y-4">
          <QuoteCard title="Fornitore" icon={<Truck className="h-4 w-4" />}>
            <div className="space-y-2">
              <p className="font-semibold text-slate-900">{supplier?.name || "—"}</p>
              {emailPerOrdini(supplier) && <p className="text-sm text-slate-500">{emailPerOrdini(supplier)}</p>}
              {supplier?.codice_cliente && <p className="text-xs text-slate-500">Nostro codice cliente: {supplier.codice_cliente}</p>}
              {(terminiPagamentoTesto(supplier ?? {}) || supplier?.sconto_percentuale != null) && (
                <p className="text-xs text-slate-500">
                  {[
                    terminiPagamentoTesto(supplier ?? {}) && `Pagamento concordato: ${terminiPagamentoTesto(supplier ?? {})}`,
                    supplier?.sconto_percentuale != null && `sconto ${String(supplier.sconto_percentuale).replace(".", ",")}%`,
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
              {supplier?.address && <p className="text-xs text-slate-500">{supplier.address}, {supplier.city} {supplier.province}</p>}
              {supplier?.vat_number && <p className="text-xs text-slate-500">P.IVA: {supplier.vat_number}</p>}
              {supplier?.iban && (
                <>
                  <Separator className="my-2" />
                  <div>
                    <p className="text-xs text-slate-500">IBAN</p>
                    <p className="text-xs font-mono">{supplier.iban}</p>
                    {supplier.bank_name && <p className="text-xs text-slate-500">{supplier.bank_name}</p>}
                  </div>
                </>
              )}
            </div>
          </QuoteCard>

          <QuoteCard title="Info ordine" icon={<CalendarClock className="h-4 w-4" />}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Data emissione</span>
                <span className="font-medium text-slate-900">{format(new Date(order.issue_date), "dd/MM/yyyy", { locale: it })}</span>
              </div>
              {order.expected_delivery_date && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Consegna prevista</span>
                  <span className="font-medium text-slate-900">{format(new Date(order.expected_delivery_date), "dd/MM/yyyy", { locale: it })}</span>
                </div>
              )}
              {order.actual_delivery_date && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Consegna effettiva</span>
                  <span className="font-medium text-slate-900">{format(new Date(order.actual_delivery_date), "dd/MM/yyyy", { locale: it })}</span>
                </div>
              )}
              {/* Termini di pagamento: prima si vedevano solo se gia' scritti,
                  e non li scriveva nessuno (0 su 82 in produzione) perche' non
                  c'era NESSUN posto per farlo. Sono il dato che decide QUANDO
                  esce la cassa. */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Pagamento</span>
                  <Input
                    list="termini-pagamento-preset"
                    key={`${order.id}:${pagamentoEffettivo}`}
                    defaultValue={pagamentoEffettivo === "Da definire con il fornitore" ? "" : pagamentoEffettivo}
                    placeholder="Da definire con il fornitore"
                    aria-label="Condizioni di pagamento dell’ordine"
                    className="h-7 w-52 text-right text-sm"
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== order.payment_terms) {
                        update.mutate({ id: order.id, updates: { payment_terms: v } });
                      }
                    }}
                  />
                  <datalist id="termini-pagamento-preset">
                    {TERMINI_PRESET.map((tp) => <option key={tp} value={tp} />)}
                  </datalist>
                </div>
                <p className="text-xs text-slate-500">Concordato in Impostazioni → Fornitori: <strong>{condizioniFornitore}</strong></p>
                {order.payment_terms?.trim() && order.payment_terms.trim() !== condizioniFornitore && <Button variant="ghost" size="sm" onClick={()=>update.mutate({id:order.id,updates:{payment_terms:condizioniFornitore === "Da definire con il fornitore" ? null : condizioniFornitore,payment_method:supplier?.payment_method ?? null}})}>Usa condizioni del fornitore</Button>}
                {(() => {
                  // Solo finché la merce non è arrivata: dopo, una scadenza calcolata su oggi è sbagliata.
                  const anteprima = calcolaScadenza(pagamentoEffettivo);
                  if (!anteprima || order.actual_delivery_date || ["ricevuto", "annullato"].includes(order.status)) return null;
                  return (
                    <p className="text-[11px] text-slate-400 text-right">
                      Se ricevi oggi, il pagamento scade il {anteprima.split("-").reverse().join("/")}
                    </p>
                  );
                })()}
              </div>

              {/* Commessa: collegabile e cambiabile anche DOPO la creazione —
                  gli ordini dimenticati "generici" sono la regola, non
                  l'eccezione. Cambiandola, il costo gia' generato la segue. */}
              <div className="space-y-1 pt-1">
                <span className="text-slate-500">Commessa</span>
                <CommessaCombobox
                  value={order.order_id}
                  onChange={async (nuovaCommessa) => {
                    if (nuovaCommessa === order.order_id) return;
                    update.mutate(
                      { id: order.id, updates: { order_id: nuovaCommessa } },
                      {
                        onSuccess: async () => {
                          // Coerenza finanziaria: il costo nato da questo
                          // ordine deve stare sulla stessa commessa, altrimenti
                          // la marginalita' del cantiere legge un dato vecchio.
                          const { error } = await (supabase as any)
                            .from("company_costs")
                            .update({ order_id: nuovaCommessa })
                            .eq("purchase_order_id", order.id);
                          if (error) {
                            toast.error("Commessa aggiornata, ma il costo collegato no", {
                              description: error.message,
                            });
                          } else {
                            queryClient.invalidateQueries({ queryKey: ["oda-impatto-commessa"] });
                            queryClient.invalidateQueries({ queryKey: ["oda-contabilita", order.id] });
                          }
                        },
                      },
                    );
                  }}
                  nessunaLabel="Acquisto generico"
                  className="h-8 text-xs"
                />
              </div>

              <div className="rounded-lg bg-gradient-to-br from-slate-50 to-white border border-slate-200 px-3 py-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">Totale</span>
                  <span className="text-xl font-bold text-orange-600 tabular-nums">{importiInAttesa ? "Da confermare" : fmtEur(totaliRighe.totale)}</span>
                </div>
              </div>
            </div>
          </QuoteCard>

          {/* Progresso Ricezione */}
          {order.status !== "bozza" && order.status !== "annullato" && items.length > 0 && (() => {
            const totalQty = items.reduce((s, i) => s + Number(i.quantity), 0);
            const receivedQty = items.reduce((s, i) => s + Number(i.quantity_received || 0), 0);
            const pct = totalQty > 0 ? Math.round((receivedQty / totalQty) * 100) : 0;
            return (
              <QuoteCard noHeader compact>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-orange-500" /> Ricezione merce
                    </span>
                    <span className="font-semibold text-slate-900 tabular-nums">{receivedQty}/{totalQty} pz ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-gradient-to-r from-orange-500 to-eic-amber" : "bg-slate-300"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {pct === 100 && (
                    <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Tutti gli articoli ricevuti
                    </p>
                  )}
                </div>
              </QuoteCard>
            );
          })()}

          {/* M4 — DDT Ricezione card */}
          <QuoteCard
            title={
              <span className="flex items-center gap-2">
                DDT Ricezione
                {ddtList.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">{ddtList.length}</span>
                )}
              </span>
            }
            icon={<FileCheck className="h-4 w-4" />}
            action={
              <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => setDdtDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Registra
              </Button>
            }
          >
            <div>
              {ddtList.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap text-[10px] mt-1">
                  {(() => {
                    const counts: Record<string, number> = {};
                    for (const d of ddtList as { stato: DDTStato }[]) {
                      counts[d.stato] = (counts[d.stato] ?? 0) + 1;
                    }
                    return (
                      <>
                        {counts.verificato ? (
                          <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
                            <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                            {counts.verificato} verificat{counts.verificato === 1 ? "o" : "i"}
                          </Badge>
                        ) : null}
                        {counts.ricevuto ? (
                          <Badge className="bg-green-100 text-green-800 text-[10px]">
                            {counts.ricevuto} ricevut{counts.ricevuto === 1 ? "o" : "i"}
                          </Badge>
                        ) : null}
                        {counts.parziale ? (
                          <Badge className="bg-amber-100 text-amber-800 text-[10px]">
                            {counts.parziale} parzial{counts.parziale === 1 ? "e" : "i"}
                          </Badge>
                        ) : null}
                        {counts.non_conforme ? (
                          <Badge className="bg-rose-100 text-rose-800 text-[10px]">
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                            {counts.non_conforme} non conform{counts.non_conforme === 1 ? "e" : "i"}
                          </Badge>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              )}
              {ddtList.length === 0 ? (
                <div className="text-center py-5 space-y-2">
                  <FileCheck className="h-8 w-8 mx-auto text-slate-300" />
                  <p className="text-xs text-slate-500">Nessun DDT registrato</p>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setDdtDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Registra il primo DDT
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5 mt-2">
                  {(ddtList as {
                    id: string;
                    numero_ddt: string;
                    data_ricezione: string;
                    quantita_ricevuta: number;
                    stato: DDTStato;
                    note: string | null;
                    attachments?: unknown[] | null;
                    ddt_file_url?: string | null;
                    has_damages?: boolean;
                    destinazione?: "magazzino" | "cantiere" | null;
                  }[]).map((ddt) => {
                    const attachCount =
                      (Array.isArray(ddt.attachments) ? ddt.attachments.length : 0) +
                      (ddt.ddt_file_url ? 1 : 0);
                    return (
                      <button
                        type="button"
                        key={ddt.id}
                        onClick={() => navigate(`/azienda/ddt/${ddt.id}`)}
                        className="w-full flex items-start justify-between p-2 rounded-md bg-slate-50 hover:bg-slate-100 text-xs gap-2 text-left transition-colors group border border-transparent hover:border-orange-200"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium truncate font-mono text-slate-900">{ddt.numero_ddt}</p>
                            <ExternalLink className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0" />
                          </div>
                          <p className="text-slate-500 mt-0.5">
                            {ddt.data_ricezione?.split("-").reverse().join("/")} ·{" "}
                            {Number(ddt.quantita_ricevuta).toLocaleString("it-IT", { maximumFractionDigits: 2 })} unità
                            {/* Dove è andata la merce: in magazzino (giacenza) o dritta in cantiere. */}
                            {ddt.destinazione && ` · ${ddt.destinazione === "cantiere" ? "in cantiere" : "in magazzino"}`}
                          </p>
                          {(attachCount > 0 || ddt.has_damages) && (
                            <div className="flex items-center gap-1.5 mt-1">
                              {attachCount > 0 && (
                                <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                                  <Paperclip className="h-2.5 w-2.5" />
                                  {attachCount}
                                </span>
                              )}
                              {ddt.has_damages && (
                                <span className="text-[10px] text-rose-600 flex items-center gap-0.5">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  danni
                                </span>
                              )}
                            </div>
                          )}
                          {ddt.note && <p className="text-slate-500 italic truncate mt-0.5">{ddt.note}</p>}
                        </div>
                        <DDTStatusBadge stato={ddt.stato} size="sm" className="shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </QuoteCard>

          {/* La prova dell'ordine quando non e' partito da qui: conferma del
              sito, modulo firmato, scontrino del banco. */}
          {(infoOrigine.vuoleDocumento || origine === "email" || origine === "telefono") && (
            <OdaDocumentoCard
              odaId={order.id}
              label={infoOrigine.documentoLabel ?? "Conferma originale del fornitore"}
              attachmentUrl={(order as { attachment_url?: string | null }).attachment_url}
              riferimento={(order as { supplier_reference?: string | null }).supplier_reference}
              riferimentoLabel={infoOrigine.riferimentoLabel}
              onChange={async (attachment_url) => { await update.mutateAsync({ id: order.id, updates: { attachment_url } }); }}
            />
          )}

          {/* Quanto pesa questo ordine sulla commessa: il conto si fa QUI,
              mentre si ordina, non a fine lavori quando e' tardi. Mostra il
              valore della commessa e l'incidenza in %: e' un dato di margine. */}
          {permissions.canViewMargins && (
            <OdaImpattoCommessaCard
              odaId={order.id}
              orderId={order.order_id}
              imponibileOrdine={Number(order.subtotal)}
              statoOrdine={order.status}
            />
          )}

          {/* Costo + fattura generati da questo ordine */}
          {permissions.canViewCosts && (
            <OdaAccountingCard odaId={order.id} totaleOrdine={Number(order.total)} stato={order.status} />
          )}

          {/* Verification History */}
          <VerificationHistoryCard purchaseOrderId={order.id} />
        </div>
      </div>

      {/* Verify Purchase Order Dialog */}
      <VerifyPurchaseOrderDialog
        open={verifyDialogOpen}
        onOpenChange={setVerifyDialogOpen}
        purchaseOrderId={order.id}
        odaNumber={order.oda_number}
        orderId={order.order_id}
        orderCode={order.orders?.order_code}
        attachmentUrl={(order as { attachment_url?: string | null }).attachment_url}
      />

      {/* Invio al fornitore — stesso compositore email del resto dell'app:
          oggetto e corpo arrivano precompilati ma restano modificabili, si
          possono allegare i documenti della commessa e scegliere il mittente. */}
      <DocumentoInvioDialog
        key={effectiveCompany?.id}
        documento={documentoInvio}
        tipi={["materiali", "servizi"]}
        open={sendOpen}
        onOpenChange={setSendOpen}
        context={composeContext}
        orderId={order.order_id}
        onSent={() => {
          // Lo stato avanza solo a email partita. Un ordine gia' confermato che
          // viene rimandato non deve tornare indietro a "inviato".
          if (order.status === "bozza") {
            updateStatus.mutate({ id: order.id, status: "inviato" });
          } else {
            queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(order.id) });
          }
        }}
      />

      {/* DDT Wizard — nuovo dialog procedurale multi-step con upload foto/PDF */}
      <NewDDTDialog
        open={ddtDialogOpen}
        onOpenChange={setDdtDialogOpen}
        prefillPurchaseOrderId={odaId ?? null}
      />

      {/* Arrivo merce con le quantità a mano: la strada principale, senza barcode. */}
      <Suspense fallback={null}>
        {arrivoOpen && (
          <OdaArrivoMerceSheet
            open={arrivoOpen}
            onOpenChange={setArrivoOpen}
            odaId={order.id}
            companyId={effectiveCompany?.id ?? ""}
            warehouseId={order.delivery_warehouse_id ?? null}
          />
        )}
      </Suspense>

      {/* MP2 P1a — ricezione via scansione QR/barcode (skip step 1-2 grazie a lockedOdaId) */}
      <Suspense fallback={null}>
        {receiveScanOpen && (
          <OdaReceiveSheet
            open={receiveScanOpen}
            onOpenChange={setReceiveScanOpen}
            lockedOdaId={order.id}
          />
        )}
      </Suspense>
    </div>
  );
}
