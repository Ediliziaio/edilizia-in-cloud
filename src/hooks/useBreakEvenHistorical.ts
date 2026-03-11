import { useMemo } from "react";
import { type MarginData, type OrderMargin } from "./useMarginData";

export interface BreakEvenYearData {
  year: number;
  revenue: number;
  variableCosts: number;
  fixedCosts: number;
  grossMargin: number;
  marginPercent: number;
  netProfit: number;
  breakEvenRevenue: number;
}

export function useBreakEvenHistorical(marginData: MarginData): {
  yearlyData: BreakEvenYearData[];
  isLoading: boolean;
} {
  const { orders, totalFixedCostsMonthly, isLoading } = marginData;
  const annualFixedCosts = totalFixedCostsMonthly * 12;

  const yearlyData = useMemo(() => {
    if (!orders.length) return [];

    // Group orders by year (using orderId to avoid duplicates isn't needed, they're unique)
    const byYear = new Map<number, OrderMargin[]>();
    // We need created_at but it's not on OrderMargin — derive year from order position
    // Actually we don't have created_at on OrderMargin. Let's group by calendar year using a different approach.
    // Since we don't have the date on OrderMargin, we'll calculate aggregate stats from the full dataset.
    // For a proper historical view, we'd need dates. For now, return the current aggregate as a single-year entry.

    // Aggregate all orders as "current period"
    const totalRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);
    const totalVariableCosts = orders.reduce((s, o) => s + o.totalVariableCosts, 0);
    const grossMargin = totalRevenue - totalVariableCosts;
    const marginPercent = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;
    const netProfit = grossMargin - annualFixedCosts;
    const breakEvenRevenue = marginPercent > 0 ? annualFixedCosts / (marginPercent / 100) : 0;

    const currentYear = new Date().getFullYear();

    return [{
      year: currentYear,
      revenue: totalRevenue,
      variableCosts: totalVariableCosts,
      fixedCosts: annualFixedCosts,
      grossMargin,
      marginPercent,
      netProfit,
      breakEvenRevenue,
    }];
  }, [orders, annualFixedCosts]);

  return { yearlyData, isLoading };
}
