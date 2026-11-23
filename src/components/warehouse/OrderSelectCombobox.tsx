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
import { Check, ChevronsUpDown, CalendarClock, Loader2 } from "lucide-react";
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
import { filtriRicercaParole } from "@/lib/ricerca/ricercaContatti";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, differenceInDays } from "date-fns";
import { BadgeGenerale, RigaAppartenenza } from "@/components/orders/generali/BadgeGerarchia";
import { COLONNE_GERARCHIA, conGenerali, eGenerale, raggruppaPerGenerale, type RigaGerarchia } from "@/lib/orders/generali/gerarchiaScelta";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

export interface OrderOption extends RigaGerarchia {
  id: string;
  order_code: string;
  customer_name: string | null;
  /** Nome della commessa: per una generale è l'unico nome che c'è (nasce senza cliente né date). */
  description?: string | null;
  default_warehouse_id: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  expected_date: string | null;
  indirizzo_lavori: string | null;
  status: string | null;
}

interface Props {
  id?: string;
  /** Office tasks belong to an operational commessa, which has the Ufficio workspace. */
  soloOperative?: boolean;
  companyId: string | undefined;
  value: string | undefined;
  onChange: (orderId: string, order: OrderOption) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  /** Da dove partire: una fattura può essere di un lavoro già finito, non solo dei prossimi. */
  filtroIniziale?: Filter;
  /** Già scelte altrove nella stessa finestra: non si ripropongono. */
  esclusi?: string[];
  /**
   * Le commesse generali (macro-commesse: sviluppo immobiliare, appalti) sempre nell'elenco, qualunque sia il filtro
   * (18/11/2026). Nascono senza date: ordinate per data d'inizio finivano in fondo alle 200 più recenti, o fuori,
   * e una fattura ricevuta non si poteva mettere su tutta l'operazione senza cercarla per nome.
   */
  generaliSempre?: boolean;
}

type Filter = "soon" | "in_corso" | "generali" | "all";

const FILTERS: { key: Filter; label: string; description: string }[] = [
  { key: "soon", label: "Prossimi 30gg", description: "Lavori da iniziare nei prossimi 30 giorni" },
  { key: "in_corso", label: "In corso", description: "Status = in_corso" },
  { key: "generali", label: "Grandi lavori", description: "Commesse generali con le loro commesse collegate" },
  { key: "all", label: "Tutti", description: "Tutti gli ordini recenti" },
];

