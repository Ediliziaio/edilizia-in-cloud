import { useState, type ReactNode } from "react";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PipelineDragScope,
  PipelineDrop,
  PipelineMoveCard,
} from "@/components/orders/PipelineDrag";
import { cn } from "@/lib/utils";

export interface OperationalColumn<T> {
  id: string;
  label: string;
  hint: string;
  accent: string;
  items: T[];
}

const COLUMN_COLORS: Record<string, string> = {
  slate: "#64748b",
  blue: "#2563eb",
  sky: "#0284c7",
  indigo: "#4f46e5",
  yellow: "#ca8a04",
  amber: "#d97706",
  orange: "#ea580c",
  green: "#16a34a",
  emerald: "#059669",
  red: "#dc2626",
  rose: "#e11d48",
  violet: "#7c3aed",
  purple: "#9333ea",
  teal: "#0d9488",
  cyan: "#0891b2",
};

/** Same compact column frame for documents, purchases and safety workflows. */
export function OperationalColumnFrame({
  id,
  label,
  hint,
  count,
  color,
  accent = "",
  alert,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  count: number;
  color?: string;
  accent?: string;
  alert?: string;
  children: ReactNode;
}) {
  const [collapseChoice, setCollapsed] = useState<boolean | null>(null);
  const collapsed = collapseChoice ?? count === 0;
  const tone =
    color ??
    COLUMN_COLORS[accent.split("border-t-")[1]?.split("-")[0]] ??
    COLUMN_COLORS.slate;
  return (
    <PipelineDrop
      id={id}
      label={label}
      className={cn(
        "shrink-0 overflow-hidden rounded-lg border bg-muted/20 transition-[width]",
        collapsed ? "w-11" : "w-[280px] max-w-[360px] flex-1",
      )}
    >
      <header
        className={cn(
          "border-b border-t-[3px] bg-muted/60 py-2.5",
          collapsed ? "px-1" : "px-3",
        )}
        style={{ borderTopColor: tone }}
      >
        <div className={cn("flex items-center gap-2", collapsed && "flex-col")}>
          {!collapsed && (
            <h2
              className="min-w-0 flex-1 truncate text-sm font-bold"
              title={label}
            >
              {label}
            </h2>
          )}
          <span
            data-testid={`conteggio-${id}`}
            className="rounded-full px-2 text-xs font-bold tabular-nums text-white"
            style={{ backgroundColor: tone }}
          >
            {count}
          </span>
          <button
            type="button"
            aria-label={`${collapsed ? "Espandi" : "Comprimi"} ${label}`}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
            className="rounded p-0.5 text-muted-foreground hover:bg-white focus-visible:ring-2 focus-visible:ring-primary"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        {!collapsed && (
          <p
            className="mt-1 truncate text-[11px] text-muted-foreground"
            title={hint}
          >
            {hint || "Nessun elemento"}
          </p>
        )}
        {!collapsed && alert && (
          <p className="mt-1 text-[10px] font-medium text-orange-700">
            {alert}
          </p>
        )}
      </header>
      {collapsed ? (
        <p className="mx-auto py-4 text-xs font-semibold text-muted-foreground [writing-mode:vertical-rl]">
          {label}
        </p>
      ) : (
        <div className="max-h-[min(65vh,640px)] space-y-2 overflow-y-auto p-2 [scrollbar-width:thin]">
          {children}
        </div>
      )}
    </PipelineDrop>
  );
}

/** Shared board with whole-card dragging and an accessible move menu. */
export function OperationalBoard<T extends { id: string }>({
  columns,
  renderCard,
  label,
  onMove,
  disabled,
  getLabel,
  onOpen,
  renderActions,
}: {
  columns: OperationalColumn<T>[];
  renderCard: (item: T) => ReactNode;
  label: string;
  onMove?: (id: string, target: string) => void;
  disabled?: boolean;
  getLabel?: (item: T) => string;
  onOpen?: (item: T) => void;
  renderActions?: (item: T) => ReactNode;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [limits, setLimits] = useState<Record<string, number>>({});
  return (
    <PipelineDragScope onMove={onMove} disabled={disabled}>
      <div className="min-w-0" aria-label={label} role="region">
        <BarraScorrimentoOrizzontale contenitore={container} className="mb-2" />
        <div
          ref={setContainer}
          className="overflow-x-auto pb-2 [scrollbar-width:thin]"
        >
          <div className="flex w-max min-w-full items-start gap-2">
            {columns.map((column) => {
              const limit = limits[column.id] ?? 12;
              return (
                <OperationalColumnFrame
                  key={column.id}
                  id={column.id}
                  label={column.label}
                  hint={column.hint}
                  count={column.items.length}
                  accent={column.accent}
                >
                  {column.items.slice(0, limit).map((item) => (
                    <PipelineMoveCard
                      key={item.id}
                      id={item.id}
                      stage={column.id}
                      label={getLabel?.(item) ?? item.id}
                      onOpen={onOpen ? () => onOpen(item) : undefined}
                      actions={renderActions?.(item)}
                      targets={columns.map((c) => ({
                        id: c.id,
                        label: c.label,
                      }))}
                    >
                      {renderCard(item)}
                    </PipelineMoveCard>
                  ))}
                  {!column.items.length && (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                      Nessun documento in questa fase
                    </p>
                  )}
                  {column.items.length > limit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        setLimits((old) => ({
                          ...old,
                          [column.id]: limit + 12,
                        }))
                      }
                    >
                      Mostra altri · {column.items.length - limit} rimanenti
                    </Button>
                  )}
                </OperationalColumnFrame>
              );
            })}
          </div>
        </div>
      </div>
    </PipelineDragScope>
  );
}

export function OperationalPagination({
  page,
  total,
  size = 25,
  onChange,
  label,
}: {
  page: number;
  total: number;
  size?: number;
  onChange: (page: number) => void;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"
    >
      <span>
        {total ? (page - 1) * size + 1 : 0}–{Math.min(page * size, total)} di{" "}
        {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Precedenti
        </Button>
        <span>
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Successivi
        </Button>
      </div>
    </nav>
  );
}
