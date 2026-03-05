import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { toast } from "sonner";
import { format, differenceInDays, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { STATUS_CONFIG, isItemUrgent, isItemOverdue } from "@/types/warehouse";
import type { OrderItemStatus, WarehouseItem, OrderWithItems } from "@/types/warehouse";

export type ViewMode = "list" | "kanban" | "calendar" | "stock";
export type GroupBy = "order" | "date" | "status" | "supplier";
export type QuickFilter = "all" | "active" | "urgent" | "overdue" | "thisWeek" | "nextWeek";

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

  // Fetch all order items with order details
  const {
    data: items = [],
    isLoading: isLoadingItems,
    isError: isErrorItems,
    refetch: refetchItems,
  } = useQuery({
    queryKey: ["warehouse-items", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
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
            customer:profiles!orders_customer_id_fkey(first_name, last_name)
          )
        `)
        .eq("order.company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(2000); // sicurezza: evita di caricare l'intera tabella a scala
      if (error) throw error;
      return (data || []) as unknown as WarehouseItem[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch suppliers (shared - used by both item views and stock tab)
  const {
    data: suppliers = [],
    isLoading: isLoadingSuppliers,
    isError: isErrorSuppliers,
  } = useQuery({
    queryKey: ["suppliers", companyId],
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

  // Fetch stock items for matching
  const {
    data: stockItems = [],
  } = useQuery({
    queryKey: ["warehouse-stock-names", companyId],
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

  const isLoading = isLoadingItems || isLoadingSuppliers;
  const isError = isErrorItems || isErrorSuppliers;
  const refetch = () => {
    refetchItems();
  };

  // Unique orders for filter dropdown
  const uniqueOrders = useMemo(() => {
    const ordersMap = new Map<string, { id: string; code: string; customer: string }>();
    items.forEach((item) => {
      if (!ordersMap.has(item.order.id)) {
        ordersMap.set(item.order.id, {
          id: item.order.id,
          code: item.order.order_code || "N/A",
          customer: `${item.order.customer.first_name} ${item.order.customer.last_name}`,
        });
      }
    });
    return Array.from(ordersMap.values());
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    let filtered = [...items];
    const today = new Date();

    if (quickFilter === "active") {
      filtered = filtered.filter((item) => item.status !== "installato");
    } else if (quickFilter === "urgent") {
      filtered = filtered.filter((item) => {
        if (item.status === "in_magazzino" || item.status === "installato") return false;
        const expectedDate = item.order.expected_date || item.order.work_start_date;
        if (!expectedDate) return false;
        const daysUntil = differenceInDays(new Date(expectedDate), today);
        return daysUntil <= 7 && daysUntil >= 0;
      });
    } else if (quickFilter === "overdue") {
      filtered = filtered.filter((item) => isItemOverdue(item));
    } else if (quickFilter === "thisWeek") {
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
      filtered = filtered.filter((item) => {
        const expectedDate = item.order.expected_date || item.order.work_start_date;
        if (!expectedDate) return false;
        const date = new Date(expectedDate);
        return date >= weekStart && date <= weekEnd;
      });
    } else if (quickFilter === "nextWeek") {
      const nextWeekStart = startOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });
      const nextWeekEnd = endOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });
      filtered = filtered.filter((item) => {
        const expectedDate = item.order.expected_date || item.order.work_start_date;
        if (!expectedDate) return false;
        const date = new Date(expectedDate);
        return date >= nextWeekStart && date <= nextWeekEnd;
      });
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          (item.description && item.description.toLowerCase().includes(query))
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((item) => item.status === statusFilter);
    }

    if (orderFilter !== "all") {
      filtered = filtered.filter((item) => item.order.id === orderFilter);
    }

    if (supplierFilter !== "all") {
      filtered = filtered.filter((item) => item.supplier_id === supplierFilter);
    }

    return filtered;
  }, [items, searchQuery, statusFilter, orderFilter, supplierFilter, quickFilter]);

  // Group items by order
  const filteredGroups = useMemo(() => {
    const grouped = new Map<string, OrderWithItems>();

    let sortedItems = [...filteredItems];

    if (groupBy === "date") {
      sortedItems.sort((a, b) => {
        const dateA = a.order.expected_date || a.order.work_start_date || "";
        const dateB = b.order.expected_date || b.order.work_start_date || "";
        return dateA.localeCompare(dateB);
      });
    } else if (groupBy === "status") {
      const statusOrder: OrderItemStatus[] = ["da_ordinare", "ordinato", "in_magazzino", "installato"];
      sortedItems.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
    } else if (groupBy === "supplier") {
      sortedItems.sort((a, b) => (a.supplier_id || "").localeCompare(b.supplier_id || ""));
    }

    if (groupBy === "supplier") {
      // Group by supplier instead of order
      const supplierGrouped = new Map<string, OrderWithItems>();
      sortedItems.forEach((item) => {
        const key = item.supplier_id || "__no_supplier__";
        if (!supplierGrouped.has(key)) {
          const name = item.supplier_id
            ? (suppliers.find(s => s.id === item.supplier_id)?.name || "Fornitore sconosciuto")
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
      result.sort((a, b) => {
        const dateA = a.expectedDate || "";
        const dateB = b.expectedDate || "";
        return dateA.localeCompare(dateB);
      });
    }

    return result;
  }, [filteredItems, groupBy, suppliers]);

  // Update item status mutation
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
      toast.success("Stato aggiornato", { description: "Lo stato dell'articolo è stato aggiornato." });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile aggiornare lo stato dell'articolo." });
    },
  });

  // Batch update mutation
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
      toast.success("Articoli aggiornati", { description: `${variables.itemIds.length} articoli sono stati aggiornati.` });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile aggiornare gli articoli." });
    },
  });

  // Update item notes mutation
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

  // Batch update section mutation (for DnD to map)
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
    return suppliers.find((s) => s.id === supplierId)?.name || null;
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setOrderFilter("all");
    setSupplierFilter("all");
    setQuickFilter("all");
  };

  const hasActiveFilters =
    searchQuery || statusFilter !== "all" || orderFilter !== "all" || supplierFilter !== "all" || quickFilter !== "all";

  // Count active items (non-installato)
  const activeItemsCount = useMemo(() => {
    return items.filter((item) => item.status !== "installato").length;
  }, [items]);

  // Count urgent items
  const urgentItemsCount = useMemo(() => {
    return items.filter(isItemUrgent).length;
  }, [items]);

  // Count overdue items
  const overdueItemsCount = useMemo(() => {
    return items.filter(isItemOverdue).length;
  }, [items]);

  // Export to CSV
  const exportToCSV = () => {
    const headers = ["Articolo", "Quantità", "Stato", "Fornitore", "Ordine", "Cliente", "Data Posa"];
    const rows = filteredItems.map((item) => [
      item.name,
      item.quantity || 1,
      STATUS_CONFIG[item.status].label,
      getSupplierName(item.supplier_id) || "",
      item.order.order_code || "",
      `${item.order.customer.first_name} ${item.order.customer.last_name}`,
      item.order.expected_date || item.order.work_start_date || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `magazzino_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();

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
    // State
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    orderFilter,
    setOrderFilter,
    supplierFilter,
    setSupplierFilter,
    groupBy,
    setGroupBy,
    quickFilter,
    setQuickFilter,
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
