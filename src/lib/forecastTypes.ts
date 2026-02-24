export interface ExpectedPayment {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  type: "Acconto 1" | "Acconto 2" | "Saldo" | "Finanziamento";
  amount: number;
  expectedDate: Date | null;
  direction: "in";
}

export interface ExpectedExpense {
  orderId: string;
  orderCode: string | null;
  teamName: string;
  amount: number;
  expectedDate: Date | null;
  isPaid: boolean;
  direction: "out";
}

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export interface ExpectedCommission {
  orderId: string;
  orderCode: string | null;
  salespersonName: string;
  amount: number;
  expectedDate: Date | null;
  direction: "out";
}

export interface CompanyCostEntry {
  id: string;
  name: string;
  amount: number;
  expectedDate: Date | null;
  costType: string;
  category: string | null;
  direction: "out";
  type: "Costo Fisso" | "Costo Variabile";
}

export interface ExternalTeamPayment {
  id: string;
  total_cost: number;
  payment_date: string | null;
  is_paid: boolean;
  order: {
    id: string;
    order_code: string | null;
    company_id: string;
  };
  external_team: {
    name: string;
  } | null;
}

export interface MaterialCosts {
  toOrder: {
    count: number;
    total: number;
    items: any[];
  };
  ordered: {
    count: number;
    total: number;
    items: any[];
  };
}

export interface ForecastStats {
  thisMonth: {
    income: number;
    expenses: number;
    net: number;
    incomeCount: number;
    expensesCount: number;
  };
  nextMonth: {
    income: number;
    expenses: number;
    net: number;
  };
  next3Months: {
    income: number;
    expenses: number;
    net: number;
  };
  total: {
    income: number;
    expenses: number;
    net: number;
    incomeCount: number;
    expensesCount: number;
    commissionsTotal: number;
    costsTotal: number;
    supplierPaymentsTotal: number;
  };
}

export interface CfoKpis {
  ratio: number;
  overdueTotal: number;
  overdueCount: number;
  monthlyRecurring: number;
  burnRate: number;
}

export interface CostsSummary {
  upcoming: CompanyCostEntry[];
  fixedTotal: number;
  variableTotal: number;
}

export interface ExpectedSupplierPayment {
  orderItemId: string;
  orderId: string;
  orderCode: string | null;
  supplierName: string;
  type: "Acconto Fornitore" | "Saldo Fornitore" | "Pagamento Fornitore";
  amount: number;
  expectedDate: Date | null;
  isPaid: boolean;
  direction: "out";
}

export interface Supplier {
  id: string;
  name: string;
}

export const RECURRENCE_LABELS: Record<string, string> = {
  once: "Una tantum",
  monthly: "Mensile",
  quarterly: "Trimestrale",
  yearly: "Annuale",
};

export function recurrenceMultiplier(recurrence: string): number {
  switch (recurrence) {
    case "weekly": return 4.33;
    case "monthly": return 1;
    case "quarterly": return 1 / 3;
    case "yearly": return 1 / 12;
    default: return 1;
  }
}

/** Prefixes used to build synthetic UnifiedCost IDs */
export const COST_ID_PREFIX = {
  ORDER_ITEM_DEPOSIT: "order-item-dep-",
  ORDER_ITEM_BALANCE: "order-item-bal-",
  ORDER_ITEM: "order-item-",
  EXT_TEAM: "ext-team-",
  COMMISSION: "commission-",
  EMPLOYEE_SALARY: "employee-salary-",
} as const;

export type CostOriginType = "manual" | "order-item" | "ext-team" | "commission";

export interface CostOrigin {
  type: CostOriginType;
  realId: string;
  paymentType?: "deposit" | "balance" | "single";
}

/**
 * Resolves the origin of a UnifiedCost from its synthetic ID.
 * Returns the origin type, real DB id, and payment type (for order items).
 */
export function resolveCostOrigin(costId: string, realOrderItemId?: string): CostOrigin {
  if (costId.startsWith(COST_ID_PREFIX.ORDER_ITEM_DEPOSIT)) {
    return {
      type: "order-item",
      realId: realOrderItemId || costId.replace(COST_ID_PREFIX.ORDER_ITEM_DEPOSIT, ""),
      paymentType: "deposit",
    };
  }
  if (costId.startsWith(COST_ID_PREFIX.ORDER_ITEM_BALANCE)) {
    return {
      type: "order-item",
      realId: realOrderItemId || costId.replace(COST_ID_PREFIX.ORDER_ITEM_BALANCE, ""),
      paymentType: "balance",
    };
  }
  if (costId.startsWith(COST_ID_PREFIX.ORDER_ITEM)) {
    return {
      type: "order-item",
      realId: realOrderItemId || costId.replace(COST_ID_PREFIX.ORDER_ITEM, ""),
      paymentType: "single",
    };
  }
  if (costId.startsWith(COST_ID_PREFIX.EXT_TEAM)) {
    return {
      type: "ext-team",
      realId: costId.replace(COST_ID_PREFIX.EXT_TEAM, ""),
    };
  }
  if (costId.startsWith(COST_ID_PREFIX.COMMISSION)) {
    return {
      type: "commission",
      realId: costId.replace(COST_ID_PREFIX.COMMISSION, ""),
    };
  }
  return { type: "manual", realId: costId };
}

export interface TreasuryCategory {
  id: string;
  company_id: string;
  area: string;
  parent_id: string | null;
  name: string;
  position: number;
  is_income: boolean;
  created_at: string;
}

export interface TreasuryRow {
  id: string;
  label: string;
  level: number;
  isExpandable: boolean;
  isIncome?: boolean;
  isSummary?: boolean;
  monthlyAmounts: Record<string, number>;
  children?: TreasuryRow[];
}
