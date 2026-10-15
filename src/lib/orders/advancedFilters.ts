import type {OrdersFilterState} from "@/components/orders/OrdersFilterSidebar";

export function parseOrderAdvancedFilters(raw: string, defaults: OrdersFilterState): OrdersFilterState {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
    const result = {...defaults};
    for (const key of Object.keys(defaults) as Array<keyof OrdersFilterState>) {
      const item = (value as Record<string, unknown>)[key];
      if (key === "includeStatuses" || key === "excludeStatuses" || key === "laborIds") {
        if (Array.isArray(item) && item.every(id => typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id))) result[key] = item;
      } else if (key === "paymentStatus") {
        if (item === "all" || item === "paid" || item === "unpaid" || item === "overdue") result[key] = item;
      } else if (typeof item === "string") {
        if (["dateFrom", "dateTo", "createdFrom", "createdTo"].includes(key) && item &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(item) || Number.isNaN(Date.parse(item)))) continue;
        if (["amountMin", "amountMax"].includes(key) && item && !/^\d+(\.\d+)?$/.test(item)) continue;
        result[key] = item;
      }
    }
    return result;
  } catch { return defaults; }
}
