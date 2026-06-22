/**
 * OrderSelectCombobox — selettore intelligente di ordini per scarico cantiere.
 *
 * Pensato per scalare a migliaia di ordini. Caratteristiche:
 *   • Ricerca testuale live (codice ordine, cliente, indirizzo cantiere)
 *   • Ordinamento di default per data lavori più vicina (ws → we → expected)
 *   • Filtri rapidi: "Prossimi 30gg" (default) / "In corso" / "Tutti"
 *   • Per ogni ordine mostra: codice, cliente, badge data lavori, indirizzo
 *   • Server-side search debounced per evitare di scaricare migliaia di righe
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search, CalendarClock, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";

export interface OrderOption {
  id: string;
  order_code: string;
  customer_name: string | null;
  default_warehouse_id: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  expected_date: string | null;
  indirizzo_lavori: string | null;
  status: string | null;
}

interface Props {
  companyId: string | undefined;
  value: string | undefined;
  onChange: (orderId: string, order: OrderOption) => void;
  disabled?: boolean;
  placeholder?: string;
}

type Filter = "soon" | "in_corso" | "all";

const FILTERS: { key: Filter; label: string; description: string }[] = [
  { key: "soon", label: "Prossimi 30gg", description: "Lavori da iniziare nei prossimi 30 giorni" },
  { key: "in_corso", label: "In corso", description: "Status = in_corso" },
  { key: "all", label: "Tutti", description: "Tutti gli ordini recenti" },
];

function fmtDate(d: string | null): string {
  if (!d) return "";
  try {
    return format(parseISO(d), "d MMM yyyy", { locale: it });
  } catch {
    return d;
  }
}

// Restituisce label + classi COMPLETE (sfondo + testo) sempre leggibili.
// Bug precedente: usava variant 'default' (sfondo primary/blu) con testo
// colorato (blu/emerald) → testo blu su sfondo blu, illeggibile.
function relativeBadge(workStart: string | null, workEnd: string | null, expected: string | null): { label: string; cls: string } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ref = workStart ?? expected ?? workEnd;
  if (!ref) return null;
  let date: Date;
  try {
    date = parseISO(ref);
  } catch {
    return null;
  }
  const days = differenceInDays(date, today);
  if (days < -7) return { label: fmtDate(ref), cls: "bg-muted text-muted-foreground" };
  if (days < 0) return { label: `${Math.abs(days)}gg fa`, cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" };
  if (days === 0) return { label: "OGGI", cls: "bg-emerald-600 text-white" };
  if (days <= 3) return { label: `${days}gg`, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" };
  if (days <= 14) return { label: `${days}gg`, cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" };
  if (days <= 30) return { label: fmtDate(ref), cls: "bg-muted text-muted-foreground" };
  return { label: fmtDate(ref), cls: "bg-muted text-muted-foreground" };
}

export function OrderSelectCombobox({ companyId, value, onChange, disabled, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("soon");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search to avoid hammering DB
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: orders = [], isLoading } = useQuery<OrderOption[]>({
    queryKey: ["scarico-cantiere-orders-v2", companyId, filter, debouncedSearch],
    enabled: !!companyId && open,
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from("orders")
        .select(`
          id, order_code, client_name, client_company,
          work_start_date, work_end_date, expected_date,
          indirizzo_lavori, work_address, status,
          order_items ( destination_warehouse_id )
        `)
        .eq("company_id", companyId);

      if (filter === "soon") {
        const today = new Date();
        const in30 = new Date(today);
        in30.setDate(in30.getDate() + 30);
        const todayStr = today.toISOString().slice(0, 10);
        const in30Str = in30.toISOString().slice(0, 10);
        q = q.or(
          `and(work_start_date.gte.${todayStr},work_start_date.lte.${in30Str}),` +
          `and(work_start_date.is.null,expected_date.gte.${todayStr},expected_date.lte.${in30Str})`,
        );
      } else if (filter === "in_corso") {
        q = q.eq("status", "in_corso");
      }

      if (debouncedSearch) {
        const s = `%${debouncedSearch}%`;
        q = q.or(
          `order_code.ilike.${s},client_name.ilike.${s},client_company.ilike.${s},indirizzo_lavori.ilike.${s},work_address.ilike.${s}`,
        );
      }

      // Ordering: work_start_date ASC NULLS LAST, then expected_date ASC
      q = q.order("work_start_date", { ascending: true, nullsFirst: false }).limit(200);

      const { data, error } = await q;
      if (error) throw error;
      type RawRow = {
        id: string;
        order_code: string | null;
        client_name: string | null;
        client_company: string | null;
        work_start_date: string | null;
        work_end_date: string | null;
        expected_date: string | null;
        indirizzo_lavori: string | null;
        work_address: string | null;
        status: string | null;
        order_items?: Array<{ destination_warehouse_id: string | null }> | null;
      };
      return ((data ?? []) as unknown as RawRow[]).map((o) => ({
        id: o.id,
        order_code: o.order_code ?? "—",
        customer_name: o.client_company || o.client_name,
        default_warehouse_id:
          o.order_items?.find((i) => i.destination_warehouse_id)?.destination_warehouse_id ?? null,
        work_start_date: o.work_start_date,
        work_end_date: o.work_end_date,
        expected_date: o.expected_date,
        indirizzo_lavori: o.indirizzo_lavori || o.work_address,
        status: o.status,
      }));
    },
  });

  // Selected order info displayed on trigger
  const [selectedOrder, setSelectedOrder] = useState<OrderOption | null>(null);
  useEffect(() => {
    if (!value) {
      setSelectedOrder(null);
      return;
    }
    const found = orders.find((o) => o.id === value);
    if (found) setSelectedOrder(found);
  }, [value, orders]);

  // Lookup separato se l'ordine selezionato non è nella lista corrente
  const { data: standaloneOrder } = useQuery<OrderOption | null>({
    queryKey: ["scarico-order-lookup", value],
    enabled: !!value && !selectedOrder,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!value) return null;
      const { data } = await supabase
        .from("orders")
        .select(`id, order_code, client_name, client_company, work_start_date, work_end_date, expected_date, indirizzo_lavori, work_address, status, order_items ( destination_warehouse_id )`)
        .eq("id", value)
        .maybeSingle();
      if (!data) return null;
      type RawRow = typeof data & { order_items?: Array<{ destination_warehouse_id: string | null }> | null };
      const r = data as RawRow;
      return {
        id: r.id,
        order_code: r.order_code ?? "—",
        customer_name: r.client_company || r.client_name,
        default_warehouse_id:
          r.order_items?.find((i) => i.destination_warehouse_id)?.destination_warehouse_id ?? null,
        work_start_date: r.work_start_date,
        work_end_date: r.work_end_date,
        expected_date: r.expected_date,
        indirizzo_lavori: r.indirizzo_lavori || r.work_address,
        status: r.status,
      };
    },
  });
  useEffect(() => {
    if (standaloneOrder && !selectedOrder) setSelectedOrder(standaloneOrder);
  }, [standaloneOrder, selectedOrder]);

  const handleSelect = useCallback(
    (order: OrderOption) => {
      setSelectedOrder(order);
      onChange(order.id, order);
      setOpen(false);
    },
    [onChange],
  );

  // Group orders by relative time bucket for visual scanning
  const groups = useMemo(() => {
    const today: OrderOption[] = [];
    const thisWeek: OrderOption[] = [];
    const thisMonth: OrderOption[] = [];
    const other: OrderOption[] = [];
    for (const o of orders) {
      const ref = o.work_start_date ?? o.expected_date;
      if (!ref) {
        other.push(o);
        continue;
      }
      try {
        const days = differenceInDays(parseISO(ref), new Date());
        if (days >= 0 && days <= 0) today.push(o);
        else if (days > 0 && days <= 7) thisWeek.push(o);
        else if (days > 7 && days <= 30) thisMonth.push(o);
        else other.push(o);
      } catch {
        other.push(o);
      }
    }
    return { today, thisWeek, thisMonth, other };
  }, [orders]);

  const totalCount = orders.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between text-left font-normal h-auto min-h-10 py-2",
            !selectedOrder && "text-muted-foreground",
          )}
        >
          {selectedOrder ? (
            <div className="flex flex-col items-start gap-0.5 truncate flex-1 min-w-0">
              <span className="font-medium text-sm">{selectedOrder.order_code}</span>
              <span className="text-xs text-muted-foreground truncate w-full">
                {selectedOrder.customer_name}
                {selectedOrder.work_start_date && (
                  <> · lavori dal {fmtDate(selectedOrder.work_start_date)}</>
                )}
              </span>
            </div>
          ) : (
            <span className="truncate">{placeholder ?? "Scegli un ordine..."}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          {/* Search input */}
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Cerca per codice, cliente o indirizzo…"
              value={search}
              onValueChange={setSearch}
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-0 focus:ring-0"
            />
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-1 px-2 py-2 border-b bg-muted/30">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "text-[11px] px-2 py-1 rounded-md transition-colors",
                  filter === f.key
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted",
                )}
                title={f.description}
              >
                {f.label}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {isLoading ? "…" : `${totalCount}${totalCount === 200 ? "+" : ""}`}
            </span>
          </div>

          <CommandList
            className="max-h-[400px] overscroll-contain"
            onWheel={(e) => {
              e.currentTarget.scrollTop += e.deltaY;
            }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                Caricamento ordini…
              </div>
            ) : totalCount === 0 ? (
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                {debouncedSearch
                  ? `Nessun ordine corrisponde a "${debouncedSearch}"`
                  : filter === "soon"
                    ? "Nessun ordine con lavori nei prossimi 30 giorni"
                    : "Nessun ordine trovato"}
              </CommandEmpty>
            ) : (
              <>
                <OrderGroup heading="📅 Oggi" orders={groups.today} value={value} onSelect={handleSelect} />
                <OrderGroup heading="📅 Prossimi 7 giorni" orders={groups.thisWeek} value={value} onSelect={handleSelect} />
                <OrderGroup heading="📅 Prossimi 30 giorni" orders={groups.thisMonth} value={value} onSelect={handleSelect} />
                <OrderGroup heading="📋 Altri" orders={groups.other} value={value} onSelect={handleSelect} />
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function OrderGroup({
  heading,
  orders,
  value,
  onSelect,
}: {
  heading: string;
  orders: OrderOption[];
  value: string | undefined;
  onSelect: (o: OrderOption) => void;
}) {
  if (orders.length === 0) return null;
  return (
    <CommandGroup heading={heading}>
      {orders.map((o) => {
        const badge = relativeBadge(o.work_start_date, o.work_end_date, o.expected_date);
        const isSelected = value === o.id;
        return (
          <CommandItem
            key={o.id}
            value={o.id}
            onSelect={() => onSelect(o)}
            className="flex flex-col items-start gap-1 py-2 cursor-pointer"
          >
            <div className="flex items-center gap-2 w-full">
              <Check className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
              <span className="font-medium text-sm truncate">{o.order_code}</span>
              {o.customer_name && (
                <span className="text-xs text-muted-foreground truncate">· {o.customer_name}</span>
              )}
              {badge && (
                <span className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2 h-5 text-[10px] font-medium shrink-0", badge.cls)}>
                  <CalendarClock className="h-2.5 w-2.5" />
                  {badge.label}
                </span>
              )}
            </div>
            {o.indirizzo_lavori && (
              <div className="flex items-center gap-1 pl-5 text-[11px] text-muted-foreground truncate w-full">
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{o.indirizzo_lavori}</span>
              </div>
            )}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
