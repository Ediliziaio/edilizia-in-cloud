import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  Euro,
  Eye,
  GripVertical,
  MapPin,
  PackageCheck,
  PackageX,
  Pencil,
  Users,
  Wrench,
} from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { type OrderWithDetails, getAmountDue, getAmountCollected } from "@/lib/orderUtils";

interface OrdersPipelineCardProps {
  order: OrderWithDetails;
  isDraggable?: boolean;
}

const SUMMARY_OPEN_DELAY_MS = 1000;

function PaymentBar({ order }: { order: OrderWithDetails }) {
  const total = order.total_amount || 1;
  const collected = getAmountCollected(order);
  const pct = Math.min(100, Math.round((collected / total) * 100));
  const due = getAmountDue(order);
  const isPaid = due === 0 && collected > 0;

  return (
    <div className={cn(
      "h-1.5 rounded-full",
      isPaid ? "bg-emerald-200 dark:bg-emerald-900" :
      collected > 0 ? "bg-orange-200 dark:bg-orange-900" :
      "bg-gray-100 dark:bg-gray-800"
    )}>
      {(collected > 0 || isPaid) && (
        <div
          className={cn(
            "h-full rounded-full",
            isPaid ? "bg-emerald-500" : "bg-orange-500"
          )}
          style={{ width: `${isPaid ? 100 : pct}%` }}
        />
      )}
    </div>
  );
}

function isOverdue(order: OrderWithDetails): boolean {
  const days = getDaysToExpectedDate(order);
  return days !== null && days < 0;
}

function getDaysToExpectedDate(order: OrderWithDetails): number | null {
  if (!order.expected_date) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(order.expected_date);
  exp.setHours(0, 0, 0, 0);
  const timestamp = exp.getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.ceil((timestamp - now.getTime()) / 86_400_000);
}

function getMaterialSummary(order: OrderWithDetails) {
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const total = items.length;
  const ready = items.filter((item) =>
    ["in_magazzino", "prenotato", "installato"].includes(item.status || "")
  ).length;
  const toOrder = items.filter((item) => item.status === "da_ordinare").length;

  return { total, ready, toOrder };
}

function getDateLabel(order: OrderWithDetails) {
  const days = getDaysToExpectedDate(order);
  if (days === null || !order.expected_date) return "Senza data posa";
  if (days < 0) return `${Math.abs(days)}g in ritardo`;
  if (days === 0) return "Posa oggi";
  if (days <= 14) return `Posa tra ${days}g`;
  return formatDateShort(order.expected_date);
}

function getFullDateLabel(date?: string | null) {
  return date ? formatDateShort(date) : "Non indicata";
}

function getWorkPeriodLabel(order: OrderWithDetails) {
  if (order.work_start_date && order.work_end_date) {
    return `${formatDateShort(order.work_start_date)} - ${formatDateShort(order.work_end_date)}`;
  }
  if (order.work_start_date) return `Dal ${formatDateShort(order.work_start_date)}`;
  if (order.work_end_date) return `Entro ${formatDateShort(order.work_end_date)}`;
  return "Non pianificato";
}

function getPaymentTypeLabel(paymentType?: string | null) {
  const normalized = paymentType || "standard";
  const labels: Record<string, string> = {
    standard: "Standard",
    finanziamento: "Finanziamento",
    bonus: "Bonus edilizio",
    rateale: "Rateale",
  };
  return labels[normalized] || normalized;
}

function getNextAction(order: OrderWithDetails, due: number, materials: ReturnType<typeof getMaterialSummary>) {
  const days = getDaysToExpectedDate(order);
  if (due > 0 && getAmountCollected(order) === 0) return "Incassare acconto";
  if (days !== null && days < 0) return "Sbloccare posa";
  if (materials.total > 0 && materials.toOrder > 0) return "Ordinare materiali";
  if (materials.total > 0 && materials.ready < materials.total) return "Verificare arrivi";
  if (materials.total > 0 && materials.ready === materials.total) return "Preparare posa";
  return "Aprire scheda";
}

function getCustomerName(order: OrderWithDetails) {
  if (!order.customer) return "Cliente non indicato";
  return `${order.customer.first_name} ${order.customer.last_name}`.trim() || "Cliente non indicato";
}

function formatPersonName(person?: { first_name: string | null; last_name: string | null } | null) {
  if (!person) return null;
  return `${person.first_name || ""} ${person.last_name || ""}`.trim() || null;
}

