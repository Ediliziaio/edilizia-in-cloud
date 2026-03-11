import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { exportToCSV as exportCsvUtil } from "@/lib/csvExport";
import { STATUS_CONFIG } from "@/types/warehouse";
import type { OrderItemStatus, WarehouseItem, OrderWithItems } from "@/types/warehouse";

export type ViewMode = "list" | "kanban" | "calendar" | "stock";
export type GroupBy = "order" | "date" | "status" | "supplier";
export type QuickFilter = "all" | "active" | "urgent" | "overdue" | "thisWeek" | "nextWeek";

const PAGE_SIZE = 50;

export function useWarehouseData() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  // View and filter states
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderFilter, setOrderFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("order");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("active");
  const [page, setPage] = useState(0);

  // Reset page when filters change
  const setSearchQueryWithReset = useCallback((v: string) => { setSearchQuery(v); setPage(0); }, []);
  const setStatusFilterWithReset = useCallback((v: string) => { setStatusFilter(v); setPage(0); }, []);
  const setOrderFilterWithReset = useCallback((v: string) => { setOrderFilter(v); setPage(0); }, []);
  const setSupplierFilterWithReset = useCallback((v: string) => { setSupplierFilter(v); setPage(0); }, []);
  const setQuickFilterWithReset = useCallback((v: QuickFilter) => { setQuickFilter(v); setPage(0); }, []);

  // Fetch suppliers
  const {
    data: suppliers = [],
    isLoading: isLoadingSuppliers,
    isError: isErrorSuppliers,
  } = useQuery({
    queryKey: queryKeys.suppliers.list(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
  });

  // Memoized supplier map for O(1) lookups
  const supplierMap = useMemo(
    () => new Map(suppliers.map(s => [s.id, s.name])),
    [suppliers]
  );

  // Fetch stock items for matching
  const { data: stockItems = [] } = useQuery({
    queryKey: queryKeys.warehouse.stockNames(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("id, name, quantity")
        .eq("company_id", companyId)
        .gt("quantity", 0);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch order statuses to determine the last phase
  const { data: orderStatuses = [] } = useQuery({
    queryKey: ["order-statuses", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, position")
        .eq("company_id", companyId)
        .order("position", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
  });

  const lastStatusId = useMemo(() => {
    return orderStatuses.length > 0 ? orderStatuses[0].id : null;
  }, [orderStatuses]);

  // Build date filter helpers
  const dateFilters = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const sevenDaysStr = new Date(today.getTime() + 7 * 86400000).toISOString().split("T")[0];
    const weekStart = startOfWeek(today, { weekStartsOn: 1 }).toISOString().split("T")[0];
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 }).toISOString().split("T")[0];
    const nextWeekStart = startOfWeek(addWeeks(today, 1), { weekStartsOn: 1 }).toISOString().split("T")[0];
    const nextWeekEnd = endOfWeek(addWeeks(today, 1), { weekStartsOn: 1 }).toISOString().split("T")[0];
    return { todayStr, sevenDaysStr, weekStart, weekEnd, nextWeekStart, nextWeekEnd };
  }, []);

  // Main items query with server-side filtering
  const {
    data: queryResult,
    isLoading: isLoadingItems,
    isError: isErrorItems,
    refetch: refetchItems,
  } = useQuery({
    queryKey: queryKeys.warehouse.items(companyId, searchQuery, statusFilter, orderFilter, supplierFilter, quickFilter, page),
    queryFn: async () => {
      if (!companyId) return { items: [] as WarehouseItem[], totalCount: 0 };

      let query = supabase
        .from("order_items")
        .select(`
          id,
          name,
          description,
          quantity,
          status,
          supplier_id,
          purchase_price,
          notes,
          updated_at,
          section_id,
          order:orders!inner(
            id,
            order_code,
            expected_date,
            work_start_date,
            warehouse_arrival_date,
            company_id,
            current_status_id,
            customer:profiles!orders_customer_id_fkey(first_name, last_name)
          )
        `, { count: "exact" })
        .eq("order.company_id", companyId);

      // Server-side filters
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (searchQuery) {
        query = query.ilike("name", `%${searchQuery}%`);
      }

      if (supplierFilter !== "all") {
        query = query.eq("supplier_id", supplierFilter);
      }

      // Quick filters that exclude statuses
      if (quickFilter === "active") {
        query = query.neq("status", "installato");
        if (lastStatusId) {
          query = query.neq("order.current_status_id", lastStatusId);
        }
      } else if (quickFilter === "urgent") {
        query = query.not("status", "in", '("in_magazzino","installato")');
        query = query.gte("order.expected_date", dateFilters.todayStr).lte("order.expected_date", dateFilters.sevenDaysStr);
      } else if (quickFilter === "overdue") {
        query = query.not("status", "in", '("in_magazzino","installato")');
        query = query.lt("order.expected_date", dateFilters.todayStr);
      } else if (quickFilter === "thisWeek") {
        query = query.gte("order.expected_date", dateFilters.weekStart).lte("order.expected_date", dateFilters.weekEnd);
      } else if (quickFilter === "nextWeek") {
        query = query.gte("order.expected_date", dateFilters.nextWeekStart).lte("order.expected_date", dateFilters.nextWeekEnd);
      }

      // Order filter (specific order)
      if (orderFilter !== "all") {
        query = query.eq("order.id", orderFilter);
      }

      // Pagination
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        items: (data || []) as unknown as WarehouseItem[],
        totalCount: count || 0,
      };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const items = queryResult?.items ?? [];
  const totalCount = queryResult?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Badge counts - lightweight COUNT queries
  const { data: badgeCounts } = useQuery({
    queryKey: queryKeys.warehouse.badgeCounts(companyId, lastStatusId),
    queryFn: async () => {
      if (!companyId) return { active: 0, urgent: 0, overdue: 0 };

      const [activeRes, urgentRes, overdueRes] = await Promise.all([
        // Active: not installato, not last status
        (() => {
          let q = supabase
            .from("order_items")
            .select("id", { count: "exact", head: true })
            .eq("order.company_id", companyId)
            .neq("status", "installato");
          // Note: can't filter on joined table in head query easily, so we use a simpler approach
          return supabase
            .from("order_items")
            .select(`id, order:orders!inner(company_id, current_status_id)`, { count: "exact", head: true })
            .eq("order.company_id", companyId)
            .neq("status", "installato");
        })(),
        // Urgent: not ready, expected_date within 7 days
        supabase
          .from("order_items")
          .select(`id, order:orders!inner(company_id, expected_date)`, { count: "exact", head: true })
          .eq("order.company_id", companyId)
          .not("status", "in", '("in_magazzino","installato")')
          .gte("order.expected_date", new Date().toISOString().split("T")[0])
          .lte("order.expected_date", new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]),
        // Overdue: not ready, expected_date in past
        supabase
          .from("order_items")
          .select(`id, order:orders!inner(company_id, expected_date)`, { count: "exact", head: true })
          .eq("order.company_id", companyId)
          .not("status", "in", '("in_magazzino","installato")')
          .lt("order.expected_date", new Date().toISOString().split("T")[0]),
      ]);

      return {
        active: activeRes.count || 0,
        urgent: urgentRes.count || 0,
        overdue: overdueRes.count || 0,
      };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const activeItemsCount = badgeCounts?.active ?? 0;
  const urgentItemsCount = badgeCounts?.urgent ?? 0;
  const overdueItemsCount = badgeCounts?.overdue ?? 0;

  // Unique orders for filter dropdown (lightweight query)
  const { data: uniqueOrders = [] } = useQuery({
    queryKey: queryKeys.warehouse.uniqueOrders(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, customer:profiles!orders_customer_id_fkey(first_name, last_name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data || []).map((o: any) => ({
        id: o.id,
        code: o.order_code || "N/A",
        customer: `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim(),
      }));
    },
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
  });

  const isLoading = isLoadingItems || isLoadingSuppliers;
  const isError = isErrorItems || isErrorSuppliers;
  const refetch = () => { refetchItems(); };

  // Use items directly (already filtered server-side) as filteredItems
  const filteredItems = items;

  // Group items
  const filteredGroups = useMemo(() => {
    let sortedItems = [...filteredItems];

    if (groupBy === "date") {
      sortedItems.sort((a, b) => {
        const dateA = a.order.expected_date || a.order.work_start_date || "";
        const dateB = b.order.expected_date || b.order.work_start_date || "";
        return dateA.localeCompare(dateB);
      });
    } else if (groupBy === "status") {
      const statusOrder: OrderItemStatus[] = ["da_ordinare", "ordinato", "in_arrivo", "in_magazzino", "prenotato", "installato"];
      sortedItems.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
    } else if (groupBy === "supplier") {
      sortedItems.sort((a, b) => (a.supplier_id || "").localeCompare(b.supplier_id || ""));
    }

    if (groupBy === "supplier") {
      const supplierGrouped = new Map<string, OrderWithItems>();
      sortedItems.forEach((item) => {
        const key = item.supplier_id || "__no_supplier__";
        if (!supplierGrouped.has(key)) {
          const name = item.supplier_id
            ? (supplierMap.get(item.supplier_id) || "Fornitore sconosciuto")
            : "Senza fornitore";
          supplierGrouped.set(key, {
            orderId: key,
            orderCode: name,
            customerName: "",
            expectedDate: null,
            items: [],
          });
        }
        supplierGrouped.get(key)!.items.push(item);
      });
      return Array.from(supplierGrouped.values());
    }

    const grouped = new Map<string, OrderWithItems>();
    sortedItems.forEach((item) => {
      const orderId = item.order.id;
      if (!grouped.has(orderId)) {
        grouped.set(orderId, {
          orderId,
          orderCode: item.order.order_code,
          customerName: `${item.order.customer.first_name} ${item.order.customer.last_name}`,
          expectedDate: item.order.expected_date || item.order.work_start_date,
          items: [],
        });
      }
      grouped.get(orderId)!.items.push(item);
    });

    let result = Array.from(grouped.values());
    if (groupBy === "date") {
      result.sort((a, b) => (a.expectedDate || "").localeCompare(b.expectedDate || ""));
    }

    return result;
  }, [filteredItems, groupBy, supplierMap]);

  // Mutations
  const updateItemStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: OrderItemStatus }) => {
      const { error } = await supabase
        .from("order_items")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-items"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-badge-counts"] });
      toast.success("Stato aggiornato", { description: "Lo stato dell'articolo è stato aggiornato." });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile aggiornare lo stato dell'articolo." });
    },
  });

  const batchUpdateMutation = useMutation({
    mutationFn: async ({ itemIds, status }: { itemIds: string[]; status: OrderItemStatus }) => {
      const { error } = await supabase
        .from("order_items")
        .update({ status, updated_at: new Date().toISOString() })
        .in("id", itemIds);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-items"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-badge-counts"] });
      toast.success("Articoli aggiornati", { description: `${variables.itemIds.length} articoli sono stati aggiornati.` });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile aggiornare gli articoli." });
    },
  });

  const updateItemNotesMutation = useMutation({
    mutationFn: async ({ itemId, notes }: { itemId: string; notes: string | null }) => {
      const { error } = await supabase
        .from("order_items")
        .update({ notes, updated_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-items"] });
      toast.success("Nota aggiornata");
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile aggiornare la nota." });
    },
  });

  const batchUpdateSectionMutation = useMutation({
    mutationFn: async ({ itemIds, sectionId }: { itemIds: string[]; sectionId: string | null }) => {
      const { error } = await supabase
        .from("order_items")
        .update({ section_id: sectionId, updated_at: new Date().toISOString() } as any)
        .in("id", itemIds);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-items"] });
      const count = variables.itemIds.length;
      toast.success("Articoli spostati", { description: `${count} articol${count === 1 ? "o" : "i"} spostat${count === 1 ? "o" : "i"} nella zona.` });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile spostare gli articoli." });
    },
  });

  const handleStatusChange = (itemId: string, status: OrderItemStatus) => {
    updateItemStatusMutation.mutate({ itemId, status });
  };

  const handleMarkAllInstalled = (orderItems: WarehouseItem[]) => {
    batchUpdateMutation.mutate({ itemIds: orderItems.map((i) => i.id), status: "installato" });
  };

  const handleBatchStatusChange = (itemIds: string[], status: OrderItemStatus) => {
    batchUpdateMutation.mutate({ itemIds, status });
  };

  const getSupplierName = (supplierId: string | null) => {
    if (!supplierId) return null;
    return supplierMap.get(supplierId) || null;
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setOrderFilter("all");
    setSupplierFilter("all");
    setQuickFilter("all");
    setPage(0);
  };

  const hasActiveFilters =
    searchQuery || statusFilter !== "all" || orderFilter !== "all" || supplierFilter !== "all" || quickFilter !== "all";

  const exportToCSV = () => {
    const columns = [
      { key: "articolo", label: "Articolo" },
      { key: "quantita", label: "Quantità" },
      { key: "stato", label: "Stato" },
      { key: "fornitore", label: "Fornitore" },
      { key: "ordine", label: "Ordine" },
      { key: "cliente", label: "Cliente" },
      { key: "data_posa", label: "Data Posa" },
    ];
    const rows = filteredItems.map((item) => ({
      articolo: item.name,
      quantita: String(item.quantity || 1),
      stato: STATUS_CONFIG[item.status].label,
      fornitore: getSupplierName(item.supplier_id) || "",
      ordine: item.order.order_code || "",
      cliente: `${item.order.customer.first_name} ${item.order.customer.last_name}`,
      data_posa: item.order.expected_date || item.order.work_start_date || "",
    }));
    exportCsvUtil(rows, columns, `magazzino_${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast.success("Esportazione completata", { description: `${filteredItems.length} articoli esportati.` });
  };

  const isUpdating = updateItemStatusMutation.isPending || batchUpdateMutation.isPending || batchUpdateSectionMutation.isPending;

  const handleBatchSectionChange = (itemIds: string[], sectionId: string | null) => {
    batchUpdateSectionMutation.mutate({ itemIds, sectionId });
  };

  return {
    // Data
    items,
    filteredItems,
    filteredGroups,
    suppliers,
    stockItems,
    uniqueOrders,
    urgentItemsCount,
    overdueItemsCount,
    activeItemsCount,
    // Pagination
    page,
    setPage,
    totalPages,
    totalCount,
    pageSize: PAGE_SIZE,
    // State
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery: setSearchQueryWithReset,
    statusFilter,
    setStatusFilter: setStatusFilterWithReset,
    orderFilter,
    setOrderFilter: setOrderFilterWithReset,
    supplierFilter,
    setSupplierFilter: setSupplierFilterWithReset,
    groupBy,
    setGroupBy,
    quickFilter,
    setQuickFilter: setQuickFilterWithReset,
    // Status
    isLoading,
    isError,
    isUpdating,
    hasActiveFilters,
    // Actions
    handleStatusChange,
    handleMarkAllInstalled,
    handleBatchStatusChange,
    handleBatchSectionChange,
    handleUpdateNotes: (itemId: string, notes: string | null) => updateItemNotesMutation.mutate({ itemId, notes }),
    getSupplierName,
    clearFilters,
    exportToCSV,
    refetch,
    effectiveCompany,
  };
}
