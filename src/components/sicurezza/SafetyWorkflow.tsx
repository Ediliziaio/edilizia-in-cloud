import { PipelineCardHeading } from "@/components/orders/PipelineDrag";
import { isPipelineCardControl } from "@/lib/orders/cardInteraction";
import { useOperationalViewMemory } from "@/hooks/useOperationalViewMemory";
import { OperationalHelp } from "@/components/orders/OperationalHelp";
import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, X, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { OperationalViewSwitch } from "@/components/orders/OperationalViewSwitch";
import {
  OperationalBoard,
  OperationalPagination,
} from "@/components/orders/OperationalBoard";
import { OperationalTable } from "@/components/orders/OperationalTable";
import { operationalPage } from "@/lib/orders/operationalFilters";
import { cn } from "@/lib/utils";

export interface SafetyStage {
  id: string;
  label: string;
  hint: string;
  accent: string;
}
export interface SafetyTransition {
  title: string;
  description: string;
  label?: string;
  run: () => void | Promise<unknown>;
}
export function SafetyWorkflow<T extends { id: string }>({
  namespace,
  label,
  items,
  stages,
  getStage,
  getTitle,
  getSearch,
  getOrderId,
  orders,
  columns,
  renderCard,
  renderActions,
  onOpen,
  onTransition,
  canWrite = false,
  note,
  toolbarAction,
  defaultView = "pipeline",
}: {
  namespace: string;
  label: string;
  items: T[];
  stages: SafetyStage[];
  getStage: (item: T) => string;
  getTitle: (item: T) => string;
  getSearch: (item: T) => string;
  getOrderId: (item: T) => string | null | undefined;
  orders: Array<{
    id: string;
    order_code: string | null;
    description: string | null;
  }>;
  columns: Array<{ label: string; render: (item: T) => ReactNode }>;
  renderCard: (item: T) => ReactNode;
  renderActions?: (item: T) => ReactNode;
  onOpen?: (item: T) => void;
  onTransition?: (item: T, target: string) => SafetyTransition | null;
  canWrite?: boolean;
  note?: string;
  toolbarAction?: ReactNode;
  defaultView?: "pipeline" | "elenco";
}) {
  const [params, setParams] = useSearchParams();
  const key = (name: string) => `sic_${namespace}_${name}`;
  useOperationalViewMemory(
    `sic_${namespace}`,
    ["vista", "cerca", "commessa", "fase"].map(key),
  );
  const rawView = params.get(key("vista"));
  const view =
    rawView === "elenco" || rawView === "pipeline" ? rawView : defaultView;
  const search = params.get(key("cerca")) ?? "";
  const order = params.get(key("commessa")) ?? "tutte";
  const raw = params.get(key("fase")) ?? "tutte";
  const phase = stages.some((s) => s.id === raw) ? raw : "tutte";
  const [selected, setSelected] = useState<T | null>(null);
  const openItem = (item: T) => (onOpen ? onOpen(item) : setSelected(item));
  const [transition, setTransition] = useState<SafetyTransition | null>(null);
  const [pending, setPending] = useState(false);
  const update = (values: Record<string, string | null>) =>
    setParams(
      (before) => {
        const next = new URLSearchParams(before);
        if (Object.keys(values).some((v) => v !== "pagina" && v !== "vista"))
          next.delete(key("pagina"));
        for (const [name, value] of Object.entries(values)) {
          if (!value || value === "tutte") next.delete(key(name));
          else next.set(key(name), value);
        }
        return next;
      },
      { replace: true },
    );
  const base = items.filter(
    (item) =>
      (!search.trim() ||
        getSearch(item)
          .toLocaleLowerCase("it")
          .includes(search.trim().toLocaleLowerCase("it"))) &&
      (order === "tutte" ||
        (order === "nessuna" ? !getOrderId(item) : getOrderId(item) === order)),
  );
  const rows = base.filter(
    (item) => phase === "tutte" || getStage(item) === phase,
  );
  const page = operationalPage(params.get(key("pagina")), rows.length);
  const active = !!search || order !== "tutte" || phase !== "tutte";
  const actions = (item: T) => (
    <div className="flex items-center justify-end gap-1">
      {renderActions?.(item)}
    </div>
  );
  const move = (id: string, target: string) => {
    if (!canWrite || pending) return;
    const item = items.find((i) => i.id === id);
    if (item && getStage(item) !== target)
      setTransition(onTransition?.(item, target) ?? null);
  };
  return (
    <div className="min-w-0 space-y-4">
      <section
        aria-label={`Filtri ${label}`}
        className="space-y-2 rounded-xl border bg-white p-2.5 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-2">
          <OperationalViewSwitch
            value={view}
            onChange={(v) => update({ vista: v })}
          />
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label={`Cerca ${label}`}
              placeholder="Cerca documento, commessa o responsabile…"
              value={search}
              onChange={(e) => update({ cerca: e.target.value })}
              className="h-8 pl-9 text-xs"
            />
          </div>
          <Select value={order} onValueChange={(v) => update({ commessa: v })}>
            <SelectTrigger
              className="h-8 w-[200px] text-xs"
              aria-label={`Commessa ${label}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutte">Tutte le commesse</SelectItem>
              <SelectItem value="nessuna">Senza commessa</SelectItem>
              {orders
                .filter((o) => items.some((i) => getOrderId(i) === o.id))
                .map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.order_code || o.description || "Commessa"}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                update({ cerca: null, commessa: null, fase: null })
              }
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Azzera
            </Button>
          )}
          {note && <OperationalHelp>{note}</OperationalHelp>}
          {toolbarAction}
        </div>
        <div
          role="group"
          aria-label={`Fasi ${label}`}
          className="flex gap-1 overflow-x-auto border-t pt-2"
        >
          {[{ id: "tutte", label: "Tutti" }, ...stages].map((stage) => (
            <button
              key={stage.id}
              type="button"
              aria-pressed={phase === stage.id}
              onClick={() => update({ fase: stage.id })}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium",
                phase === stage.id
                  ? "bg-orange-50 text-orange-800 ring-1 ring-inset ring-orange-100"
                  : "text-muted-foreground hover:bg-slate-50",
              )}
            >
              {stage.label}
              <span className="rounded-full bg-slate-100 px-1.5 text-[10px]">
                {stage.id === "tutte"
                  ? base.length
                  : base.filter((i) => getStage(i) === stage.id).length}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {rows.length} di {items.length} {label.toLowerCase()}
        </p>
      </section>
      {!rows.length ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {active
            ? "Nessun risultato per questi filtri."
            : "Nessun elemento registrato."}
        </div>
      ) : view === "pipeline" ? (
        <OperationalBoard
          label={`Pipeline ${label}`}
          columns={stages.map((s) => ({
            ...s,
            items: rows.filter((i) => getStage(i) === s.id),
          }))}
          getLabel={getTitle}
          onOpen={openItem}
          renderActions={renderActions}
          disabled={pending}
          onMove={canWrite && onTransition ? move : undefined}
          renderCard={(item) => (
            <article className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
              <PipelineCardHeading>
                <p className="min-w-0 text-sm font-semibold">
                  {getTitle(item)}
                </p>
              </PipelineCardHeading>
              {getOrderId(item) && (
                <Link
                  to={`/azienda/ordini/${getOrderId(item)}`}
                  className="block text-xs text-primary hover:underline"
                >
                  {orders.find((o) => o.id === getOrderId(item))?.order_code ??
                    "Apri commessa"}
                </Link>
              )}
              {renderCard(item)}
            </article>
          )}
        />
      ) : (
        <>
          <OperationalTable label={`Elenco ${label}`}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label} scope="col">
                    {c.label}
                  </th>
                ))}
                <th scope="col">Fase</th>
                {renderActions && <th scope="col">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {rows.slice((page - 1) * 25, page * 25).map((item) => (
                <tr
                  key={item.id}
                  tabIndex={0}
                  aria-label={`Apri ${getTitle(item)}`}
                  className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  onClick={(event) => {
                    if (!isPipelineCardControl(event.target)) openItem(item);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget &&
                      event.key === "Enter"
                    ) {
                      event.preventDefault();
                      openItem(item);
                    }
                  }}
                >
                  {columns.map((c) => (
                    <td key={c.label}>{c.render(item)}</td>
                  ))}
                  <td>
                    <Badge
                      variant="outline"
                      className="whitespace-nowrap text-[10px]"
                    >
                      {stages.find((s) => s.id === getStage(item))?.label ??
                        getStage(item)}
                    </Badge>
                  </td>
                  {renderActions && <td>{actions(item)}</td>}
                </tr>
              ))}
            </tbody>
          </OperationalTable>
          <OperationalPagination
            page={page}
            total={rows.length}
            label={`Pagine ${label}`}
            onChange={(v) => update({ pagina: String(v) })}
          />
        </>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(value) => {
          if (!value) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {selected ? getTitle(selected) : "Dettagli"}
            </DialogTitle>
            <DialogDescription>
              {selected
                ? stages.find((stage) => stage.id === getStage(selected))?.label
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <div className="flex justify-end gap-1">
                {renderActions?.(selected)}
              </div>
              <dl className="grid gap-3">
                {columns.map((column) => (
                  <div key={column.label}>
                    <dt className="text-xs text-muted-foreground">
                      {column.label}
                    </dt>
                    <dd className="mt-1 text-sm">{column.render(selected)}</dd>
                  </div>
                ))}
              </dl>
              <div className="space-y-2 border-t pt-3">
                {renderCard(selected)}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!transition && canWrite}
        onOpenChange={(v) => {
          if (!v && !pending) setTransition(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{transition?.title}</DialogTitle>
            <DialogDescription>{transition?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setTransition(null)}
            >
              Annulla
            </Button>
            <Button
              disabled={pending || !canWrite}
              onClick={async () => {
                if (!transition || pending || !canWrite) return;
                setPending(true);
                try {
                  await transition.run();
                  setTransition(null);
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Operazione non riuscita",
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-1 h-4 w-4" />
              )}
              {transition?.label ?? "Apri e completa il passaggio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
