import { DocumentoAnteprimaDialog } from "@/components/acquisti/DocumentoAnteprimaDialog";
import { StoricoAcquistiCard } from "@/components/acquisti/StoricoAcquistiCard";
import { AttivitaAcquistoCard } from "@/components/acquisti/AttivitaAcquistoCard";
import { attivitaOda } from "@/lib/acquisti/attivita";
import { OdaFornitoreCard } from "@/components/orders/OdaFornitoreCard";
import { OdaDettagliCard } from "@/components/orders/OdaDettagliCard";
import { applicaDettagliOda } from "@/lib/orders/dettagliDocumentoOda";
import { OdaNoteCard } from "@/components/orders/OdaNoteCard";
import { PurchaseOrderItemRow } from "@/components/orders/PurchaseOrderItemRow";
import { totaliRigheOda } from "@/lib/orders/articoloAcquisto";
import { OrdinaComunqueDialog } from "@/components/orders/OrdinaComunqueDialog";
import { ControlloDocumentoCard } from "@/components/orders/ControlloDocumentoCard";
import { descrizioneConMisure, type MisuraAperta } from "@/lib/acquisti/misureSuDocumenti";
import { useState, lazy, Suspense } from "react";
import {
  ODA_STATUS_LABELS as STATUS_LABELS,
  ODA_STATUS_CHIP_VARIANT as STATUS_CHIP_VARIANT,
} from "@/lib/odaStatus";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useDentroPopupDocumento, useIdDocumento, useNavigaDocumento } from "@/lib/orders/documentoPopup";
import { useVociListinoFornitore } from "@/hooks/useListinoFornitore";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { letturaSenzaPrezzi } from "@/lib/acquisti/letturaSenzaPrezzi";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Loader2, Plus, Send, CheckCircle2, Package, XCircle, ExternalLink, FileCheck, ShieldCheck, Paperclip,
  AlertTriangle, ScanLine, ClipboardList, CalendarClock,
  PackageCheck, Pencil, FileDown, Mail, Eye, MoreHorizontal,
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
import { OdaDocumentoCard } from "@/components/orders/OdaDocumentoCard";
import { ODA_ORIGINE_INFO, ODA_ORIGINE_LABELS, prossimiStatiOda } from "@/lib/odaOrigine";
import { type ComposeContext } from "@/pages/azienda/email/components/EmailComposeDialog";
import { emailPerOrdini } from "@/lib/suppliers/anagraficaFornitore";
import { buildOdaEmailBody, buildOdaEmailSubject } from "@/lib/odaEmail";
import { DocumentoEmailDialog } from "@/components/documentiOperativi/DocumentoEmailDialog";
import { recapitiFornitore } from "@/lib/documentiOperativi/fornitore";
import { nomeFileDocumento, type DocumentoOperativo } from "@/lib/documentiOperativi/modello";
import { scaricaBlob } from "@/components/orders/generali/vendita/scarica";
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
  const { order, isLoading, items, isItemsLoading, addItem, updateItem, deleteItem, impostaIvaRighe } = usePurchaseOrderDetail(odaId || null);
  // Prezzi d'acquisto del fornitore: alimentano il suggerimento sulle righe.
  const { voci: vociFornitore } = useVociListinoFornitore(
    (order as { supplier_id?: string | null } | undefined)?.supplier_id ?? null,
  );
  const { updateStatus, update } = usePurchaseOrders();

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [previewOpen,setPreviewOpen]=useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  // AI Verification
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);

  // M4 — DDT ricezione (nuovo wizard procedurale)
  const [ddtDialogOpen, setDdtDialogOpen] = useState(false);
  const [receiveScanOpen, setReceiveScanOpen] = useState(false);
  // ?arrivo=1: chi arriva dalla commessa con «Merce arrivata» trova già aperto l'arrivo.
  const [parametri] = useSearchParams();
  const [arrivoOpen, setArrivoOpen] = useState(parametri.get("arrivo") === "1");

  // Invio al fornitore: si usa il compositore email dell'app, lo stesso di
  // contatti/opportunita'/commesse, cosi' l'ordine parte dalla casella
  // aziendale, il testo si puo' modificare e la risposta del fornitore torna
  // nella posta invece che in un buco nero.
  const [sendOpen, setSendOpen] = useState(false);
  const [sendMode, setSendMode] = useState<"testo" | "pdf">("testo");
  const [editingNotesId,setEditingNotesId]=useState<string|null>(null);
  const [editingDetailsId, setEditingDetailsId] = useState<string | null>(null);
  const [misureAperte, setMisureAperte] = useState<{ righe: MisuraAperta[]; poi: () => void } | null>(null);
  // Prima di mandare un ordine: l'email parte prima del cambio di stato, quindi il blocco va guardato prima dell'invio.
  const controllaMisure = async (poi: () => void) => {
    if (order?.status !== "bozza") { poi(); return; }
    const { data, error } = await (supabase.rpc as unknown as (f: string, a: object) => Promise<{ data: MisuraAperta[] | null; error: { message: string } | null }>)(
      "oda_misure_da_confermare", { p_po: order.id });
    if (error) { toast.error("Non riesco a controllare le misure", { description: error.message }); return; }
    if (data?.length) setMisureAperte({ righe: data, poi });
    else poi();
  };
  const openSend = (mode: "testo" | "pdf") => { void controllaMisure(() => {setSendMode(mode);setSendOpen(true);}); };
  const queryClient = useQueryClient();
  // Incidenza acquisti/vendita = dato di margine; costi e fatture = dato di
  // costo. Chi lavora solo sugli ordini (magazzino) non deve vederli.
  const permissions = usePermissions();
  const confirm = useConfirm();

  const { data: ddtList = [] } = useQuery({
    queryKey: ["ddt-ricezione", odaId],
    queryFn: async () => {
      const { data, error } = await supabase.from("ddt_ricezione").select("*").eq("purchase_order_id", odaId!).order("data_ricezione", { ascending: false });
      if (error) throw error;
      // Una bolla può consegnare più ordini: conta anche quella collegata a un altro ordine
      // che ha righe di questo. Si legge dalle righe della bolla.
      const { data: legate, error: errLegate } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: Array<{ ddt_ricezione_id: string }> | null; error: Error | null }> } } })
        .from("ddt_righe").select("ddt_ricezione_id, purchase_order_items!inner(purchase_order_id)").eq("purchase_order_items.purchase_order_id", odaId!);
      if (errLegate) throw errLegate;
      const note = new Set((data ?? []).map((d) => d.id));
      const altre = [...new Set((legate ?? []).map((r) => r.ddt_ricezione_id))].filter((id) => !note.has(id));
      if (altre.length === 0) return data || [];
      const { data: extra, error: errExtra } = await supabase.from("ddt_ricezione").select("*").in("id", altre);
      if (errExtra) throw errExtra;
      return [...(data ?? []), ...(extra ?? [])].sort((a, b) => String(b.data_ricezione).localeCompare(String(a.data_ricezione)));
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
        <Button variant="outline" onClick={() => navigate("/azienda/ordini-acquisto")}>Torna alla lista</Button>
      </div>
    );
  }

  const supplier = order.suppliers;
  const condizioniFornitore = recapitiFornitore({...supplier,id:order.supplier_id,name:supplier?.name || "Fornitore"}).pagamento;
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
    inversioneContabile: (order.document_details as { inversioneContabile?: unknown } | null)?.inversioneContabile === true,
    total: Number(order.total),
    righe: items.map((i) => ({
      description: i.description,
      dettaglio: i.misure_testo ?? null,
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
  const documentoInvio: DocumentoOperativo = applicaDettagliOda({
    tipo: "materiali", numero: order.oda_number, data: order.issue_date,
    prezziDaConfermare: items.length > 0 && items.some(i => i.price_pending),
    ...recapitiFornitore({...supplier,id:order.supplier_id,name:supplier?.name || "Fornitore"}),
    commessa:order.orders?.order_code, codiceCliente:supplier?.codice_cliente, luogo:order.delivery_address || order.orders?.work_address,
    indirizzoCantiere:order.orders?.work_address, magazzinoId:order.delivery_warehouse_id, destinazioneTipo:order.delivery_warehouse_id ? "magazzino" : order.order_id ? "cantiere" : order.delivery_address ? "altro" : "magazzino", riferimento:order.supplier_reference,
    consegna:order.expected_delivery_date,pagamento:order.payment_terms || recapitiFornitore({...supplier,id:order.supplier_id,name:supplier?.name || "Fornitore"}).pagamento,note:order.notes,
    righe:items.map(i=>({descrizione:descrizioneConMisure(i.description,i.misure_testo),nota:i.notes,unita:i.unit_of_measure || "pz",quantita:Number(i.quantity),prezzo:i.price_pending ? null : Number(i.unit_price),sconto:Number(i.discount_percent),iva:Number(i.vat_rate),importo:i.price_pending ? undefined : Number(i.line_total)})),
    totali:{imponibile:totaliRighe.imponibile,iva:totaliRighe.iva,totale:totaliRighe.totale},
  }, order.document_details);
  // Chi non vede i prezzi non modifica le righe: salverebbe un prezzo vuoto al posto di quello vero.
  const senzaPrezzi = letturaSenzaPrezzi();
  const canEdit = !senzaPrezzi && permissions.canEditOrders && ["bozza", "inviato", "confermato", "parziale"].includes(order.status);
  const isEditable = canEdit && (order.status === "bozza" || editingOrderId === order.id);
  const righeInSalvataggio = addItem.isPending || updateItem.isPending || deleteItem.isPending || update.isPending;
  const editingDetails = editingDetailsId === order.id;
  const documentBusy = righeInSalvataggio || isItemsLoading || editingDetails || editingNotesId === order.id;

  const downloadPdf = async () => {
    if (!effectiveCompany || downloadingPdf || documentBusy) return;
    setDownloadingPdf(true);
    try {
      const { generaPdfOperativo } = await import("@/lib/documentiOperativi/pdf");
      const blob = await generaPdfOperativo(documentoInvio, effectiveCompany);
      scaricaBlob(blob, nomeFileDocumento(documentoInvio));
    } catch (error) {
      toast.error("Impossibile scaricare il PDF", {
        description: error instanceof Error ? error.message : "Riprova tra qualche secondo.",
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleCommessaChange = (nuovaCommessa: string | null) => {
    if (nuovaCommessa === order.order_id) return;
    update.mutate(
      { id: order.id, updates: {
        order_id: nuovaCommessa,
        ...(!nuovaCommessa && documentoInvio.destinazioneTipo === "cantiere" ? {
          delivery_address: null,
          document_details: {
            ...(order.document_details && typeof order.document_details === "object" && !Array.isArray(order.document_details) ? order.document_details : {}),
            destinazioneTipo: "magazzino",
          },
        } : {}),
      } },
      {
        onSuccess: async () => {
          // Coerenza finanziaria: il costo nato da questo
          // ordine deve stare sulla stessa commessa, altrimenti
          // la marginalita' del cantiere legge un dato vecchio.
          const { error } = await supabase
            .from("company_costs")
            .update({ order_id: nuovaCommessa })
            .eq("purchase_order_id", order.id).eq("company_id", order.company_id);
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
  };

  const handleStatusChange = async (ns: string) => {
    if (order.status === "bozza" && ns !== "annullato") {
      await controllaMisure(() => cambiaStato(ns));
      return;
    }
    cambiaStato(ns);
  };
  const cambiaStato = (ns: string) => {
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

  // In testata restano Modifica, Arrivata merce e il passo principale: il resto nel menu.
  const arrivoPossibile = ["inviato", "confermato", "parziale"].includes(order.status);
  const statiPrincipali = nextStatuses.filter((ns) => ns !== "annullato" && !(ns === "inviato" && origine === "email"));
  const puoAnnullare = nextStatuses.includes("annullato");
  const chiediAnnullo = async () => {
    if (await confirm({
      title: "Annullare l'ordine?",
      description: `${order.oda_number} non sarà più valido e le righe tornano da ordinare.`,
      confirmLabel: "Annulla l'ordine",
      cancelLabel: "Tienilo",
      variant: "destructive",
    })) handleStatusChange("annullato");
  };
  const vociMenu: Array<{ id: string; etichetta: string; icona: React.ReactNode; azione: () => void }> = [
    ...(order.status !== "bozza" && order.status !== "annullato"
      ? [{ id: "verifica", etichetta: "Verifica AI", icona: <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />, azione: () => setVerifyDialogOpen(true) }]
      : []),
    ...(arrivoPossibile
      ? [{ id: "scansione", etichetta: "Ricevi via scansione", icona: <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />, azione: () => setReceiveScanOpen(true) }]
      : []),
    ...(nextStatuses.includes("inviato") && origine === "email"
      ? [{ id: "voce", etichetta: "Già ordinato a voce", icona: STATUS_ICONS.inviato, azione: (): void => { void handleStatusChange("inviato"); } }]
      : []),
    ...(order.status !== "bozza"
      ? statiPrincipali.map((ns) => ({ id: ns, etichetta: `Segna: ${String(STATUS_LABELS[ns] ?? ns).toLowerCase()}`, icona: STATUS_ICONS[ns], azione: (): void => { void handleStatusChange(ns); } }))
      : []),
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Back link — visible on all viewports */}
      {!inPopup && <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/azienda/ordini-acquisto")}
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
            {canEdit && order.status !== "bozza" && (
              <Button variant="outline" size="sm" disabled={righeInSalvataggio} onClick={() => setEditingOrderId(isEditable ? null : order.id)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                {isEditable ? "Termina modifica" : "Modifica ordine"}
              </Button>
            )}
            {arrivoPossibile && (
              <Button size="sm" aria-expanded={arrivoOpen} onClick={() => setArrivoOpen((a) => !a)}>
                <PackageCheck className="h-3.5 w-3.5 mr-1" />
                Arrivata merce
              </Button>
            )}
            {order.status === "bozza" && statiPrincipali.map((ns) => (
              <QuotePrimaryButton key={ns} size="sm" onClick={() => handleStatusChange(ns)} disabled={updateStatus.isPending}>
                {STATUS_ICONS[ns]}
                {/* Dalla bozza il pulsante parla la lingua di come si e'
                    comprato: "Registra acquisto" al banco, "Ordine confermato" online. */}
                {infoOrigine.azione}
              </QuotePrimaryButton>
            ))}
            {vociMenu.length + (puoAnnullare ? 1 : 0) > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm"><MoreHorizontal className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Altre azioni</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {vociMenu.map((v) => (
                    <DropdownMenuItem key={v.id} disabled={updateStatus.isPending} onSelect={v.azione}>{v.icona}<span className="ml-2">{v.etichetta}</span></DropdownMenuItem>
                  ))}
                  {puoAnnullare && vociMenu.length > 0 && <DropdownMenuSeparator />}
                  {puoAnnullare && (
                    <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={updateStatus.isPending} onSelect={() => void chiediAnnullo()}>
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" /><span className="ml-2">Annulla ordine</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      {arrivoOpen && arrivoPossibile && (
        <Suspense fallback={null}>
          <OdaArrivoMerceSheet
            inline
            open
            onOpenChange={setArrivoOpen}
            odaId={order.id}
            companyId={effectiveCompany?.id ?? ""}
            warehouseId={order.delivery_warehouse_id ?? null}
          />
        </Suspense>
      )}

      {!senzaPrezzi && <section aria-label="Azioni rapide ordine" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-sm font-bold text-slate-900">Documenti e invio</h2>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="outline" size="sm" disabled={downloadingPdf || documentBusy || !effectiveCompany} onClick={downloadPdf}>
              {downloadingPdf ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileDown className="h-3.5 w-3.5 mr-1" />}
              {downloadingPdf ? "Preparazione PDF…" : "Scarica PDF"}
            </Button>
            <Button size="sm" variant={order.status === "bozza" ? "default" : "outline"} disabled={documentBusy} onClick={() => openSend("pdf")}><Paperclip className="mr-1.5 h-4 w-4" />Email con PDF</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Altri documenti"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={documentBusy || !effectiveCompany} onSelect={() => setPreviewOpen(true)}><Eye className="h-3.5 w-3.5" aria-hidden="true" /><span className="ml-2">Anteprima PDF</span></DropdownMenuItem>
                <DropdownMenuItem disabled={documentBusy} onSelect={() => openSend("testo")}><Mail className="h-3.5 w-3.5" aria-hidden="true" /><span className="ml-2">Email con testo</span></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {(editingDetails || editingNotesId === order.id) && <p role="status" className="mt-3 text-xs text-amber-700">Salva o annulla le modifiche aperte prima di preparare il PDF o l’email.</p>}
      </section>}

      <AttivitaAcquistoCard attivita={attivitaOda({status:order.status,prezziPendenti:totaliRighe.daConfermare,righe:items.length,email:documentoInvio.destinatario.email,consegna:order.expected_delivery_date,conferma:!!order.attachment_url})}/>

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
                    vat_rate: documentoInvio.inversioneContabile ? 0 : 22,
                  })}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
                </Button>
              )}
            </div>
            {!senzaPrezzi && <p className="px-5 pb-3 text-xs text-slate-500">Prezzi di acquisto IVA esclusa. Puoi lasciare il prezzo vuoto e indicarlo come «Da confermare» in attesa del fornitore. Su schermi stretti puoi scorrere la tabella orizzontalmente.</p>}
            {totaliRighe.daConfermare > 0 && <p role="status" className="mx-5 mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{totaliRighe.daConfermare} {totaliRighe.daConfermare === 1 ? "voce con prezzo da confermare" : "voci con prezzi da confermare"}. Gli importi visibili comprendono solo le voci già valorizzate.</p>}
            {isEditable && (
              <p className="px-5 sm:px-6 pb-3 text-xs text-muted-foreground" role="status">
                Le modifiche si salvano automaticamente uscendo dal campo. Le righe già ricevute non possono essere eliminate o sostituite.
                {order.status !== "bozza" && " Se l’ordine cambia, prepara una nuova email dalle azioni rapide."}
              </p>
            )}
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
                      {!senzaPrezzi && <th className="text-right p-2 font-medium w-24">Prezzo acquisto</th>}
                      {!senzaPrezzi && <th className="text-right p-2 font-medium w-16">Sc.%</th>}
                      {!senzaPrezzi && <th className="text-right p-2 font-medium w-16">IVA%</th>}
                      {!senzaPrezzi && <th className="text-right p-2 font-medium w-24">Totale netto</th>}
                      {isEditable && <th className="p-2" aria-label="Stato prezzo e azioni"></th>}
                      {!isEditable && order.status !== "annullato" && <th className="text-right p-2 font-medium w-20">Ricevuti</th>}
                    </tr></thead>
                    <tbody>
                      {items.map((item) => (
                        <PurchaseOrderItemRow
                          senzaPrezzi={senzaPrezzi}
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
                          inversioneContabile={!!documentoInvio.inversioneContabile}
                          showReceived={!isEditable && order.status !== "annullato"}
                          onUpdate={(updates) => updateItem.mutateAsync({ id: item.id, updates })}
                          onDelete={() => deleteItem.mutate(item.id)}
                        />
                      ))}
                    </tbody>
                    {!senzaPrezzi && <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td colSpan={isEditable ? 6 : 6} className="p-2 pl-4 text-right font-medium">Imponibile:</td>
                        <td className="p-2 text-right font-medium">{importiInAttesa ? "Da confermare" : fmtEur(totaliRighe.imponibile)}</td>
                        {(isEditable || (!isEditable && order.status !== "annullato")) && <td></td>}
                      </tr>
                      <tr className="bg-muted/30">
                        <td colSpan={isEditable ? 6 : 6} className="p-2 pl-4 text-right text-muted-foreground">IVA:</td>
                        <td className="p-2 text-right text-muted-foreground">{documentoInvio.inversioneContabile ? "Inversione contabile" : importiInAttesa ? "Da confermare" : fmtEur(totaliRighe.iva)}</td>
                        {(isEditable || (!isEditable && order.status !== "annullato")) && <td></td>}
                      </tr>
                      <tr className="bg-muted/30 border-t">
                        <td colSpan={isEditable ? 6 : 6} className="p-2 pl-4 text-right font-bold">{totaliRighe.daConfermare ? "Totale parziale:" : "Totale:"}</td>
                        <td className="p-2 text-right font-bold">{importiInAttesa ? "Da confermare" : fmtEur(totaliRighe.totale)}</td>
                        {(isEditable || (!isEditable && order.status !== "annullato")) && <td></td>}
                      </tr>
                    </tfoot>}
                  </table>
                </div>
              )}
            </div>
          </QuoteCard>

          <OdaDettagliCard key={`dettagli-${order.id}`} documento={documentoInvio} orderId={order.order_id} internalNotes={order.internal_notes} condizioniFornitore={condizioniFornitore} paymentMethod={order.payment_method || supplier?.payment_method} canEdit={permissions.canEditOrders} aliquotaFornitore={supplier?.vat_rate} onImpostaIvaRighe={aliquota=>impostaIvaRighe.mutateAsync(aliquota)} onEditingChange={editing=>setEditingDetailsId(editing ? order.id : null)} onSave={patch=>update.mutateAsync({id:order.id,updates:patch})} />

          <OdaNoteCard key={`note-${order.id}`} onEditingChange={editing=>setEditingNotesId(editing ? order.id : null)} notes={order.notes} onSave={notes => update.mutateAsync({id:order.id,updates:{notes}})} />
        </div>

        {/* Right: Preview / Info */}
        <div className="space-y-4">
          <OdaFornitoreCard key={order.supplier_id} supplier={supplier} />

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
              {/* Commessa: collegabile e cambiabile anche DOPO la creazione —
                  gli ordini dimenticati "generici" sono la regola, non
                  l'eccezione. Cambiandola, il costo gia' generato la segue. */}
              <div className="space-y-1 pt-1">
                <span className="text-slate-500">Commessa (facoltativa)</span>
                {!order.order_id && <div className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-orange-900"><p className="font-semibold">Acquisto per magazzino / materiali di consumo</p><p className="mt-1">Nessuna commessa necessaria. Potrai collegarla anche in seguito.</p></div>}
                <CommessaCombobox
                  value={order.order_id}
                  disabled={!permissions.canEditOrders || update.isPending || editingDetails}
                  onChange={handleCommessaChange}
                  nessunaLabel="Magazzino / consumo (senza commessa)"
                  className="h-8 text-xs"
                />
                {order.order_id && permissions.canEditOrders && <Button size="sm" variant="ghost" className="h-auto w-full justify-start whitespace-normal py-2 text-xs text-slate-600" disabled={update.isPending || editingDetails} onClick={()=>handleCommessaChange(null)}><Package className="mr-1.5 h-3.5 w-3.5 shrink-0" />Acquisto per magazzino / materiali di consumo</Button>}
              </div>

              {!senzaPrezzi && <div className="rounded-lg bg-gradient-to-br from-slate-50 to-white border border-slate-200 px-3 py-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">{totaliRighe.daConfermare ? "Totale parziale" : "Totale"}</span>
                  <span className="text-xl font-bold text-orange-600 tabular-nums">{importiInAttesa ? "Da confermare" : fmtEur(totaliRighe.totale)}</span>
                </div>
              </div>}
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


        </div>
      </div>

      <section aria-label="Ricezione, documenti e contabilità" className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-2">
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
                <p className="py-3 text-center text-xs text-slate-500">Nessun DDT registrato</p>
              ) : (
                <div className="space-y-1.5 mt-2 max-h-80 overflow-y-auto pr-1">
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

      </section>
      <StoricoAcquistiCard tipo="oda" id={order.id} revisionKey={JSON.stringify([order.updated_at,items,order.attachment_url])}/>
      {order.status !== "bozza" && order.status !== "annullato" && <ControlloDocumentoCard obiettivo={{ purchaseOrderId: order.id }} tipo="conferma" />}
      <VerificationHistoryCard purchaseOrderId={order.id} />
      {previewOpen&&<DocumentoAnteprimaDialog documento={documentoInvio} onClose={()=>setPreviewOpen(false)}/>}

      {/* Verify Purchase Order Dialog */}
      {misureAperte && (
        <OrdinaComunqueDialog
          odaId={order.id}
          righe={misureAperte.righe}
          onChiudi={() => setMisureAperte(null)}
          onFatto={() => { const poi = misureAperte.poi; setMisureAperte(null); queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(order.id) }); poi(); }}
        />
      )}
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
      <DocumentoEmailDialog
        key={`${effectiveCompany?.id}:${sendMode}`}
        tracking={{tipo:"oda",id:order.id}}
        modo={sendMode}
        documento={documentoInvio}
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