function getLaborSummary(order: OrderWithDetails) {
  const employees = (order.order_employees || [])
    .map((row) => formatPersonName(row.employee))
    .filter(Boolean) as string[];
  const teams = (order.order_external_teams || [])
    .map((row) => row.external_team?.name?.trim())
    .filter(Boolean) as string[];
  const names = [...employees, ...teams].filter((name, index, array) => array.indexOf(name) === index);
  const primary = names[0] || null;
  const label = teams.length > 0 && employees.length === 0 ? "Subappalto" : employees.length > 0 ? "Squadra interna" : "Montaggio";

  return {
    employees,
    teams,
    names,
    label,
    primary,
    shortLabel: primary ? `${primary}${names.length > 1 ? ` +${names.length - 1}` : ""}` : "Non assegnato",
    detailLabel: names.length > 0 ? names.join(", ") : "Nessuna squadra assegnata",
  };
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" | "warning" }) {
  return (
    <div className="rounded-md border bg-muted/20 px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-0.5 text-xs font-semibold text-foreground",
        tone === "danger" && "text-red-700",
        tone === "success" && "text-emerald-700",
        tone === "warning" && "text-amber-700"
      )}>
        {value}
      </p>
    </div>
  );
}

export const OrdersPipelineCard = memo(function OrdersPipelineCard({ order, isDraggable = true }: OrdersPipelineCardProps) {
  const navigate = useNavigate();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryPosition, setSummaryPosition] = useState<{ left: number; top: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const overdue = isOverdue(order);
  const due = getAmountDue(order);
  const collected = getAmountCollected(order);
  const materials = getMaterialSummary(order);
  const paymentPct = order.total_amount > 0 ? Math.min(100, Math.round((collected / order.total_amount) * 100)) : 0;
  const isPaid = due === 0 && order.total_amount > 0;
  const needsMaterials = materials.total > 0 && materials.ready < materials.total;
  const nextAction = getNextAction(order, due, materials);
  const customerName = getCustomerName(order);
  const labor = getLaborSummary(order);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const updateSummaryPosition = useCallback((clientX: number, clientY: number) => {
    const panelWidth = 384;
    const panelHeight = 440;
    const margin = 12;
    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 800;
    const leftCandidate = clientX + 16;
    const left = leftCandidate + panelWidth > viewportWidth - margin
      ? Math.max(margin, clientX - panelWidth - 16)
      : leftCandidate;
    const top = Math.min(
      Math.max(margin, clientY - 24),
      Math.max(margin, viewportHeight - panelHeight - margin)
    );

    setSummaryPosition({ left, top });
  }, []);

  useEffect(() => () => {
    clearLongPressTimer();
    clearHoverTimer();
    clearCloseTimer();
  }, [clearCloseTimer, clearHoverTimer, clearLongPressTimer]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    startPointRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      updateSummaryPosition(event.clientX, event.clientY);
      setSummaryOpen(true);
    }, SUMMARY_OPEN_DELAY_MS);
  }, [clearLongPressTimer, updateSummaryPosition]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!startPointRef.current) return;
    const dx = Math.abs(event.clientX - startPointRef.current.x);
    const dy = Math.abs(event.clientY - startPointRef.current.y);
    if (dx > 10 || dy > 10) clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handlePointerEnd = useCallback(() => {
    clearLongPressTimer();
    startPointRef.current = null;
  }, [clearLongPressTimer]);

  const handleMouseEnter = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (summaryOpen) return;
    clearCloseTimer();
    clearHoverTimer();
    updateSummaryPosition(event.clientX, event.clientY);
    hoverTimerRef.current = window.setTimeout(() => {
      setSummaryOpen(true);
    }, SUMMARY_OPEN_DELAY_MS);
  }, [clearCloseTimer, clearHoverTimer, summaryOpen, updateSummaryPosition]);

  const handleMouseLeave = useCallback(() => {
    clearHoverTimer();
    if (summaryOpen) {
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setSummaryOpen(false);
      }, 250);
    }
  }, [clearCloseTimer, clearHoverTimer, summaryOpen]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!summaryOpen) updateSummaryPosition(event.clientX, event.clientY);
    if (summaryOpen || hoverTimerRef.current !== null) return;
    handleMouseEnter(event);
  }, [handleMouseEnter, summaryOpen, updateSummaryPosition]);

  const handlePointerEnterHover = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    handleMouseEnter(event);
  }, [handleMouseEnter]);

  const handlePointerLeaveHover = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    handleMouseLeave();
  }, [handleMouseLeave]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
  } = useDraggable({
    id: order.id,
    data: { order },
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  const handleCardClick = useCallback(() => {
    if (isDragging) return;
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    navigate(`/azienda/ordini/${order.id}`);
  }, [isDragging, navigate, order.id]);

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "touch-none w-full min-w-0",
          isDragging && "opacity-50 z-50",
          summaryOpen && "relative z-50"
        )}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onPointerEnter={handlePointerEnterHover}
        onPointerLeave={handlePointerLeaveHover}
      >
      <div className={cn(
        "rounded-lg border bg-card shadow-sm group relative transition-all",
        isDraggable && "hover:shadow-md",
        isDragging && "shadow-lg ring-2 ring-primary",
        overdue && "border-orange-300 dark:border-orange-600"
      )}>
        {/* Overdue top accent */}
        {overdue && (
          <div className="h-1 bg-gradient-to-r from-orange-400 to-orange-500 rounded-t-lg" />
        )}

        <div className="flex">
          {/* Drag handle — full height strip */}
          {isDraggable && (
            <div
              {...attributes}
              {...listeners}
              className="flex items-center px-1.5 cursor-grab active:cursor-grabbing text-muted-foreground/25 hover:text-muted-foreground/60 hover:bg-muted/40 rounded-l-lg transition-colors shrink-0"
            >
              <GripVertical className="h-4 w-4" />
            </div>
          )}

          {/* Card body */}
          <div
            className="flex-1 py-2.5 pr-3 pl-1 cursor-pointer min-w-0"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onPointerLeave={handlePointerEnd}
            onMouseEnter={handleMouseEnter}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onFocus={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              updateSummaryPosition(rect.right, rect.top + 24);
              if (!summaryOpen) {
                clearHoverTimer();
                hoverTimerRef.current = window.setTimeout(() => setSummaryOpen(true), SUMMARY_OPEN_DELAY_MS);
              }
            }}
            onBlur={handleMouseLeave}
            onContextMenu={(event) => {
              if (longPressTriggeredRef.current || summaryOpen) event.preventDefault();
            }}
            onClick={handleCardClick}
            tabIndex={0}
            role="button"
            aria-label={`Apri dettagli commessa ${order.order_code || ""}`.trim()}
          >
            {/* Codice */}
            <div className="flex items-start gap-2">
              <p className="font-semibold text-sm leading-tight truncate">{order.order_code || "—"}</p>
              {overdue && (
                <span className="ml-auto inline-flex items-center rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 ring-1 ring-orange-200">
                  Urgente
                </span>
              )}
            </div>

            {/* Cliente */}
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {customerName}
            </p>

            {/* Descrizione */}
            {order.description && (
              <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
                {order.description}
              </p>
            )}

            {/* Importo + pagamenti */}
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-sm">{formatCurrency(order.total_amount)}</p>
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  isPaid
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : due > 0
                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      : "bg-muted text-muted-foreground"
                )}>
                  <Euro className="h-2.5 w-2.5" />
                  {isPaid ? "Pagata" : due > 0 ? `${paymentPct}% inc.` : "No incassi"}
                </span>
              </div>
              <PaymentBar order={order} />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
              <span className={cn(
                "inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1",
                overdue
                  ? "bg-orange-50 text-orange-700 ring-1 ring-orange-200"
                  : "bg-muted/60 text-muted-foreground"
              )}>
                {overdue ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <CalendarIcon className="h-3 w-3 shrink-0" />}
                <span className="truncate">{getDateLabel(order)}</span>
              </span>
              <span className={cn(
                "inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1",
                needsMaterials
                  ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                  : materials.total > 0
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-muted/60 text-muted-foreground"
              )}>
                {needsMaterials ? <PackageX className="h-3 w-3 shrink-0" /> : <PackageCheck className="h-3 w-3 shrink-0" />}
                <span className="truncate">
                  {materials.total > 0 ? `${materials.ready}/${materials.total} pronti` : "No articoli"}
                </span>
              </span>
            </div>

            <div className={cn(
              "mt-1.5 flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px]",
              labor.primary
                ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                : "bg-muted/60 text-muted-foreground"
            )}>
              <Users className="h-3 w-3 shrink-0" />
              <span className="truncate">{labor.shortLabel}</span>
            </div>

            <div className="mt-2 flex items-center gap-1.5 rounded-md bg-primary/5 px-2 py-1.5 text-[11px] font-medium text-primary">
              {nextAction === "Preparare posa" ? (
                <CheckCircle2 className="h-3 w-3 shrink-0" />
              ) : (
                <AlertTriangle className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">{nextAction}</span>
            </div>
          </div>
        </div>

        {/* Quick actions on hover */}
        <div className="absolute top-1.5 right-1.5 hidden group-hover:flex gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/azienda/ordini/${order.id}`); }}
            className="p-1 rounded bg-background/95 shadow-sm border text-muted-foreground hover:text-foreground transition-colors"
            title="Visualizza"
          >
            <Eye className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/azienda/ordini/${order.id}/modifica`); }}
            className="p-1 rounded bg-background/95 shadow-sm border text-muted-foreground hover:text-foreground transition-colors"
            title="Modifica"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>

        </div>
      </div>
      {summaryOpen && summaryPosition && (
        <div
          className="fixed z-[80] max-h-[calc(100vh-1.5rem)] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border bg-background p-3 text-left shadow-xl ring-1 ring-black/5"
          style={{ left: summaryPosition.left, top: summaryPosition.top }}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={handleMouseLeave}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight text-foreground">
                {order.order_code || "Commessa senza codice"} · {order.status?.name || "Senza stato"}
              </p>
              <p className="mt-1 text-sm leading-snug text-foreground">
                {customerName}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">
                {order.description || "Descrizione non indicata"}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md px-1.5 py-0.5 text-lg leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                clearCloseTimer();
                setSummaryOpen(false);
              }}
              aria-label="Chiudi riepilogo commessa"
            >
              x
            </button>
          </div>

          <div className="mt-3 space-y-2 border-t pt-3 text-xs">
            {order.indirizzo_lavori && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="line-clamp-2">{order.indirizzo_lavori}</span>
              </div>
            )}
            <div className="flex items-start gap-2 text-muted-foreground">
              <CalendarIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-medium text-foreground">Posa: </span>
                {getDateLabel(order)}
              </span>
            </div>
            <div className="flex items-start gap-2 text-muted-foreground">
              <CalendarIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-medium text-foreground">Lavori: </span>
                {getWorkPeriodLabel(order)}
              </span>
            </div>
            <div className="flex items-start gap-2 text-muted-foreground">
              <PackageCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-medium text-foreground">Arrivo magazzino: </span>
                {getFullDateLabel(order.warehouse_arrival_date)}
              </span>
            </div>
            <div className="flex items-start gap-2 text-muted-foreground">
              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-medium text-foreground">{labor.label}: </span>
                {labor.detailLabel}
              </span>
            </div>
            <div className="flex items-start gap-2 text-muted-foreground">
              <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-medium text-foreground">Azione: </span>
                {nextAction}
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <SummaryRow label="Stato" value={order.status?.name || "Senza stato"} />
            <SummaryRow label="Pagamento" value={getPaymentTypeLabel(order.payment_type)} />
            <SummaryRow label="Valore" value={formatCurrency(order.total_amount)} />
            <SummaryRow
              label="Incassato"
              value={`${formatCurrency(collected)} (${paymentPct}%)`}
              tone={isPaid ? "success" : due > 0 ? "warning" : undefined}
            />
            <SummaryRow
              label="Da incassare"
              value={formatCurrency(due)}
              tone={due > 0 ? "warning" : "success"}
            />
            <SummaryRow
              label="Posa"
              value={getDateLabel(order)}
              tone={overdue ? "danger" : undefined}
            />
            <SummaryRow
              label="Materiali pronti"
              value={materials.total > 0 ? `${materials.ready}/${materials.total}` : "Nessun articolo"}
              tone={needsMaterials ? "danger" : materials.total > 0 ? "success" : undefined}
            />
            <SummaryRow
              label="Da ordinare"
              value={`${materials.toOrder}`}
              tone={materials.toOrder > 0 ? "warning" : "success"}
            />
            <SummaryRow
              label="Articoli totali"
              value={`${materials.total}`}
              tone={materials.total > 0 ? undefined : "warning"}
            />
            <SummaryRow
              label="Assegnazioni"
              value={`${labor.names.length}`}
              tone={labor.names.length > 0 ? "success" : "warning"}
            />
          </div>

          <div className="mt-3 flex justify-end border-t pt-3">
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              onClick={(event) => {
                event.stopPropagation();
                clearCloseTimer();
                setSummaryOpen(false);
                navigate(`/azienda/ordini/${order.id}`);
              }}
            >
              Apri commessa
            </button>
          </div>
        </div>
      )}
    </>
  );
});
