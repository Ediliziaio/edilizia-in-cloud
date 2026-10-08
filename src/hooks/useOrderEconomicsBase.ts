import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  assessOrderEconomicsQuality,
  calculateOrderEconomics,
  canonicalOrderEconomics,
  ORDER_ECONOMICS_COLUMNS,
  orderVehicleCostEstimate,
  type CanonicalEconomicsRow,
  type EconItem,
  type OrderVehicleCostEstimateRow,
} from "@/lib/orders/economics";

/** Reuses dedicated query keys and invalidation of the detailed account. */
export function useOrderEconomicsBase(orderId: string, totalAmount: number, items: EconItem[], enabled = true) {
  const {
    data: canonicalRow = null,
    isPending: canonicalPending,
    isError: canonicalError,
  } = useQuery({
    queryKey: ["order-economics-canonical", orderId],
    enabled: enabled && !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ordine_marginalita")
        .select(ORDER_ECONOMICS_COLUMNS)
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CanonicalEconomicsRow | null;
    },
  });

  const {
    data: vehicleRow = null,
    isPending: vehiclePending,
    isError: vehicleError,
  } = useQuery({
    queryKey: ["order-economics-vehicles", orderId],
    enabled: enabled && !!orderId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ordine_costi_mezzi_stimati")
        .select("costo_mezzi_stimato, mezzi_usati, giorni_mezzo, mezzi_senza_costo, dati_mezzi_visibili")
        .eq("order_id", orderId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as OrderVehicleCostEstimateRow | null;
    },
  });

  const { data: employees = [], isPending: empPending, isError: empError } = useQuery({
    queryKey: ["oes-employees", orderId], // chiave DEDICATA: non condividere la cache di OrderLaborCosts/OrderEconomics (select diversi → dati incompleti → crash)
    enabled: enabled && !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_employees")
        .select("total_cost")
        .eq("order_id", orderId);
      if (error) throw error;
      return (data ?? []) as { total_cost: number }[];
    },
  });

  const { data: teams = [], isPending: teamsPending, isError: teamsError } = useQuery({
    queryKey: ["oes-external-teams", orderId], // chiave DEDICATA (vedi sopra)
    enabled: enabled && !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select("total_cost, vat_rate")
        .eq("order_id", orderId);
      if (error) throw error;
      return (data ?? []) as { total_cost: number; vat_rate: number | null }[];
    },
  });

  const { data: salespeople = [], isPending: spPending, isError: spError } = useQuery({
    queryKey: ["oes-salespeople", orderId], // chiave DEDICATA: non condividere la cache di OrderCommissions/OrderEconomics
    enabled: enabled && !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select("commission_amount, deduction_amount")
        .eq("order_id", orderId);
      if (error) throw error;
      return (data ?? []) as { commission_amount: number; deduction_amount: number }[];
    },
  });

  const { data: errors = [], isPending: errPending, isError: errError } = useQuery({
    queryKey: ["oes-errors", orderId], // chiave DEDICATA (vedi sopra)
    enabled: enabled && !!orderId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_errors")
        .select("amount")
        .eq("order_id", orderId);
      if (error) throw error;
      return (data ?? []) as { amount: number }[];
    },
  });
  const econ = useMemo(() => calculateOrderEconomics({ totalAmount, items, employees, teams, salespeople, errors }), [totalAmount, items, employees, teams, salespeople, errors]);
  const actual = useMemo(() => canonicalOrderEconomics(canonicalRow), [canonicalRow]);
  const vehicleCosts = useMemo(() => orderVehicleCostEstimate(vehicleRow), [vehicleRow]);
  const quality = useMemo(() => assessOrderEconomicsQuality({
    sourceAvailable: canonicalRow !== null && !canonicalError,
    actual,
    items,
    employees,
    teams,
  }), [actual, canonicalError, canonicalRow, employees, items, teams]);

  return { econ, actual, quality, vehicleCosts, vehicleCostsError: vehicleError, employees, teams, salespeople, errors,
    isPending: canonicalPending || vehiclePending || empPending || teamsPending || spPending || errPending,
    isError: canonicalError || empError || teamsError || spError || errError,
  };
}
