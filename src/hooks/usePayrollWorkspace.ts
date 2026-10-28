import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { readAllPages } from "@/lib/personale/readAllPages";
import {
  payrollPeriod,
  assertPayrollDate,
  type PayrollPerson,
  type BenefitRow,
  type BenefitConfig,
  type PayrollMovement,
  type PayrollDocument,
  type PayrollLink,
  type PayrollBalance,
  type PayrollType,
} from "@/lib/paghe/registri";
import { toast } from "sonner";
type Command =
  | { kind: "config"; data: Omit<BenefitConfig, "company_id"> }
  | {
      kind: "right";
      person: string;
      field: "buono_pasto_abilitato" | "rimborso_km_abilitato";
      value: boolean;
    }
  | { kind: "reconcile" }
  | {
      kind: "km";
      id: string;
      person: string;
      date: string;
      km: number;
      rate: number;
      reference: string;
    }
  | {
      kind: "receipt";
      id: string;
      person: string;
      date: string;
      amount: number;
      reference: string;
      merchant: string;
    }
  | {
      kind: "state";
      table: "hr_buoni_pasto" | "hr_rimborsi_km";
      id: string;
      state: string;
      reference: string;
    }
  | {
      kind: "movement";
      request: string;
      person: string;
      date: string;
      type: PayrollType;
      amount: number;
      reference: string;
      source: string;
      destination: string;
      reversal: string | null;
    }
  | { kind: "link"; movement: string; document: string; reason: string };
