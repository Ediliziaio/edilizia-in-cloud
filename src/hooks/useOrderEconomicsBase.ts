import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculateOrderEconomics, type EconItem } from "@/lib/orders/economics";

/** Reuses dedicated query keys and invalidation of the detailed account. */
export function useOrderEconomicsBase(orderId: string, totalAmount: number, items: EconItem[], enabled = true) {
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
  return { econ, employees, teams, salespeople, errors,
    isPending: empPending || teamsPending || spPending || errPending,
    isError: empError || teamsError || spError || errError,
  };
}
