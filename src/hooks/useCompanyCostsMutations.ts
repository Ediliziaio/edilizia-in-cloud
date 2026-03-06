import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addMonths, addQuarters, addYears, differenceInMonths } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { calculateNetFromGross } from "@/lib/vatUtils";

export interface CostFormData {
  name: string;
  cost_type: string;
  amount: string;
  category: string;
  recurrence: string;
  due_date: string;
  notes: string;
  order_id: string;
  supplier_id: string;
  vat_rate: string;
  is_gross: boolean;
  end_date: string;
}

export const defaultFormData: CostFormData = {
  name: "",
  cost_type: "fixed",
  amount: "",
  category: "",
  recurrence: "monthly",
  due_date: "",
  notes: "",
  order_id: "",
  supplier_id: "",
  vat_rate: "22",
  is_gross: false,
  end_date: "",
};

export function calculatePeriodsFromDates(dueDate: string, endDate: string, recurrence: string): number {
  if (!dueDate || !endDate) return 0;
  const start = new Date(dueDate);
  const end = new Date(endDate);
  if (end <= start) return 0;
  const diffM = differenceInMonths(end, start);
  if (recurrence === "monthly") return diffM + 1;
  if (recurrence === "quarterly") return Math.floor(diffM / 3) + 1;
  if (recurrence === "yearly") return (end.getFullYear() - start.getFullYear()) + 1;
  return 1;
}

function getNextDate(baseDate: Date, recurrence: string, offset: number): Date {
  if (recurrence === "monthly") return addMonths(baseDate, offset);
  if (recurrence === "quarterly") return addQuarters(baseDate, offset);
  if (recurrence === "yearly") return addYears(baseDate, offset);
  return baseDate;
}

export { getNextDate };

interface UseMutationsOptions {
  companyId: string | undefined;
  editingCostId: string | null;
  formRecurrence: string;
  onSaveSuccess: () => void;
  onPaySuccess: () => void;
}

