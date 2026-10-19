import {readAllOrderRows} from "./listScope";
import {supabase} from "@/integrations/supabase/client";
import type {OrderWithDetails} from "@/lib/orderUtils";
import type {OrdersFilterState} from "@/components/orders/OrdersFilterSidebar";
import type {DateRange} from "@/pages/azienda/OrdersList/constants";
import {format} from "date-fns";

export interface OrdersReaderFilters {
  companyId: string | undefined;
  periodIds?: string[] | null;
  supportOrderIds?: string[];
  focusIds: string[] | null;
  paymentIds: string[] | null;
  salespersonFilter: string; laborFilter: string; supplierFilter: string;
  sidebarFilters: OrdersFilterState;
  customerFilter: string; debouncedSearch: string; statusFilter: string;
  supportStatusId: string | null; lastStatusId: string | null;
  hideCompleted: boolean; amountMin: string; amountMax: string;
  isYearCorrente: boolean; monthFilter: string; currentYear: number;
  hasSelectedYear: boolean; selectedYear: number | null;
  contractDateRange: DateRange; warehouseDateRange: DateRange; expectedDateRange: DateRange;
  sortField: string; sortDir: "asc" | "desc";
}

/** The same scoped reader serves table, pipeline and exports. Filters precede range. */
export async function readOrdersPage(filters: OrdersReaderFilters, from: number, to: number): Promise<{orders: OrderWithDetails[]; totalCount: number}> {
  const {companyId, focusIds, paymentIds, salespersonFilter, laborFilter, supplierFilter, sidebarFilters, customerFilter, debouncedSearch, statusFilter, supportStatusId, lastStatusId, hideCompleted, amountMin, amountMax, isYearCorrente, monthFilter, currentYear, hasSelectedYear, selectedYear, contractDateRange, warehouseDateRange, expectedDateRange, sortField, sortDir} = filters;

      if (!companyId) return { orders: [] as OrderWithDetails[], totalCount: 0 };

      // Join filters are resolved before the main order query and pagination.
      let allowedOrderIds: string[] | null = filters.periodIds ?? null;
      const intersect = (ids: string[]) => { allowedOrderIds = allowedOrderIds === null ? ids : allowedOrderIds.filter(id => ids.includes(id)); };

      if (focusIds !== null) intersect(focusIds);
      if (statusFilter === "__assistenza__" && filters.supportOrderIds) intersect(filters.supportOrderIds);
      if (paymentIds !== null) intersect(paymentIds);

      if (salespersonFilter !== "all") {
        const spOrders = await readAllOrderRows((start, end) => supabase
          .from("order_salespeople")
          .select("order_id")
          .eq("salesperson_id", salespersonFilter).order("id").range(start, end));
        const ids = (spOrders || []).map(r => r.order_id);
        if (ids.length === 0) return { orders: [] as OrderWithDetails[], totalCount: 0 };
        intersect(ids);
      }

      if (laborFilter !== "all") {
        const isTeam = laborFilter.startsWith("team-");
        const realId = laborFilter.replace(/^(emp-|team-)/, "");
        const laborOrders = isTeam
          ? await readAllOrderRows((start,end) => supabase.from("order_external_teams").select("order_id").eq("external_team_id",realId).order("id").range(start,end))
          : await readAllOrderRows((start,end) => supabase.from("order_employees").select("order_id").eq("employee_id",realId).order("id").range(start,end));
        const ids = (laborOrders || []).map(r => r.order_id);
        if (ids.length === 0) return { orders: [] as OrderWithDetails[], totalCount: 0 };
        allowedOrderIds = allowedOrderIds
          ? allowedOrderIds.filter(id => ids.includes(id))
          : ids;
      }

      if (supplierFilter !== "all") {
        const suppOrders = await readAllOrderRows((start, end) => supabase
          .from("order_items")
          .select("order_id")
          .eq("supplier_id", supplierFilter).order("id").range(start, end));
        const ids = [...new Set((suppOrders || []).map(r => r.order_id))];
        if (ids.length === 0) return { orders: [] as OrderWithDetails[], totalCount: 0 };
        allowedOrderIds = allowedOrderIds
          ? allowedOrderIds.filter(id => ids.includes(id))
          : ids;
      }

      const sf = sidebarFilters;
      if (sf.salespersonId) {
        const data = await readAllOrderRows((start, end) => supabase.from("order_salespeople").select("order_id").eq("salesperson_id", sf.salespersonId).order("id").range(start, end));
        intersect((data ?? []).map(row => row.order_id));
      }
      if (sf.laborIds.length) {
        const ids = new Set<string>();
        for (const prefix of ["emp-", "team-"]) {
          const selected = sf.laborIds.filter(id => id.startsWith(prefix)).map(id => id.slice(prefix.length));
          if (!selected.length) continue;
          const data = prefix === "emp-"
            ? await readAllOrderRows((start,end) => supabase.from("order_employees").select("order_id").in("employee_id",selected).order("id").range(start,end))
            : await readAllOrderRows((start,end) => supabase.from("order_external_teams").select("order_id").in("external_team_id",selected).order("id").range(start,end));
          (data ?? []).forEach(row => ids.add(row.order_id));
        }
        intersect([...ids]);
      }

      if (allowedOrderIds !== null && allowedOrderIds.length === 0) {
        return { orders: [] as OrderWithDetails[], totalCount: 0 };
      }

      let query = supabase
        .from("orders")
        .select(`
          id, order_code, description, total_amount, deposit_amount, balance_amount,
          vat_rate, created_at, expected_date, work_start_date, work_end_date,
          warehouse_arrival_date, customer_id, current_status_id, payment_type,
          financing_amount, financing_cost, deposit_2_amount, has_building_bonus,
          deposit_paid, deposit_2_paid, balance_paid, financing_paid,
          deposit_paid_date, deposit_2_paid_date, balance_paid_date, financing_paid_date,
          deposit_expected_date, deposit_2_expected_date, balance_expected_date, financing_expected_date,
          order_type,
          customer:profiles!orders_customer_id_fkey(first_name, last_name, email),
          status:order_statuses!orders_current_status_id_fkey(name, color),
          installments:order_installments(position, type, amount, is_paid, paid_date, expected_date, fattura:documenti_fiscali(id, importo_pagato)),
          variazioni:ordini_variazione(status, impatto_economico, offline_signed_on, firmato_il, approval_recorded_at, richiesto_il, created_at),
          order_items(id, status, quantity),
          order_employees(employee:employees(id, first_name, last_name)),
          order_external_teams(external_team:external_teams(id, name))
        `, { count: "exact" })
        .eq("company_id", companyId)
        .is("deleted_at", null);

      if (allowedOrderIds !== null && allowedOrderIds.length <= 100) query = query.in("id", allowedOrderIds);
      if (sf.includeStatuses.length) query = query.in("current_status_id", sf.includeStatuses);
      if (sf.excludeStatuses.length) query = query.or(`current_status_id.not.in.(${sf.excludeStatuses.join(",")}),current_status_id.is.null`);
      if (sf.orderSearch.trim()) {
        const safe = sf.orderSearch.replace(/[(),]/g, " ").trim();
        if (safe) query = query.or(`description.ilike.%${safe}%,order_code.ilike.%${safe}%,client_name.ilike.%${safe}%`);
      }
      for (const value of [sf.dateFrom, sf.createdFrom]) if (value) query = query.gte("created_at", new Date(`${value}T00:00:00`).toISOString());
      for (const value of [sf.dateTo, sf.createdTo]) if (value) query = query.lte("created_at", new Date(`${value}T23:59:59.999`).toISOString());
      if (sf.amountMin) query = query.gte("total_amount", Number(sf.amountMin));
      if (sf.amountMax) query = query.lte("total_amount", Number(sf.amountMax));
      // B1 — customerFilter e paymentFilter applicati server-side
      if (customerFilter !== "all") query = query.eq("customer_id", customerFilter);
      if (debouncedSearch) {
        // Sanitize: PostgREST `.or()` interpreta virgole/parentesi come separatori → safer escape
        const safe = debouncedSearch.replace(/[(),]/g, " ").trim();
        if (safe) {
          query = query.or(
            `description.ilike.%${safe}%,order_code.ilike.%${safe}%,client_name.ilike.%${safe}%`
          );
        }
      }
      if (statusFilter === "__da_completare__") {
        // Sentinel "Da completare": esclude ordini in Assistenza e Completati
        const excl = [supportStatusId, lastStatusId].filter(Boolean) as string[];
        if (excl.length) query = query.or(`current_status_id.not.in.(${excl.join(",")}),current_status_id.is.null`);
      } else if (statusFilter === "__assistenza__") {
        // Sentinel "Assistenza": solo ordini in fase Assistenza
        if (filters.supportOrderIds) { /* resolved tickets and workflow scope above */ }
        else if (supportStatusId) query = query.eq("current_status_id", supportStatusId);
        else return {orders:[],totalCount:0};
      } else if (statusFilter === "__completati__") {
        if (lastStatusId) query = query.eq("current_status_id", lastStatusId);
        else return {orders:[],totalCount:0};
      } else if (statusFilter !== "all") {
        query = query.eq("current_status_id", statusFilter);
      }
      if (hideCompleted && statusFilter === "all" && lastStatusId) {
        query = query.or(`current_status_id.neq.${lastStatusId},current_status_id.is.null`);
      }
      if (amountMin) query = query.gte("total_amount", parseFloat(amountMin));
      if (amountMax) query = query.lte("total_amount", parseFloat(amountMax));
      if (isYearCorrente && monthFilter === "all") {
        if (!filters.periodIds) throw new Error("Perimetro annuale non disponibile");
      } else if (hasSelectedYear && selectedYear && monthFilter === "all") {
        query = query
          .gte("created_at", new Date(selectedYear, 0, 1).toISOString())
          .lte("created_at", new Date(selectedYear, 11, 31, 23, 59, 59, 999).toISOString());
      }
      if (contractDateRange.from) query = query.gte("created_at", contractDateRange.from.toISOString());
      if (contractDateRange.to) query = query.lte("created_at", new Date(contractDateRange.to.getTime() + 86400000 - 1).toISOString());
      if (warehouseDateRange.from) query = query.gte("warehouse_arrival_date", format(warehouseDateRange.from,"yyyy-MM-dd"));
      if (warehouseDateRange.to) query = query.lte("warehouse_arrival_date", format(warehouseDateRange.to,"yyyy-MM-dd"));
      if (expectedDateRange.from) query = query.gte("expected_date", format(expectedDateRange.from,"yyyy-MM-dd"));
      if (expectedDateRange.to) query = query.lte("expected_date", format(expectedDateRange.to,"yyyy-MM-dd"));

      // 🛠️ Server-side sort: usa sortField/sortDir dal state (default
      // created_at desc). NULL last per scadenze/date così le commesse
      // senza data programmata finiscono in fondo (UX più chiara).
      const isDateSort = ["expected_date", "warehouse_arrival_date", "work_start_date", "work_end_date"].includes(sortField);
      query = query
        .order(sortField, {
          ascending: sortDir === "asc",
          nullsFirst: isDateSort ? false : (sortDir === "asc"),
        }).order("id", {ascending: true});

      // Avoid oversized IN URLs. The less common large-id case reads bounded
      // pages in the same database order, intersects, then paginates the result.
      if ((allowedOrderIds !== null && allowedOrderIds.length > 100) || to === Infinity) {
        const rows = await readAllOrderRows((start, end) => query.range(start, end));
        const allowed = allowedOrderIds === null ? null : new Set(allowedOrderIds);
        const matching = allowed ? rows.filter(row => allowed.has(row.id)) : rows;
        return {orders:matching.slice(from, to === Infinity ? undefined : to + 1) as unknown as OrderWithDetails[], totalCount:matching.length};
      }
      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      // Le date delle varianti (offline_signed_on…) mancano nei tipi generati: ci sono nel database.
      return { orders: data as unknown as OrderWithDetails[], totalCount: count ?? 0 };
}