function fmtDate(d: string | null): string {
  if (!d) return "";
  try {
    return format(parseISO(d), "d MMM yyyy", { locale: dateFnsCampo() });
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
  // Sfondo saturo + testo BIANCO: massimo contrasto, indipendente dal tema
  // (chiaro/scuro). Niente testo colorato su sfondo colorato.
  const days = differenceInDays(date, today);
  if (days < -7) return { label: fmtDate(ref), cls: "bg-muted text-foreground" };
  if (days < 0) return { label: `${Math.abs(days)}gg fa`, cls: "bg-amber-500 text-white" };
  if (days === 0) return { label: "OGGI", cls: "bg-emerald-600 text-white" };
  if (days <= 3) return { label: `${days}gg`, cls: "bg-emerald-600 text-white" };
  if (days <= 14) return { label: `${days}gg`, cls: "bg-blue-600 text-white" };
  if (days <= 30) return { label: fmtDate(ref), cls: "bg-muted text-foreground" };
  return { label: fmtDate(ref), cls: "bg-muted text-foreground" };
}

export function OrderSelectCombobox({
  id, soloOperative = false, generaliSempre = false, companyId, value, onChange, disabled,
  placeholder, filtroIniziale, esclusi, ariaLabel,
}: Props) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>(filtroIniziale ?? "soon");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search to avoid hammering DB
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: orders = [], isLoading, isError, refetch } = useQuery<OrderOption[]>({
    queryKey: ["scarico-cantiere-orders-v2", companyId, filter, debouncedSearch, soloOperative, generaliSempre],
    enabled: !!companyId && open,
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from("orders")
        .select(`
          id, order_code, client_name, client_company, customer:profiles!orders_customer_id_fkey(first_name,last_name),
          work_start_date, work_end_date, expected_date,
          indirizzo_lavori, work_address, status, description, ${COLONNE_GERARCHIA},
          order_items ( destination_warehouse_id )
        `)
        .eq("company_id", companyId)
        .is("deleted_at", null);

      if (soloOperative) q = q.or("workflow_kind.neq.generale,workflow_kind.is.null");
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
      } else if (filter === "generali") {
        q = q.or("workflow_kind.eq.generale,commessa_generale_id.not.is.null");
      }

      for (const condition of filtriRicercaParole(debouncedSearch, ["order_code", "client_name", "client_company", "indirizzo_lavori", "work_address", "description"])) q = q.or(condition);

      // Tra i prossimi lavori prima il più vicino; altrimenti prima la commessa più recente, non quelle di anni fa.
      q =
        filter === "generali"
          ? q.order("order_code", { ascending: true }).limit(200)
          : q.order("work_start_date", { ascending: filter === "soon", nullsFirst: false }).limit(200);

      const { data: trovate, error } = await q;
      if (error) throw error;
      let data = trovate ?? [];
      if (generaliSempre && !soloOperative && filter !== "generali" && !debouncedSearch) {
        const { data: generali, error: eG } = await supabase
          .from("orders")
          .select(`
          id, order_code, client_name, client_company, customer:profiles!orders_customer_id_fkey(first_name,last_name),
          work_start_date, work_end_date, expected_date,
          indirizzo_lavori, work_address, status, description, ${COLONNE_GERARCHIA},
          order_items ( destination_warehouse_id )
        `)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("workflow_kind", "generale")
          .order("order_code", { ascending: true })
          .limit(50);
        if (eG) throw eG;
        const gia = new Set(data.map((o: { id: string }) => o.id));
        data = [...(generali ?? []).filter((g: { id: string }) => !gia.has(g.id)), ...data];
      }
      type RawRow = {
        id: string;
        order_code: string | null;
        client_name: string | null;
        client_company: string | null;
        customer?: { first_name: string | null; last_name: string | null } | null;
        work_start_date: string | null;
        work_end_date: string | null;
        expected_date: string | null;
        indirizzo_lavori: string | null;
        work_address: string | null;
        status: string | null;
        description: string | null;
        workflow_kind: string | null;
        commessa_generale_id: string | null;
        order_items?: Array<{ destination_warehouse_id: string | null }> | null;
      };
      const righe: OrderOption[] = ((data ?? []) as unknown as RawRow[]).map((o) => ({
        id: o.id,
        order_code: o.order_code ?? "—",
        customer_name: o.client_company || o.client_name || [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") || null,
        default_warehouse_id:
          o.order_items?.find((i) => i.destination_warehouse_id)?.destination_warehouse_id ?? null,
        work_start_date: o.work_start_date,
        work_end_date: o.work_end_date,
        expected_date: o.expected_date,
        indirizzo_lavori: o.indirizzo_lavori || o.work_address,
        status: o.status,
        description: o.description,
        workflow_kind: o.workflow_kind,
        commessa_generale_id: o.commessa_generale_id,
      }));
      return conGenerali(righe, leggiGenerali);
    },
  });

  // Keep a clicked option until its lookup arrives; never reuse it across companies.
  const [pickedOrder, setPickedOrder] = useState<{ companyId: string | undefined; order: OrderOption } | null>(null);
  const listedOrder = orders.find(o => o.id === value);
  const picked = pickedOrder?.companyId === companyId && pickedOrder?.order.id === value ? pickedOrder.order : null;

  // Lookup separato se l'ordine selezionato non è nella lista corrente
  const { data: standaloneOrder } = useQuery<OrderOption | null>({
    queryKey: ["scarico-order-lookup", companyId, value],
    enabled: !!companyId && !!value && !listedOrder && !picked,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!value || !companyId) return null;
      const { data, error } = await supabase
        .from("orders")
        .select(`id, order_code, client_name, client_company, customer:profiles!orders_customer_id_fkey(first_name,last_name), work_start_date, work_end_date, expected_date, indirizzo_lavori, work_address, status, description, ${COLONNE_GERARCHIA}, order_items ( destination_warehouse_id )`)
        .eq("id", value)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      type RawRow = {
        id: string; order_code: string | null; client_name: string | null; client_company: string | null;
        customer?: { first_name: string | null; last_name: string | null } | null;
        work_start_date: string | null; work_end_date: string | null; expected_date: string | null;
        indirizzo_lavori: string | null; work_address: string | null; status: string | null;
        description: string | null; workflow_kind: string | null; commessa_generale_id: string | null;
        order_items?: Array<{ destination_warehouse_id: string | null }> | null;
      };
      const r = data as unknown as RawRow;
      const riga: OrderOption = {
        id: r.id,
        order_code: r.order_code ?? "—",
        customer_name: r.client_company || r.client_name || [r.customer?.first_name, r.customer?.last_name].filter(Boolean).join(" ") || null,
        default_warehouse_id:
          r.order_items?.find((i) => i.destination_warehouse_id)?.destination_warehouse_id ?? null,
        work_start_date: r.work_start_date,
        work_end_date: r.work_end_date,
        expected_date: r.expected_date,
        indirizzo_lavori: r.indirizzo_lavori || r.work_address,
        status: r.status,
        description: r.description,
        workflow_kind: r.workflow_kind,
        commessa_generale_id: r.commessa_generale_id,
      };
      const [conNome] = await conGenerali([riga], leggiGenerali);
      return conNome;
    },
  });
  const selectedOrder = value ? listedOrder ?? picked ?? (standaloneOrder?.id === value ? standaloneOrder : null) : null;
  const handleSelect = useCallback(
    (order: OrderOption) => {
      setPickedOrder({ companyId, order });
      onChange(order.id, order);
      setOpen(false);
    },
    [onChange, companyId],
  );

  // Group orders by relative time bucket for visual scanning
  const groups = useMemo(() => {
    const today: OrderOption[] = [];
    const thisWeek: OrderOption[] = [];
    const thisMonth: OrderOption[] = [];
    const other: OrderOption[] = [];
    for (const o of orders) {
      if (esclusi?.includes(o.id)) continue;
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
  }, [orders, esclusi]);

  const totalCount = orders.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel ?? tr("Commessa")}
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between text-left font-normal h-auto min-h-10 py-2",
            !selectedOrder && "text-muted-foreground",
          )}
        >
          {selectedOrder ? (
            <div className="flex flex-col items-start gap-0.5 truncate flex-1 min-w-0">
              <span className="flex items-center gap-1.5 font-medium text-sm">
                {selectedOrder.order_code}
                <BadgeGenerale riga={selectedOrder} />
              </span>
              <span className="text-xs text-muted-foreground truncate w-full">
                {nomeCommessa(selectedOrder)}
                {selectedOrder.work_start_date && (
                  <>{" "}{tr("· lavori dal {work_start_date}", { work_start_date: fmtDate(selectedOrder.work_start_date) })}</>
                )}
              </span>
            </div>
          ) : (
            <span className="truncate">{placeholder ?? tr("Scegli un ordine...")}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          {/* Search input */}
          <CommandInput placeholder={tr("Cerca per codice, cliente o indirizzo…")} value={search} onValueChange={setSearch} />

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
                title={tr(f.description)}
              >
                {tr(f.label)}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {isLoading ? "…" : `${totalCount}${totalCount === 200 ? "+" : ""}`}
            </span>
          </div>

          <CommandList
            className="max-h-[320px] overscroll-contain"
            onWheel={(e) => {
              e.currentTarget.scrollTop += e.deltaY;
            }}
          >
            {isError ? (
              <div role="alert" className="space-y-2 p-3 text-sm">
                <p>{tr("Non riesco a caricare le commesse.")}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>{tr("Riprova")}</Button>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                {tr("Caricamento ordini…")}
              </div>
            ) : totalCount === 0 ? (
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                {debouncedSearch
                  ? tr("Nessun ordine corrisponde a \"{debouncedSearch}\"", { debouncedSearch: String(debouncedSearch ?? "") })
                  : filter === "soon"
                    ? tr("Nessun ordine con lavori nei prossimi 30 giorni")
                    : filter === "generali"
                      ? tr("Nessuna commessa generale")
                      : tr("Nessun ordine trovato")}
              </CommandEmpty>
            ) : (
              <>
                {/* Scadenze solo per i prossimi lavori: su tutte le commesse «Altri» non vuol dire niente. */}
                {filter === "soon" && !debouncedSearch ? (
                  <>
                    <OrderGroup heading={tr("Oggi")} orders={groups.today} value={value} onSelect={handleSelect} />
                    <OrderGroup heading={tr("Prossimi 7 giorni")} orders={groups.thisWeek} value={value} onSelect={handleSelect} />
                    <OrderGroup heading={tr("Prossimi 30 giorni")} orders={groups.thisMonth} value={value} onSelect={handleSelect} />
                    <OrderGroup heading={tr("Altri")} orders={groups.other} value={value} onSelect={handleSelect} />
                  </>
                ) : (
                  <OrderGroup
                    orders={[...groups.today, ...groups.thisWeek, ...groups.thisMonth, ...groups.other].sort((a, b) =>
                      // Con le generali sempre presenti, prima le operazioni (con le loro unità sotto), poi il resto.
                      (generaliSempre ? Number(eGenerale(b)) - Number(eGenerale(a)) : 0) || (filter === "generali" ? 0 : piuRecente(a, b)))}
                    raggruppa
                    value={value}
                    onSelect={handleSelect}
                  />
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Codice e nome delle generali delle figlie in elenco. */
async function leggiGenerali(ids: string[]) {
  const { data, error } = await supabase.from("orders").select("id, order_code, description").in("id", ids);
  if (error) throw error;
  return data ?? [];
}

/** Cliente e cantiere; per una generale, che nasce senza cliente, il suo nome. */
const nomeCommessa = (o: OrderOption) =>
  eGenerale(o) ? o.description || o.customer_name : o.customer_name || o.description;

const piuRecente = (a: OrderOption, b: OrderOption) =>
  String(b.work_start_date ?? b.expected_date ?? "").localeCompare(String(a.work_start_date ?? a.expected_date ?? ""));

function OrderGroup({
  heading,
  orders,
  raggruppa,
  value,
  onSelect,
}: {
  heading?: string;
  orders: OrderOption[];
  /** Figlie sotto la propria generale, rientrate. */
  raggruppa?: boolean;
  value: string | undefined;
  onSelect: (o: OrderOption) => void;
}) {
  const tr = useT();
  if (orders.length === 0) return null;
  return (
    <CommandGroup heading={heading}>
      {(raggruppa ? raggruppaPerGenerale(orders) : orders.map((riga) => ({ riga, annidata: false }))).map(({ riga: o, annidata }) => {
        const badge = relativeBadge(o.work_start_date, o.work_end_date, o.expected_date);
        const isSelected = value === o.id;
        return (
          <CommandItem
            key={o.id}
            value={o.id}
            onSelect={() => onSelect(o)}
            className={cn("flex cursor-pointer items-center gap-2 py-1.5", annidata && "pl-6")}
          >
            <Check className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium" title={o.order_code}>
                {o.order_code}
                <BadgeGenerale riga={o} />
              </p>
              <p className="truncate text-xs text-muted-foreground" title={[nomeCommessa(o), o.indirizzo_lavori].filter(Boolean).join(" · ")}>
                {[nomeCommessa(o), o.indirizzo_lavori].filter(Boolean).join(" · ") || "—"}
              </p>
              <RigaAppartenenza riga={o} nascondi={annidata} />
            </div>
            {badge && (
              <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[10px] font-medium", badge.cls)}>
                <CalendarClock className="h-2.5 w-2.5" />
                {badge.label === "OGGI" ? tr("OGGI") : /^\d+gg fa$/.test(badge.label) ? tr("{n}gg fa", { n: badge.label.replace(/\D/g, "") }) : /^\d+gg$/.test(badge.label) ? tr("{n}gg", { n: badge.label.replace(/\D/g, "") }) : badge.label}
              </span>
            )}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