export function usePayrollWorkspace(
  month: string,
  area: "benefit" | "registers",
) {
  const company = useEffectiveCompanyId(),
    permissions = usePermissions(),
    qc = useQueryClient();
  const allowed = !!company && !permissions.isLoading && permissions.isAdmin;
  const canEdit = allowed && !permissions.solaLettura;
  const { start, end } = payrollPeriod(month);
  const people = useQuery({
    queryKey: ["payroll-people", company],
    enabled: allowed,
    staleTime: 60_000,
    queryFn: async ({ signal }) =>
      (await readAllPages((from, to) =>
        supabase
          .from("hr_profili")
          .select(
            "id,nome,cognome,matricola,employee_id,attivo,buono_pasto_abilitato,rimborso_km_abilitato",
          )
          .eq("company_id", company!)
          .order("cognome")
          .order("id")
          .range(from, to)
          .abortSignal(signal),
      )) as unknown as PayrollPerson[],
  });
  const config = useQuery({
    queryKey: ["payroll-config", company],
    enabled: allowed && area === "benefit",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_impostazioni_benefit" as never)
        .select("*")
        .eq("company_id", company!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as BenefitConfig | null;
    },
  });
  const meals = useQuery({
    queryKey: ["payroll-meals", company, month],
    enabled: allowed && area === "benefit",
    queryFn: async ({ signal }) =>
      (await readAllPages((from, to) =>
        supabase
          .from("hr_buoni_pasto" as never)
          .select("*")
          .eq("company_id", company!)
          .gte("giorno", start)
          .lte("giorno", end)
          .order("giorno", { ascending: false })
          .order("id")
          .range(from, to)
          .abortSignal(signal),
      )) as unknown as BenefitRow[],
  });
  const km = useQuery({
    queryKey: ["payroll-km", company, month],
    enabled: allowed && area === "benefit",
    queryFn: async ({ signal }) =>
      (await readAllPages((from, to) =>
        supabase
          .from("hr_rimborsi_km" as never)
          .select("*")
          .eq("company_id", company!)
          .gte("giorno", start)
          .lte("giorno", end)
          .order("giorno", { ascending: false })
          .order("id")
          .range(from, to)
          .abortSignal(signal),
      )) as unknown as BenefitRow[],
  });
  const movements = useQuery({
    queryKey: ["payroll-movements", company, month],
    enabled: allowed && area === "registers",
    queryFn: async ({ signal }) =>
      (await readAllPages((from, to) =>
        supabase
          .from("hr_paghe_movimenti" as never)
          .select("*")
          .eq("company_id", company!)
          .gte("data", start)
          .lte("data", end)
          .order("data", { ascending: false })
          .order("id")
          .range(from, to)
          .abortSignal(signal),
      )) as unknown as PayrollMovement[],
  });
  const links = useQuery({
    queryKey: ["payroll-links", company, month],
    enabled: allowed && area === "registers",
    queryFn: async ({ signal }) => {
      // Restrict to the selected month through the immutable movement relationship.
      return (await readAllPages((from, to) =>
        supabase
          .from("hr_paghe_riconciliazioni" as never)
          .select(
            "movimento_id,documento_id,motivo,hr_paghe_movimenti!inner(data)",
          )
          .eq("company_id", company!)
          .gte("hr_paghe_movimenti.data", start)
          .lte("hr_paghe_movimenti.data", end)
          .order("id")
          .range(from, to)
          .abortSignal(signal),
      )) as unknown as PayrollLink[];
    },
  });
  const documents = useQuery({
    queryKey: ["payroll-documents", company, month],
    enabled: allowed && area === "registers",
    queryFn: async ({ signal }) =>
      (await readAllPages((from, to) =>
        supabase
          .from("hr_paghe_documenti" as never)
          .select("id,titolo,hr_profilo_id,employee_id")
          .eq("company_id", company!)
          .eq("anno", Number(month.slice(0, 4)))
          .or(`mese.eq.${Number(month.slice(5))},mese.is.null`)
          .is("sostituito_da", null)
          .order("id")
          .range(from, to)
          .abortSignal(signal),
      )) as unknown as PayrollDocument[],
  });
  const balances = useQuery({
    queryKey: ["payroll-balances", company, month],
    enabled: allowed && area === "registers",
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "hr_paghe_saldi" as never,
        { p_company: company, p_data: end } as never,
      );
      if (error) throw error;
      return data as unknown as PayrollBalance[];
    },
  });
  const closure = useQuery({
    queryKey: ["hr-month-closure", company, month],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_chiusure_mensili" as never)
        .select("stato")
        .eq("company_id", company!)
        .eq("mese", start)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { stato: string } | null;
    },
  });
  const change = useMutation({
    mutationFn: async (command: Command) => {
      if (!canEdit)
        throw Error("Operazione riservata agli amministratori autorizzati");
      if (closure.isPending || closure.isError)
        throw Error("Verifica prima lo stato del mese");
      if (
        closure.data?.stato === "chiuso" &&
        !["config", "right"].includes(command.kind)
      )
        throw Error("Mese HR chiuso: serve riapertura autorizzata con motivo");
      if ("date" in command) assertPayrollDate(command.date, month);
      if (command.kind === "config") {
        const { error } = await supabase
          .from("hr_impostazioni_benefit" as never)
          .upsert({ company_id: company, ...command.data } as never);
        if (error) throw error;
      } else if (command.kind === "right") {
        const { error } = await supabase
          .from("hr_profili")
          .update({ [command.field]: command.value } as never)
          .eq("company_id", company!)
          .eq("id", command.person)
          .select("id")
          .single();
        if (error) throw error;
      } else if (command.kind === "reconcile") {
        const { data, error } = await supabase.rpc(
          "hr_pasti_riconcilia" as never,
          { p_company: company, p_mese: start } as never,
        );
        if (error) throw error;
        return data;
      } else if (command.kind === "km") {
        if (
          command.reference.trim().length < 5 ||
          command.km <= 0 ||
          command.rate <= 0
        )
          throw Error("Completa km, tariffa e riferimento");
        const { error } = await supabase
          .from("hr_rimborsi_km" as never)
          .insert({
            id: command.id,
            company_id: company,
            profilo_id: command.person,
            giorno: command.date,
            km: command.km,
            tariffa_eur_km: command.rate,
            importo: Math.round(command.km * command.rate * 100) / 100,
            stato: "da_confermare",
            fonte: "manuale",
            mezzo_proprio: true,
            note: command.reference.trim(),
          } as never);
        if (error) throw error;
      } else if (command.kind === "receipt") {
        if (command.amount <= 0 || command.reference.trim().length < 5)
          throw Error("Indica importo e riferimento della ricevuta");
        const { error } = await supabase
          .from("hr_buoni_pasto" as never)
          .insert({
            id: command.id,
            company_id: company,
            profilo_id: command.person,
            giorno: command.date,
            tipo: "ricevuta",
            importo: command.amount,
            stato: "maturato",
            esercente: command.merchant.trim() || null,
            note: command.reference.trim(),
          } as never);
        if (error) throw error;
      } else if (command.kind === "state") {
        if (command.reference.trim().length < 5)
          throw Error(
            "Inserisci il riferimento della verifica o dell’erogazione già eseguita",
          );
        const { error } = await supabase
          .from(command.table as never)
          .update({
            stato: command.state,
            note: command.reference.trim(),
          } as never)
          .eq("company_id", company!)
          .eq("id", command.id)
          .select("id")
          .single();
        if (error) throw error;
      } else if (command.kind === "movement") {
        const { data, error } = await supabase.rpc(
          "hr_paghe_registra" as never,
          {
            p_company: company,
            p_richiesta: command.request,
            p_profilo: command.person,
            p_data: command.date,
            p_tipo: command.type,
            p_importo: command.amount,
            p_riferimento: command.reference.trim(),
            p_fonte: command.source,
            p_destinazione: command.destination.trim(),
            p_storno: command.reversal,
          } as never,
        );
        if (error) throw error;
        return data;
      } else {
        const { error } = await supabase
          .from("hr_paghe_riconciliazioni" as never)
          .insert({
            company_id: company,
            movimento_id: command.movement,
            documento_id: command.document,
            motivo: command.reason.trim(),
          } as never);
        if (error) throw error;
      }
    },
    onSuccess: (_, command) =>
      toast.success(
        command.kind === "reconcile"
          ? "Maturazioni riconciliate; nessuna erogazione eseguita"
          : "Registrazione salvata; nessun pagamento o invio eseguito",
      ),
    onError: (e) =>
      toast.error(
        e instanceof Error
          ? e.message
          : (e as { message?: string })?.message || "Operazione non riuscita",
      ),
    onSettled: () => {
      for (const key of [
        "payroll-people",
        "payroll-config",
        "payroll-meals",
        "payroll-km",
        "payroll-movements",
        "payroll-links",
        "payroll-balances",
        "hr-profili",
        "hr-all-profili",
      ])
        void qc.invalidateQueries({ queryKey: [key] });
    },
  });
  return {
    company,
    allowed,
    canEdit: canEdit && !closure.isError && !closure.isPending,
    closed: closure.data?.stato === "chiuso",
    people,
    config,
    meals,
    km,
    movements,
    links,
    documents,
    balances,
    closure,
    change,
  };
}