export function useCompanyCostsMutations({
  companyId,
  editingCostId,
  formRecurrence,
  onSaveSuccess,
  onPaySuccess,
}: UseMutationsOptions) {
  const queryClient = useQueryClient();

  const invalidateCosts = () => {
    queryClient.invalidateQueries({ queryKey: ["company-costs"] });
    queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
  };

  const invalidateOrderItems = () => {
    queryClient.invalidateQueries({ queryKey: ["order-item-costs-full"] });
    queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
  };

  const invalidateExtTeams = () => {
    queryClient.invalidateQueries({ queryKey: ["order-external-team-costs"] });
    queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
  };

  const invalidateCommissions = () => {
    queryClient.invalidateQueries({ queryKey: ["order-commission-costs"] });
    queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
  };

  // Save (create/update) mutation
  const saveMutation = useMutation({
    mutationFn: async (data: CostFormData) => {
      const vatRate = parseFloat(data.vat_rate) || 0;
      let netAmount = parseFloat(data.amount) || 0;

      if (data.is_gross && vatRate > 0) {
        const { netAmount: net } = calculateNetFromGross(netAmount, vatRate);
        netAmount = net;
      }

      const basePayload = {
        company_id: companyId!,
        name: data.name,
        cost_type: data.cost_type,
        amount: netAmount,
        category: data.category || null,
        recurrence: data.recurrence,
        notes: data.notes || null,
        order_id: data.order_id && data.order_id !== "none" ? data.order_id : null,
        supplier_id: data.supplier_id && data.supplier_id !== "none" ? data.supplier_id : null,
        vat_rate: vatRate,
      };

      if (editingCostId) {
        const { error } = await supabase.from("company_costs").update({ ...basePayload, due_date: data.due_date }).eq("id", editingCostId);
        if (error) throw error;
        return { created: 1, isEdit: true };
      }

      let periods = 1;
      if (data.recurrence !== "once" && data.end_date && data.due_date) {
        const calculated = calculatePeriodsFromDates(data.due_date, data.end_date, data.recurrence);
        if (calculated > 0) periods = calculated;
      }
      const baseDate = new Date(data.due_date);
      let created = 0;

      for (let i = 0; i < periods; i++) {
        const date = getNextDate(baseDate, data.recurrence, i);
        const dateStr = format(date, "yyyy-MM-dd");

        if (periods > 1) {
          const { data: existing } = await supabase
            .from("company_costs")
            .select("id")
            .eq("company_id", companyId!)
            .eq("name", data.name)
            .eq("due_date", dateStr)
            .limit(1);
          if (existing && existing.length > 0) continue;
        }

        const { error } = await supabase.from("company_costs").insert({
          ...basePayload,
          due_date: dateStr,
          is_paid: false,
        });
        if (error) throw error;
        created++;
      }

      return { created, isEdit: false, periods, baseDate };
    },
    onSuccess: (result) => {
      invalidateCosts();
      onSaveSuccess();

      if (result.isEdit) {
        toast({ title: "Costo aggiornato" });
      } else if (result.created > 1) {
        const baseDate = result.baseDate as Date;
        const lastDate = getNextDate(baseDate, formRecurrence, result.created - 1);
        toast({
          title: `Creati ${result.created} costi`,
          description: `Da ${format(baseDate, "MMM yyyy", { locale: it })} a ${format(lastDate, "MMM yyyy", { locale: it })}`,
        });
      } else {
        toast({ title: result.created > 0 ? "Costo aggiunto" : "Costo già esistente (duplicato ignorato)" });
      }
    },
    onError: () => {
      toast({ title: "Errore nel salvataggio", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_costs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCosts();
      toast({ title: "Costo eliminato" });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("company_costs")
        .delete()
        .eq("company_id", companyId!)
        .eq("name", name)
        .select("id");
      if (error) throw error;
      return { name, count: data?.length || 0 };
    },
    onSuccess: (result) => {
      invalidateCosts();
      toast({ title: `Eliminati ${result.count} costi "${result.name}"` });
    },
    onError: () => {
      toast({ title: "Errore nell'eliminazione", variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("company_costs").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      invalidateCosts();
      toast({ title: `Eliminati ${count} costi` });
    },
    onError: () => {
      toast({ title: "Errore nell'eliminazione", variant: "destructive" });
    },
  });

  const bulkMarkPaidMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { error } = await supabase.from("company_costs").update({ is_paid: true, paid_date: today }).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      invalidateCosts();
      toast({ title: `${count} costi segnati come pagati` });
    },
    onError: () => {
      toast({ title: "Errore nell'aggiornamento", variant: "destructive" });
    },
  });

  const bulkMarkUnpaidMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("company_costs").update({ is_paid: false, paid_date: null }).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      invalidateCosts();
      toast({ title: `${count} costi riportati a non pagati` });
    },
    onError: () => {
      toast({ title: "Errore nell'aggiornamento", variant: "destructive" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase.from("company_costs").update({ is_paid: true, paid_date: date }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCosts();
      onPaySuccess();
      toast({ title: "Costo segnato come pagato" });
    },
    onError: (error) => {
      console.error("Payment error:", error);
      toast({ title: "Errore nel salvataggio del pagamento", variant: "destructive" });
    },
  });

  const markUnpaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_costs").update({ is_paid: false, paid_date: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCosts();
      toast({ title: "Costo riportato a non pagato" });
    },
    onError: (error) => {
      console.error("Payment error:", error);
      toast({ title: "Errore nel salvataggio del pagamento", variant: "destructive" });
    },
  });

  const markOrderItemPaidMutation = useMutation({
    mutationFn: async ({ id, date, paymentType }: { id: string; date: string; paymentType?: "single" | "deposit" | "balance" }) => {
      let updateData: any;
      if (paymentType === "deposit") updateData = { deposit_paid: true, deposit_paid_date: date };
      else if (paymentType === "balance") updateData = { balance_paid: true, balance_paid_date: date };
      else updateData = { is_paid: true, paid_date: date };
      const { error } = await supabase.from("order_items").update(updateData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateOrderItems();
      onPaySuccess();
      toast({ title: "Articolo segnato come pagato" });
    },
    onError: (error) => {
      console.error("Payment error:", error);
      toast({ title: "Errore nel salvataggio del pagamento", variant: "destructive" });
    },
  });

  const markOrderItemUnpaidMutation = useMutation({
    mutationFn: async ({ id, paymentType }: { id: string; paymentType?: "single" | "deposit" | "balance" }) => {
      let updateData: any;
      if (paymentType === "deposit") updateData = { deposit_paid: false, deposit_paid_date: null };
      else if (paymentType === "balance") updateData = { balance_paid: false, balance_paid_date: null };
      else updateData = { is_paid: false, paid_date: null };
      const { error } = await supabase.from("order_items").update(updateData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateOrderItems();
      toast({ title: "Articolo riportato a non pagato" });
    },
    onError: (error) => {
      console.error("Payment error:", error);
      toast({ title: "Errore nel salvataggio del pagamento", variant: "destructive" });
    },
  });

  const markExtTeamPaidMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase.from("order_external_teams").update({ is_paid: true, paid_date: date } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateExtTeams();
      onPaySuccess();
      toast({ title: "Squadra esterna segnata come pagata" });
    },
    onError: (error) => {
      console.error("Payment error:", error);
      toast({ title: "Errore nel salvataggio del pagamento", variant: "destructive" });
    },
  });

  const markExtTeamUnpaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_external_teams").update({ is_paid: false, paid_date: null } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateExtTeams();
      toast({ title: "Squadra esterna riportata a non pagata" });
    },
    onError: (error) => {
      console.error("Payment error:", error);
      toast({ title: "Errore nel salvataggio del pagamento", variant: "destructive" });
    },
  });

  const markCommissionPaidMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase.from("order_salespeople").update({ is_paid: true, paid_date: date } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCommissions();
      onPaySuccess();
      toast({ title: "Provvigione segnata come pagata" });
    },
    onError: (error) => {
      console.error("Payment error:", error);
      toast({ title: "Errore nel salvataggio del pagamento", variant: "destructive" });
    },
  });

  const markCommissionUnpaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_salespeople").update({ is_paid: false, paid_date: null } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCommissions();
      toast({ title: "Provvigione riportata a non pagata" });
    },
    onError: (error) => {
      console.error("Payment error:", error);
      toast({ title: "Errore nel salvataggio del pagamento", variant: "destructive" });
    },
  });

  // CSV import handler
  const handleCostsImport = async (rows: Record<string, string>[]) => {
    if (!companyId) return { success: 0, errors: ["Azienda non trovata"] };
    let success = 0;
    const errors: string[] = [];
    const recurrenceMap: Record<string, string> = {
      "mensile": "monthly", "trimestrale": "quarterly", "annuale": "yearly",
      "una tantum": "once", "monthly": "monthly", "quarterly": "quarterly",
      "yearly": "yearly", "once": "once",
    };
    const typeMap: Record<string, string> = {
      "fisso": "fixed", "variabile": "variable", "fixed": "fixed", "variable": "variable",
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.name?.trim()) { errors.push(`Riga ${i + 1}: Nome mancante`); continue; }
        const amount = parseFloat(row.amount);
        if (isNaN(amount) || amount <= 0) { errors.push(`Riga ${i + 1}: Importo non valido`); continue; }
        if (!row.due_date?.trim()) { errors.push(`Riga ${i + 1}: Data scadenza mancante`); continue; }
        let dueDate = row.due_date.trim();
        if (dueDate.includes("/")) {
          const parts = dueDate.split("/");
          if (parts.length === 3) dueDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
        const costType = typeMap[(row.cost_type || "").toLowerCase().trim()] || "fixed";
        const recurrence = recurrenceMap[(row.recurrence || "").toLowerCase().trim()] || "monthly";
        const { error } = await supabase.from("company_costs").insert({
          company_id: companyId, name: row.name.trim(), cost_type: costType, amount,
          category: row.category?.trim() || null, recurrence, due_date: dueDate,
          notes: row.notes?.trim() || null,
        });
        if (error) throw error;
        success++;
      } catch (err: any) {
        errors.push(`Riga ${i + 1}: ${err?.message || "Errore"}`);
      }
    }
    invalidateCosts();
    return { success, errors };
  };

  return {
    saveMutation,
    deleteMutation,
    deleteGroupMutation,
    bulkDeleteMutation,
    bulkMarkPaidMutation,
    bulkMarkUnpaidMutation,
    markPaidMutation,
    markUnpaidMutation,
    markOrderItemPaidMutation,
    markOrderItemUnpaidMutation,
    markExtTeamPaidMutation,
    markExtTeamUnpaidMutation,
    markCommissionPaidMutation,
    markCommissionUnpaidMutation,
    handleCostsImport,
  };
}
