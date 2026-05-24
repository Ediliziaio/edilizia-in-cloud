import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addMonths, addQuarters, addYears, differenceInMonths } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { calculateNetFromGross } from "@/lib/vatUtils";
import { queryKeys } from "@/lib/queryKeys";
import { logger } from "@/utils/logger";

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
  recurrence_auto: boolean;
  allocations?: Array<{ order_id: string; pct: number }>;
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
  recurrence_auto: false,
};

const VALID_COST_TYPES = new Set(["fixed", "variable"]);
const VALID_RECURRENCES = new Set(["once", "monthly", "quarterly", "yearly"]);

export function parseCostDecimal(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  return Number(normalized);
}

function isValidDateField(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function normalizeAllocations(
  allocations: CostFormData["allocations"],
): Array<{ order_id: string; pct: number }> {
  const normalized: Array<{ order_id: string; pct: number }> = [];

  for (const allocation of allocations ?? []) {
    const pct = Number(allocation.pct);
    const orderId = allocation.order_id?.trim();

    if (!Number.isFinite(pct)) {
      throw new Error("Percentuale allocazione non valida.");
    }
    if (pct < 0 || pct > 100) {
      throw new Error("Le allocazioni devono essere comprese tra 0% e 100%.");
    }
    if (pct > 0 && !orderId) {
      throw new Error("Ogni allocazione maggiore di 0% deve avere un ordine collegato.");
    }
    if (pct > 0 && orderId) {
      normalized.push({ order_id: orderId, pct });
    }
  }

  const totalPct = normalized.reduce((sum, allocation) => sum + allocation.pct, 0);
  if (totalPct > 100) {
    throw new Error("Il totale delle allocazioni non può superare il 100%.");
  }

  return normalized;
}

export function validateCostFormData(data: CostFormData) {
  const name = data.name.trim();
  if (!name) throw new Error("La descrizione del costo è obbligatoria.");

  const amount = parseCostDecimal(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("L'importo deve essere maggiore di zero.");
  }

  const vatRate = parseCostDecimal(data.vat_rate);
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
    throw new Error("L'aliquota IVA deve essere compresa tra 0% e 100%.");
  }

  const costType = VALID_COST_TYPES.has(data.cost_type) ? data.cost_type : "fixed";
  const recurrence = VALID_RECURRENCES.has(data.recurrence) ? data.recurrence : "once";

  if (!data.due_date || !isValidDateField(data.due_date)) {
    throw new Error("La data di scadenza è obbligatoria e deve essere valida.");
  }
  if (recurrence !== "once" && data.end_date) {
    if (!isValidDateField(data.end_date)) {
      throw new Error("La data fine contratto deve essere valida.");
    }
    if (new Date(`${data.end_date}T00:00:00`) < new Date(`${data.due_date}T00:00:00`)) {
      throw new Error("La data fine contratto non può precedere la prima scadenza.");
    }
  }

  return {
    name,
    amount,
    vatRate,
    costType,
    recurrence,
    dueDate: data.due_date,
    endDate: recurrence !== "once" ? data.end_date : "",
    allocations: normalizeAllocations(data.allocations),
  };
}

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
    queryClient.invalidateQueries({ queryKey: queryKeys.costs.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.companyCosts(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
  };

  const invalidateOrderItems = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.costs.orderItems(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.companyCosts(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
  };

  const invalidateExtTeams = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.costs.externalTeams(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.companyCosts(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
  };

  const invalidateCommissions = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.costs.commissions(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.companyCosts(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) });
  };

  // Save (create/update) mutation
  const saveMutation = useMutation({
    mutationFn: async (data: CostFormData) => {
      const normalized = validateCostFormData(data);
      const vatRate = normalized.vatRate;
      let netAmount = normalized.amount;

      if (data.is_gross && vatRate > 0) {
        const { netAmount: net } = calculateNetFromGross(netAmount, vatRate);
        netAmount = net;
      }

      const basePayload = {
        company_id: companyId!,
        name: normalized.name,
        cost_type: normalized.costType,
        amount: netAmount,
        category: data.category || null,
        recurrence: normalized.recurrence,
        notes: data.notes || null,
        order_id: data.order_id && data.order_id !== "none" ? data.order_id : null,
        supplier_id: data.supplier_id && data.supplier_id !== "none" ? data.supplier_id : null,
        vat_rate: vatRate,
        recurrence_auto: normalized.recurrence !== "once" ? (data.recurrence_auto || false) : false,
        recurrence_end_date: normalized.endDate || null,
        allocations: normalized.allocations,
      };

      if (editingCostId) {
        const { error } = await supabase.from("company_costs").update({ ...basePayload, due_date: normalized.dueDate }).eq("id", editingCostId);
        if (error) throw error;

        // Generate missing future occurrences — bulk INSERT (1 query check + 1 INSERT)
        let additionalCreated = 0;
        if (normalized.recurrence !== "once" && normalized.endDate && normalized.dueDate) {
          const periods = calculatePeriodsFromDates(normalized.dueDate, normalized.endDate, normalized.recurrence);
          const baseDate = new Date(normalized.dueDate);
          const allDates: string[] = [];
          for (let i = 0; i < periods; i++) {
            const dateStr = format(getNextDate(baseDate, normalized.recurrence, i), "yyyy-MM-dd");
            if (dateStr !== normalized.dueDate) allDates.push(dateStr);
          }
          if (allDates.length > 0) {
            const { data: existing } = await supabase
              .from("company_costs")
              .select("due_date")
              .eq("company_id", companyId!)
              .eq("name", normalized.name)
              .in("due_date", allDates);
            const existingDates = new Set((existing || []).map((r: any) => r.due_date));
            const datesToInsert = allDates.filter(d => !existingDates.has(d));
            if (datesToInsert.length > 0) {
              const { error: insertErr } = await supabase.from("company_costs").insert(
                datesToInsert.map(d => ({ ...basePayload, due_date: d, is_paid: false }))
              );
              if (insertErr) throw insertErr;
              additionalCreated = datesToInsert.length;
            }
          }
        }

        return { created: 1 + additionalCreated, isEdit: true, additionalCreated };
      }

      const baseDate = new Date(normalized.dueDate);
      let created = 0;

      if (normalized.recurrence !== "once" && normalized.endDate && normalized.dueDate) {
        // Bulk path: genera tutte le date → 1 check duplicati → 1 INSERT
        const periods = calculatePeriodsFromDates(normalized.dueDate, normalized.endDate, normalized.recurrence);
        const allDates: string[] = [];
        for (let i = 0; i < (periods > 0 ? periods : 1); i++) {
          allDates.push(format(getNextDate(baseDate, normalized.recurrence, i), "yyyy-MM-dd"));
        }
        const { data: existing } = await supabase
          .from("company_costs")
          .select("due_date")
          .eq("company_id", companyId!)
          .eq("name", normalized.name)
          .in("due_date", allDates);
        const existingDates = new Set((existing || []).map((r: any) => r.due_date));
        const datesToInsert = allDates.filter(d => !existingDates.has(d));
        if (datesToInsert.length > 0) {
          const { error } = await supabase.from("company_costs").insert(
            datesToInsert.map(d => ({ ...basePayload, due_date: d, is_paid: false }))
          );
          if (error) throw error;
          created = datesToInsert.length;
        }
      } else {
        // Single INSERT
        const { error } = await supabase.from("company_costs").insert({
          ...basePayload,
          due_date: normalized.dueDate,
          is_paid: false,
        });
        if (error) throw error;
        created = 1;
      }

      return { created, isEdit: false, periods: created, baseDate };
    },
    onSuccess: (result) => {
      invalidateCosts();
      onSaveSuccess();

      if (result.isEdit) {
        if (result.additionalCreated && result.additionalCreated > 0) {
          toast({ title: "Costo aggiornato", description: `Creati ${result.additionalCreated} nuovi costi ricorrenti` });
        } else {
          toast({ title: "Costo aggiornato" });
        }
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
    onError: (error) => {
      toast({
        title: "Errore nel salvataggio",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
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
    mutationFn: async ({ id, date, paymentMethod }: { id: string; date: string; paymentMethod?: string }) => {
      // Update the cost as paid
      const { data: costData, error } = await supabase
        .from("company_costs")
        .update({ is_paid: true, paid_date: date, ...(paymentMethod ? { payment_method: paymentMethod } : {}) })
        .eq("id", id)
        .select("name, amount, company_id")
        .single();
      if (error) throw error;

      // Auto-create Prima Nota entry
      if (costData) {
        await supabase.from("prima_nota_entries").insert({
          company_id: costData.company_id,
          direction: "uscita",
          amount: costData.amount,
          description: `Pagamento: ${costData.name}`,
          entry_date: date,
          category: "Costi Aziendali",
          cost_id: id,
          is_auto: true,
          auto_source: "company_cost_payment",
          ...(paymentMethod ? { payment_method: paymentMethod } : {}),
        }).catch((e: any) => console.warn("[markPaid] prima_nota_entries insert failed:", e));
      }
    },
    onSuccess: () => {
      invalidateCosts();
      onPaySuccess();
      toast({ title: "Costo segnato come pagato" });
    },
    onError: (error) => {
      logger.error("Payment error:", error);
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
      logger.error("Payment error:", error);
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
      logger.error("Payment error:", error);
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
      logger.error("Payment error:", error);
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
      logger.error("Payment error:", error);
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
      logger.error("Payment error:", error);
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
      logger.error("Payment error:", error);
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
      logger.error("Payment error:", error);
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
        const amount = parseCostDecimal(row.amount);
        if (isNaN(amount) || amount <= 0) { errors.push(`Riga ${i + 1}: Importo non valido`); continue; }
        if (!row.due_date?.trim()) { errors.push(`Riga ${i + 1}: Data scadenza mancante`); continue; }
        let dueDate = row.due_date.trim();
        if (dueDate.includes("/")) {
          const parts = dueDate.split("/");
          if (parts.length === 3) dueDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
        if (!isValidDateField(dueDate)) { errors.push(`Riga ${i + 1}: Data scadenza non valida`); continue; }
        const costType = typeMap[(row.cost_type || "").toLowerCase().trim()] || "fixed";
        const recurrence = recurrenceMap[(row.recurrence || "").toLowerCase().trim()] || "once";
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
