import { openWarehouseDocument } from "@/lib/magazzino/allegatiMagazzino";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/formatters";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  Calendar,
  ExternalLink,
  PackageCheck,
  StickyNote,
  Clock,
  PackageOpen,
  Wrench,
  Truck,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Building2,
  FileText,
  Pencil,
  ShoppingCart,
  ArrowUpFromLine,
} from "lucide-react";
import { BOTTONE_NUOVO } from "@/components/orders/TestataScheda";
import { ReceiveGoodsModal } from "@/components/warehouse/ReceiveGoodsModal";
import { InstallationPhotoCaptureModal } from "@/components/warehouse/InstallationPhotoCaptureModal";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  STATUS_CONFIG,
  getDaysUntilPosa,
  isItemUrgent,
  isItemCritical,
  isItemOverdue,
  getUrgencyLabel,
} from "@/types/warehouse";
import type { OrderItemStatus, WarehouseItem } from "@/types/warehouse";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

interface WarehouseItemDetailDialogProps {
  item: WarehouseItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (itemId: string, status: OrderItemStatus) => void;
  onUpdateNotes?: (itemId: string, notes: string | null) => void;
  getSupplierName: (supplierId: string | null) => string | null;
  isUpdating: boolean;
  stockMatch?: { id: string; name: string; quantity: number } | null;
  readOnly?: boolean;
}

type WorkflowPhase = "not_started" | "received" | "shipped" | "delivered" | "installed";

const WORKFLOW_STEPS: { phase: WorkflowPhase; label: string; icon: typeof PackageOpen }[] = [
  { phase: "not_started", label: "Da ricevere", icon: PackageOpen },
  { phase: "received", label: "In magazzino", icon: PackageCheck },
  { phase: "shipped", label: "In transito", icon: Truck },
  { phase: "delivered", label: "Consegnato", icon: PackageCheck },
  { phase: "installed", label: "Installato", icon: CheckCircle2 },
];

function resolveWorkflowPhase(item: WarehouseItem): WorkflowPhase {
  if (item.status === "installato") return "installed";
  if (item.status === "in_magazzino" || item.status === "prenotato") return "received";
  if (item.status === "in_arrivo") return "shipped";
  if (item.fulfillment_status && item.fulfillment_status !== "not_started") {
    return item.fulfillment_status as WorkflowPhase;
  }
  return "not_started";
}

