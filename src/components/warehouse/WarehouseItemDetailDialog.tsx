import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/formatters";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
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
  Hash,
  Euro,
  Building2,
  FileText,
  Pencil,
} from "lucide-react";
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
                aria-label={`${step.label}${isActive ? " (attivo)" : isDone ? " (completato)" : ""}`}
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
                {step.label}
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
        label: `In ritardo di ${Math.abs(daysUntil!)} giorni — azione urgente`,
      }
    : critical
      ? {
          wrapper: "bg-destructive/10 border-destructive/30",
          text: "text-destructive",
          Icon: AlertCircle,
          label: `Critico - lavori tra ${daysUntil} giorni`,
        }
      : urgent
        ? {
            wrapper: "bg-warning/10 border-warning/30",
            text: "text-warning",
            Icon: AlertTriangle,
            label: `Urgente - lavori tra ${daysUntil} giorni`,
          }
        : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
          {/* Header sticky */}
          <DialogHeader className="px-6 pt-6 pb-4 space-y-3 shrink-0 border-b bg-background">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <DialogTitle className="text-lg font-semibold leading-tight break-words pr-2">
                  {item.name}
                </DialogTitle>
                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {item.description}
                  </p>
                )}
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
                  {(STATUS_CONFIG[item.status] ?? STATUS_CONFIG.da_ordinare).label}
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
                    aria-label="Modifica stato articolo"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                      <SelectItem key={status} value={status}>
                        {config.label}
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
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Workflow stepper */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Workflow tracciabilità
                </span>
                {isInstalled && (
                  <Badge className="bg-success/15 text-success border border-success/30 hover:bg-success/15">
                    Completato
                  </Badge>
                )}
              </div>
              <WorkflowStepper currentPhase={currentPhase} />
            </div>

            {/* Info grid: Quantity / Unit Price / Total */}
            {hasPrice ? (
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-md border bg-card p-2.5">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Hash className="h-3 w-3" />
                    <span className="text-[10px] uppercase tracking-wide font-semibold">Qty</span>
                  </div>
                  <p className="text-base font-semibold mt-0.5 tabular-nums">
                    {item.quantity ?? 1}
                  </p>
                </div>
                <div className="rounded-md border bg-card p-2.5">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Euro className="h-3 w-3" />
                    <span className="text-[10px] uppercase tracking-wide font-semibold">Unit</span>
                  </div>
                  <p className="text-base font-semibold mt-0.5 tabular-nums">
                    {formatCurrency(item.purchase_price!)}
                  </p>
                </div>
                <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5">
                  <div className="flex items-center gap-1.5 text-primary">
                    <Euro className="h-3 w-3" />
                    <span className="text-[10px] uppercase tracking-wide font-semibold">Totale</span>
                  </div>
                  <p className="text-base font-bold mt-0.5 tabular-nums text-primary">
                    {formatCurrency(totalPrice)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-md border bg-card p-2.5 flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                    Quantità
                  </p>
                  <p className="text-base font-semibold tabular-nums">{item.quantity ?? 1}</p>
                </div>
              </div>
            )}

            {/* Supplier + Stock match */}
            {(supplierName || stockMatch) && (
              <div className="space-y-2">
                {supplierName && (
                  <div className="flex items-center gap-2.5 p-2.5 rounded-md bg-muted/40 border">
                    <div className="h-8 w-8 rounded-md bg-background flex items-center justify-center border shrink-0">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground leading-none">
                        Fornitore
                      </p>
                      <p className="text-sm font-medium truncate mt-0.5">{supplierName}</p>
                    </div>
                  </div>
                )}

                {stockMatch && (
                  <div className="flex items-center gap-2.5 p-2.5 rounded-md bg-success/10 border border-success/30">
                    <div className="h-8 w-8 rounded-md bg-success/20 flex items-center justify-center shrink-0">
                      <PackageCheck className="h-4 w-4 text-success" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-wide font-semibold text-success leading-none">
                        Già disponibile in giacenza
                      </p>
                      <p className="text-sm font-semibold mt-0.5 truncate">
                        {stockMatch.quantity} pz — {stockMatch.name}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-md border bg-card p-3">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  DDT e ricezioni merce
                </span>
                <div className="flex items-center gap-2">
                  {receipts.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {receipts.length} moviment{receipts.length === 1 ? "o" : "i"}
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
                      Carica DDT
                    </Button>
                  )}
                </div>
              </div>

              {receiptsLoading ? (
                <p className="text-sm text-muted-foreground">Caricamento ricezioni...</p>
              ) : receipts.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground space-y-3">
                  <p>
                    Nessun DDT collegato a questo articolo. Carica qui il DDT di arrivo merce,
                    collega il documento all'ordine e registra quantità, magazzino e allegati.
                  </p>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => setReceiveOpen(true)}
                      disabled={isUpdating}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Carica DDT ricezione
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {receipts.map((receipt) => {
                    const ddtNumber = receipt.ddt?.numero_ddt || receipt.ddt_number || "DDT non indicato";
                    const receiptDate = receipt.ddt?.data_ricezione || receipt.receipt_date;
                    const fileUrl = receipt.ddt?.ddt_file_url || receipt.ddt_photo_url;
                    return (
                      <div key={receipt.id} className="rounded-md border bg-muted/20 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{ddtNumber}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {receiptDate
                                ? format(new Date(receiptDate), "dd MMM yyyy", { locale: it })
                                : "Data non indicata"}
                              {" · "}
                              {receipt.quantity_received} pz ricevuti
                              {receipt.warehouse?.name ? ` · ${receipt.warehouse.name}` : ""}
                            </p>
                            {(receipt.ddt?.corriere || receipt.ddt?.targa_mezzo) && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Trasporto: {[receipt.ddt.corriere, receipt.ddt.targa_mezzo].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                          <Badge variant={receipt.quality_check_status === "damaged" ? "destructive" : "outline"} className="shrink-0">
                            {receipt.quality_check_status || receipt.ddt?.stato || "ricevuto"}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {receipt.ddt_ricezione_id && (
                            <Button variant="outline" size="sm" asChild className="h-7 px-2 text-xs">
                              <Link to={`/azienda/ddt/${receipt.ddt_ricezione_id}`}>
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Apri DDT
                              </Link>
                            </Button>
                          )}
                          {fileUrl && (
                            <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
                              <a href={fileUrl} target="_blank" rel="noreferrer">
                                <FileText className="h-3 w-3 mr-1" />
                                Allegato
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Order + Date */}
            <div className="rounded-md border divide-y overflow-hidden">
              <div className="flex items-center justify-between p-2.5 gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground leading-none">
                      Ordine
                    </p>
                    <p className="text-sm font-medium truncate mt-0.5">
                      {item.order.order_code || "Ordine"} — {item.order.customer?.first_name ?? ""}{" "}
                      {item.order.customer?.last_name ?? ""}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" asChild className="h-7 px-2 shrink-0">
                  <Link to={`/azienda/ordini/${item.order.id}`}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Vai
                  </Link>
                </Button>
              </div>

              {expectedDate && (
                <div className="flex items-center gap-2.5 p-2.5">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground leading-none">
                      Data lavori prevista
                    </p>
                    <p className="text-sm font-medium mt-0.5">
                      {format(new Date(expectedDate), "dd MMMM yyyy", { locale: it })}
                    </p>
                  </div>
                  {daysUntil !== null && (
                    <Badge
                      className={cn(
                        "text-xs font-semibold shrink-0 border",
                        overdue &&
                          "bg-destructive text-destructive-foreground border-destructive hover:bg-destructive",
                        !overdue &&
                          critical &&
                          "bg-destructive/15 text-destructive border-destructive/40 hover:bg-destructive/15",
                        !overdue &&
                          !critical &&
                          urgent &&
                          "bg-warning/15 text-warning border-warning/40 hover:bg-warning/15",
                        !overdue &&
                          !urgent &&
                          "bg-muted text-muted-foreground border-border hover:bg-muted"
                      )}
                    >
                      {overdue
                        ? `${Math.abs(daysUntil)}g in ritardo`
                        : daysUntil <= 7
                          ? getUrgencyLabel(daysUntil)
                          : `${daysUntil}g`}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="rounded-md border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground flex items-center gap-1.5">
                  <StickyNote className="h-3.5 w-3.5" />
                  Note
                </span>
                {!readOnly && !editingNotes && onUpdateNotes && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={startEditNotes}
                  >
                    <Pencil className="h-3 w-3" />
                    {item.notes ? "Modifica" : "Aggiungi"}
                  </Button>
                )}
              </div>
              {editingNotes ? (
                <div className="space-y-2">
                  <Textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Aggiungi nota..."
                    className="text-sm min-h-[72px] resize-none"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)}>
                      Annulla
                    </Button>
                    <Button size="sm" onClick={saveNotes}>
                      Salva
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                  {item.notes || (
                    <span className="italic text-muted-foreground">Nessuna nota</span>
                  )}
                </p>
              )}
            </div>

            {/* Last updated */}
            {item.updated_at && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                <Clock className="h-3 w-3" />
                Aggiornato il{" "}
                {format(new Date(item.updated_at), "dd MMM yyyy 'alle' HH:mm", { locale: it })}
              </div>
            )}
          </div>

          {/* Sticky footer CTA */}
          <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-6 py-3 shrink-0">
            {readOnly ? (
              <div className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-sm font-medium">
                <FileText className="h-4 w-4 shrink-0" />
                <span className="text-center">Vista consulente: dati consultabili senza azioni operative.</span>
              </div>
            ) : canReceive && (
              <Button
                className="w-full gap-2 h-10"
                onClick={() => setReceiveOpen(true)}
                disabled={isUpdating}
              >
                <PackageOpen className="h-4 w-4" />
                Ricevi Merce in Magazzino
              </Button>
            )}
            {!readOnly && isReceived && (
              <div className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-md bg-success/10 border border-success/30 text-success text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="text-center">
                  Merce gia in magazzino. Gestisci DDT e allegati nella sezione sopra.
                </span>
              </div>
            )}
            {!readOnly && isInTransit && (
              <div className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-md bg-warning/10 border border-warning/30 text-warning text-sm font-medium">
                <Truck className="h-4 w-4 shrink-0" />
                <span className="text-center">
                  In transito — attendi conferma consegna
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
                Registra Installazione (foto prima/dopo)
              </Button>
            )}
            {!readOnly && isInstalled && (
              <div className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-md bg-success/10 border border-success/30 text-success text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Installazione completata</span>
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