function WorkflowStepper({ currentPhase }: { currentPhase: WorkflowPhase }) {
  const t = useT();
  const currentIdx = WORKFLOW_STEPS.findIndex((s) => s.phase === currentPhase);

  return (
    <div className="flex items-start justify-between gap-1">
      {WORKFLOW_STEPS.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isActive = idx === currentIdx;
        const Icon = step.icon;
        return (
          <div key={step.phase} className="flex items-start gap-1 flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0",
                  isDone && "bg-success text-success-foreground",
                  isActive && "bg-primary text-primary-foreground ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
                  !isDone && !isActive && "bg-muted text-muted-foreground"
                )}
                aria-label={isActive ? t("{fase} (attivo)", { fase: t(step.label) }) : isDone ? t("{fase} (completato)", { fase: t(step.label) }) : t(step.label)}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium leading-tight text-center",
                  isActive && "text-foreground",
                  !isActive && "text-muted-foreground"
                )}
              >
                {t(step.label)}
              </span>
            </div>
            {idx < WORKFLOW_STEPS.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 mt-4 min-w-[8px]",
                  idx < currentIdx ? "bg-success" : "bg-border"
                )}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function WarehouseItemDetailDialog({
  item,
  open,
  onOpenChange,
  onStatusChange,
  onUpdateNotes,
  getSupplierName,
  isUpdating,
  stockMatch,
  readOnly = false,
}: WarehouseItemDetailDialogProps) {
  const t = useT();
  const [editingNotes, setEditingNotes] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  type ReceiptRow = {
    id: string;
    quantity_received: number;
    receipt_date: string | null;
    ddt_number: string | null;
    ddt_photo_url: string | null;
    quality_check_status: string | null;
    ddt_ricezione_id: string | null;
    warehouse: { name: string } | null;
    ddt: {
      id: string;
      numero_ddt: string;
      data_ricezione: string;
      stato: string;
      ddt_file_url: string | null;
      ddt_file_name: string | null;
      corriere: string | null;
      targa_mezzo: string | null;
    } | null;
  };

  const { data: receipts = [], isLoading: receiptsLoading } = useQuery<ReceiptRow[]>({
    queryKey: ["warehouse-item-receipts", item?.id],
    enabled: open && !!item?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goods_receipts")
        .select(`
          id,
          quantity_received,
          receipt_date,
          ddt_number,
          ddt_photo_url,
          quality_check_status,
          ddt_ricezione_id,
          warehouse:warehouses(name),
          ddt:ddt_ricezione(id, numero_ddt, data_ricezione, stato, ddt_file_url, ddt_file_name, corriere, targa_mezzo)
        `)
        .eq("order_item_id", item!.id)
        .order("receipt_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReceiptRow[];
    },
  });

  // 26/11/2026: dove sta l'articolo oltre al magazzino — l'ordine al fornitore che lo porta e le uscite
  // verso il cantiere. Ogni lettura che non riesce nasconde solo la sua riga.
  type RigaOda = { id: string; quantity: number | null; quantity_received: number | null; purchase_order: { id: string; oda_number: string | null; status: string | null; expected_delivery_date?: string | null } | null };
  const { data: ordiniFornitore = [] } = useQuery<RigaOda[]>({
    queryKey: ["warehouse-item-oda", item?.id],
    enabled: open && !!item?.id,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        // Righe senza prezzi (chi non vede i costi le legge lo stesso), poi gli ordini a parte.
        const { data, error } = await supabase
          .from("purchase_order_items_senza_prezzi" as "purchase_order_items")
          .select("id, quantity, quantity_received, purchase_order_id")
          .eq("order_item_id", item!.id);
        if (error || !data?.length) return [];
        const righe = data as unknown as Array<{ id: string; quantity: number | null; quantity_received: number | null; purchase_order_id: string }>;
        const { data: ordini } = await supabase
          .from("purchase_orders")
          .select("id, oda_number, status, expected_delivery_date")
          .in("id", [...new Set(righe.map((r) => r.purchase_order_id))]);
        const perId = new Map(((ordini ?? []) as RigaOda["purchase_order"][]).map((o) => [o!.id, o]));
        return righe.map((r) => ({ ...r, purchase_order: perId.get(r.purchase_order_id) ?? null }));
      } catch { return []; }
    },
  });
  type Uscita = { id: string; quantity: number; created_at: string; movement_type: string; rientro_commessa: boolean | null };
  const { data: uscite = [] } = useQuery<Uscita[]>({
    queryKey: ["warehouse-item-uscite", item?.id],
    enabled: open && !!item?.id,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("warehouse_movements")
          .select("id, quantity, created_at, movement_type, rientro_commessa")
          .eq("order_item_id", item!.id)
          .order("created_at", { ascending: false });
        if (error) return [];
        return (data ?? []) as unknown as Uscita[];
      } catch { return []; }
    },
  });

  if (!item) return null;

  const supplierName = getSupplierName(item.supplier_id);
  const daysUntil = getDaysUntilPosa(item);
  const urgent = isItemUrgent(item);
  const critical = isItemCritical(item);
  const overdue = isItemOverdue(item);
  const expectedDate = item.order.expected_date || item.order.work_start_date;
  const currentPhase = resolveWorkflowPhase(item);
  const totalPrice = (item.purchase_price ?? 0) * (item.quantity ?? 1);
  const hasPrice = item.purchase_price != null;
  const um = item.unita_misura || "";
  const ricevuti = receipts.reduce((tot, r) => tot + Number(r.quantity_received ?? 0), 0);
  const usciti = uscite.filter((m) => m.movement_type !== "carico").reduce((tot, m) => tot + Number(m.quantity), 0)
    - uscite.filter((m) => m.movement_type === "carico" && m.rientro_commessa).reduce((tot, m) => tot + Number(m.quantity), 0);
  const cliente = `${item.order.customer?.first_name ?? ""} ${item.order.customer?.last_name ?? ""}`.trim();
  const giorno = (iso: string) => format(new Date(iso), "dd MMM yyyy", { locale: dateFnsCampo() });

  const canReceive = currentPhase === "not_started" && item.status !== "in_magazzino" && item.status !== "prenotato";
  const isReceived = currentPhase === "received";
  const isInTransit = currentPhase === "shipped";
  const canInstall = currentPhase === "delivered";
  const isInstalled = currentPhase === "installed";

  const startEditNotes = () => {
    setNoteText(item.notes || "");
    setEditingNotes(true);
  };

  const saveNotes = () => {
    onUpdateNotes?.(item.id, noteText.trim() || null);
    setEditingNotes(false);
  };

  const urgencyBanner = overdue
    ? {
        wrapper: "bg-destructive/10 border-destructive/30",
        text: "text-destructive",
        Icon: AlertCircle,
        label: t("In ritardo di {valore} giorni — azione urgente", { valore: Math.abs(daysUntil!) }),
      }
    : critical
      ? {
          wrapper: "bg-destructive/10 border-destructive/30",
          text: "text-destructive",
          Icon: AlertCircle,
          label: t("Critico - lavori tra {daysUntil} giorni", { daysUntil: String(daysUntil ?? "") }),
        }
      : urgent
        ? {
            wrapper: "bg-warning/10 border-warning/30",
            text: "text-warning",
            Icon: AlertTriangle,
            label: t("Urgente - lavori tra {daysUntil} giorni", { daysUntil: String(daysUntil ?? "") }),
          }
        : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
          {/* Header sticky */}
          <DialogHeader className="px-5 pt-5 pb-3 space-y-2 shrink-0 border-b bg-background">
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="flex-1 min-w-0 space-y-1">
                <DialogTitle className="text-lg font-semibold leading-tight break-words pr-2">
                  {item.name}
                </DialogTitle>
                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {item.description}
                  </p>
                )}
                {/* La commessa in testata (26/11/2026): prima stava in fondo, sotto DDT e quantità. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs text-muted-foreground">
                  <Link to={`/azienda/ordini/${item.order.id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                    <FileText className="h-3.5 w-3.5" />
                    {item.order.order_code || t("Commessa")}{cliente ? ` · ${cliente}` : ""}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                  {expectedDate && <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{t("Data lavori prevista")}: {giorno(expectedDate)}</span>}
                  {daysUntil !== null && (
                    <Badge variant="outline" className={cn("h-5 px-1.5 text-[11px] font-semibold",
                      overdue ? "border-red-200 bg-red-50 text-red-700" : critical ? "border-red-200 bg-red-50 text-red-700" : urgent ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-600")}>
                      {overdue ? t("{valore}g in ritardo", { valore: Math.abs(daysUntil) }) : daysUntil <= 7 ? getUrgencyLabel(daysUntil) : `${daysUntil}g`}
                    </Badge>
                  )}
                </div>
              </div>
              {readOnly ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "h-8 shrink-0 px-3 text-xs font-medium",
                    (STATUS_CONFIG[item.status] ?? STATUS_CONFIG.da_ordinare).bgColor,
                    (STATUS_CONFIG[item.status] ?? STATUS_CONFIG.da_ordinare).color,
                  )}
                >
                  {t((STATUS_CONFIG[item.status] ?? STATUS_CONFIG.da_ordinare).label)}
                </Badge>
              ) : (
                <Select
                  value={item.status}
                  onValueChange={(v) => onStatusChange(item.id, v as OrderItemStatus)}
                  disabled={isUpdating}
                >
                  <SelectTrigger
                    className={cn(
                      "w-32 h-8 text-xs font-medium shrink-0",
                      (STATUS_CONFIG[item.status] ?? STATUS_CONFIG.da_ordinare).bgColor,
                      (STATUS_CONFIG[item.status] ?? STATUS_CONFIG.da_ordinare).color
                    )}
                    aria-label={t("Modifica stato articolo")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                      <SelectItem key={status} value={status}>
                        {t(config.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Urgency banner */}
            {urgencyBanner && (
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium",
                  urgencyBanner.wrapper,
                  urgencyBanner.text
                )}
                role="alert"
              >
                <urgencyBanner.Icon className="h-4 w-4 shrink-0" />
                <span>{urgencyBanner.label}</span>
              </div>
            )}
          </DialogHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
            {/* Workflow stepper */}
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("Workflow tracciabilità")}
                </span>
                {isInstalled && (
                  <Badge className="bg-success/15 text-success border border-success/30 hover:bg-success/15">
                    {t("Completato")}
                  </Badge>
                )}
              </div>
              <WorkflowStepper currentPhase={currentPhase} />
            </div>

            {/* Numeri su una riga: quantità della commessa, prezzo, ricevuti e usciti verso il cantiere. */}
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { label: "Quantità", value: `${item.quantity ?? 1}${um ? ` ${um}` : ""}` },
                { label: "Prezzo unitario", value: hasPrice && Number(item.purchase_price) > 0 ? formatCurrency(item.purchase_price!) : t("Da definire") },
                { label: "Totale", value: hasPrice && Number(item.purchase_price) > 0 ? formatCurrency(totalPrice) : "—" },
                { label: "Ricevuti", value: `${ricevuti}${um ? ` ${um}` : ""}` },
                { label: "Usciti", value: `${Math.max(0, usciti)}${um ? ` ${um}` : ""}` },
              ].map((n) => (
                <div key={n.label} className="min-w-0 rounded-md border bg-card px-2.5 py-1.5 last:max-sm:col-span-2">
                  <dt className="truncate text-[11px] text-muted-foreground">{t(n.label)}</dt>
                  <dd className="truncate text-sm font-semibold tabular-nums">{n.value}</dd>
                </div>
              ))}
            </dl>

            <div className="grid gap-2 sm:grid-cols-2">
              {/* Ordine al fornitore */}
              <section className="rounded-md border bg-card px-3 py-2" aria-label={t("Ordine al fornitore")}>
                <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ShoppingCart className="h-3.5 w-3.5" />{t("Ordine al fornitore")}</h3>
                {supplierName && <p className="truncate text-sm"><Building2 className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />{supplierName}</p>}
                {ordiniFornitore.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("Nessun ordine al fornitore collegato.")}</p>
                ) : (
                  <ul className="space-y-0.5 text-sm">
                    {ordiniFornitore.map((r) => r.purchase_order && (
                      <li key={r.id} className="flex items-baseline justify-between gap-2">
                        <Link to={`/azienda/ordini-acquisto/${r.purchase_order.id}`} className="truncate font-medium text-primary hover:underline">{r.purchase_order.oda_number || t("Ordine")}</Link>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {Number(r.quantity_received ?? 0)}/{Number(r.quantity ?? 0)} {um}
                          {r.purchase_order.expected_delivery_date ? ` · ${giorno(r.purchase_order.expected_delivery_date)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {/* Articolo di magazzino */}
              <section className={cn("rounded-md border px-3 py-2", stockMatch ? "border-emerald-200 bg-emerald-50/60" : "bg-card")} aria-label={t("Articolo di magazzino")}>
                <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><PackageCheck className="h-3.5 w-3.5" />{t("Articolo di magazzino")}</h3>
                {stockMatch ? (
                  <>
                    <p className="truncate text-sm font-medium" title={stockMatch.name}>{stockMatch.name}</p>
                    <p className="text-xs text-emerald-700">{t("{n} in giacenza", { n: String(stockMatch.quantity ?? 0) })}</p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("Associa un articolo per verificare prenotazioni e prelievi")}</p>
                )}
                {uscite.filter((m) => m.movement_type !== "carico").slice(0, 3).map((m) => (
                  <p key={m.id} className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><ArrowUpFromLine className="h-3 w-3" />{giorno(m.created_at)} · −{Number(m.quantity)} {um}</p>
                ))}
              </section>
            </div>

            <div className="rounded-md border bg-card px-3 py-2">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {t("DDT e ricezioni merce")}
                </span>
                <div className="flex items-center gap-2">
                  {receipts.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {receipts.length === 1 ? t("{n} movimento", { n: 1 }) : t("{n} movimenti", { n: receipts.length })}
                    </Badge>
                  )}
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setReceiveOpen(true)}
                      disabled={isUpdating}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      {t("Carica DDT")}
                    </Button>
                  )}
                </div>
              </div>

              {receiptsLoading ? (
                <p className="text-sm text-muted-foreground">{t("Caricamento ricezioni...")}</p>
              ) : receipts.length === 0 ? (
                // Una riga: «Carica DDT» sta già in testata della sezione (prima c'era anche un secondo bottone).
                <p className="text-xs text-muted-foreground">
                  {t("Nessun DDT collegato a questo articolo. Carica qui il DDT di arrivo merce, collega il documento all'ordine e registra quantità, magazzino e allegati.")}
                </p>
              ) : (
                <div className="space-y-2">
                  {receipts.map((receipt) => {
                    const ddtNumber = receipt.ddt?.numero_ddt || receipt.ddt_number || t("DDT non indicato");
                    const receiptDate = receipt.ddt?.data_ricezione || receipt.receipt_date;
                    const fileUrl = receipt.ddt?.ddt_file_url || receipt.ddt_photo_url;
                    return (
                      <div key={receipt.id} className="rounded-md border bg-muted/20 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{ddtNumber}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {receiptDate
                                ? format(new Date(receiptDate), "dd MMM yyyy", { locale: dateFnsCampo() })
                                : t("Data non indicata")}
                              {" · "}
                              {t("{n} pz ricevuti", { n: receipt.quantity_received })}
                              {receipt.warehouse?.name ? ` · ${receipt.warehouse.name}` : ""}
                            </p>
                            {(receipt.ddt?.corriere || receipt.ddt?.targa_mezzo) && (
                              <p className="text-xs text-muted-foreground mt-1">{t("Trasporto: {valore}", { valore: [receipt.ddt.corriere, receipt.ddt.targa_mezzo].filter(Boolean).join(" · ") })}</p>
                            )}
                          </div>
                          <Badge variant={receipt.quality_check_status === "damaged" ? "destructive" : "outline"} className="shrink-0">
                            {receipt.quality_check_status || receipt.ddt?.stato || t("ricevuto")}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {receipt.ddt_ricezione_id && (
                            <Button variant="outline" size="sm" asChild className="h-7 px-2 text-xs">
                              <Link to={`/azienda/ddt/${receipt.ddt_ricezione_id}`}>
                                <ExternalLink className="h-3 w-3 mr-1" />
                                {t("Apri DDT")}
                              </Link>
                            </Button>
                          )}
                          {fileUrl && (
                            <Button variant="ghost" size="sm" onClick={() => void openWarehouseDocument(fileUrl)} className="h-7 px-2 text-xs">
                              <FileText className="h-3 w-3 mr-1" />{t("Allegato")}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="rounded-md border bg-card px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <StickyNote className="h-3.5 w-3.5" />
                  {t("Note")}
                </span>
                {!readOnly && !editingNotes && onUpdateNotes && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={startEditNotes}
                  >
                    <Pencil className="h-3 w-3" />
                    {item.notes ? t("Modifica") : t("Aggiungi")}
                  </Button>
                )}
              </div>
              {editingNotes ? (
                <div className="space-y-2">
                  <Textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder={t("Aggiungi nota...")}
                    className="text-sm min-h-[72px] resize-none"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)}>
                      {t("Annulla")}
                    </Button>
                    <Button size="sm" onClick={saveNotes}>
                      {t("Salva")}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                  {item.notes || (
                    <span className="italic text-muted-foreground">{t("Nessuna nota")}</span>
                  )}
                </p>
              )}
            </div>

            {/* Last updated */}
            {item.updated_at && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                <Clock className="h-3 w-3" />
                {t("Aggiornato il {data}", { data: format(new Date(item.updated_at), "dd MMM yyyy, HH:mm", { locale: dateFnsCampo() }) })}
              </div>
            )}
          </div>

          {/* Sticky footer CTA */}
          <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-5 py-2.5 shrink-0">
            {readOnly ? (
              <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-md bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium">
                <FileText className="h-4 w-4 shrink-0" />
                <span className="text-center">{t("Vista consulente: dati consultabili senza azioni operative.")}</span>
              </div>
            ) : canReceive && (
              <Button
                className={cn(BOTTONE_NUOVO, "h-9 w-full gap-2 text-sm")}
                onClick={() => setReceiveOpen(true)}
                disabled={isUpdating}
              >
                <PackageOpen className="h-4 w-4" />
                {t("Ricevi Merce in Magazzino")}
              </Button>
            )}
            {!readOnly && isReceived && (
              <div className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-md bg-success/10 border border-success/30 text-success text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="text-center">
                  {t("Merce gia in magazzino. Gestisci DDT e allegati nella sezione sopra.")}
                </span>
              </div>
            )}
            {!readOnly && isInTransit && (
              <div className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-md bg-warning/10 border border-warning/30 text-warning text-sm font-medium">
                <Truck className="h-4 w-4 shrink-0" />
                <span className="text-center">
                  {t("In transito — attendi conferma consegna")}
                </span>
              </div>
            )}
            {!readOnly && canInstall && (
              <Button
                className="w-full gap-2 h-10 bg-warning text-warning-foreground hover:bg-warning/90"
                onClick={() => setInstallOpen(true)}
                disabled={isUpdating}
              >
                <Wrench className="h-4 w-4" />
                {t("Registra Installazione (foto prima/dopo)")}
              </Button>
            )}
            {!readOnly && isInstalled && (
              <div className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-md bg-success/10 border border-success/30 text-success text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{t("Installazione completata")}</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modali workflow */}
      {!readOnly && (
        <>
          <ReceiveGoodsModal
            open={receiveOpen}
            onOpenChange={setReceiveOpen}
            orderItemId={item.id}
            orderItemName={item.name}
          />
          <InstallationPhotoCaptureModal
            open={installOpen}
            onOpenChange={setInstallOpen}
            orderItemId={item.id}
            orderItemName={item.name}
          />
        </>
      )}
    </>
  );
}
