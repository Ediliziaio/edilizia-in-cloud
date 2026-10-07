// src/hooks/useModelliPagamento.ts
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  assemblaModelliPagamento, modelliPagamentoDaOffrire,
  type ModelloPagamento, type ModelloPagamentoPerServer, type PayloadModelloPagamento,
} from "@/lib/orders/modelliPagamento";
import { salMaturaValido, type SalMatura } from "@/lib/orders/salMaturazione";

// Le tabelle non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface ModelliPagamentoAzienda {
  modelli: ModelloPagamento[];
  /** I modelli di partenza sono già stati fatti suoi dall'azienda. */
  inizializzati: boolean;
  /** L'id del modello con cui partono le commesse nuove, o nessuno. */
  predefinito: string | null;
  salMatura: SalMatura;
  /** La lettura è andata a buon fine (le tabelle ci sono): senza, si offrono i modelli di partenza e non si tenta nulla. */
  disponibile: boolean;
}
const NESSUNO: ModelliPagamentoAzienda = { modelli: [], inizializzati: false, predefinito: null, salMatura: "emesso", disponibile: false };

export const chiaveModelliPagamento = (companyId: string | undefined) => ["modelli-pagamento", companyId] as const;

/** Messaggi in italiano per gli errori che l'utente può causare (i controlli del database sono già in italiano). */
export function messaggioModelloPagamento(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "23505") return "Esiste già un modello con questo nome.";
  if (err?.code === "42501") return "Non hai il permesso di modificare i modelli di pagamento.";
  if (err?.code === "22023" || err?.code === "P0002") return err.message || "Controlla i dati del modello.";
  return err?.message || "Operazione non riuscita. Riprova.";
}

/** I modelli di pagamento dell'azienda, con le sue scelte (modello di partenza, quando matura un SAL). */
export function useModelliPagamento() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiaveModelliPagamento(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<ModelliPagamentoAzienda> => {
      // Se la lettura fallisce (tabelle non ancora create, rete) si offrono i soli modelli di partenza.
      try {
        const [m, r, impostazioni] = await Promise.all([
          db.from("payment_plan_templates").select("id, name, hint, position").eq("company_id", companyId!).order("position"),
          db.from("payment_plan_template_rows")
            .select("id, template_id, position, label, type, percent, trigger_evento, trigger_numero, giorni_preavviso")
            .eq("company_id", companyId!).order("position"),
          // «*»: la colonna sal_matura_quando c'è solo dopo la seconda migrazione, e la lettura non deve fallire senza.
          db.from("company_pagamenti_settings").select("*").eq("company_id", companyId!).maybeSingle(),
        ]);
        for (const x of [m, r, impostazioni]) if (x.error) throw x.error;
        return {
          modelli: assemblaModelliPagamento(m.data ?? [], r.data ?? []),
          inizializzati: Boolean(impostazioni.data?.modelli_inizializzati),
          predefinito: (impostazioni.data?.modello_predefinito as string | null | undefined) ?? null,
          salMatura: salMaturaValido(impostazioni.data?.sal_matura_quando),
          disponibile: true,
        };
      } catch {
        return NESSUNO;
      }
    },
  });

  const riparti = () => qc.invalidateQueries({ queryKey: chiaveModelliPagamento(companyId) });
  const onError = (e: unknown) => toast.error(messaggioModelloPagamento(e));

  const salva = useMutation({
    mutationFn: async (modello: PayloadModelloPagamento): Promise<string> => {
      const { data, error } = await db.rpc("salva_modello_pagamento", { p_company_id: companyId, p_modello: modello });
      if (error) throw error;
      return data as string;
    },
    onSuccess: riparti,
    onError,
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("elimina_modello_pagamento", { p_company_id: companyId, p_id: id });
      if (error) throw error;
    },
    onSuccess: riparti,
    onError,
  });

  // I modelli di partenza diventano dell'azienda (una volta), o si rimettono quelli che mancano.
  const inizializza = useMutation({
    mutationFn: async ({ modelli, soloMancanti }: { modelli: ModelloPagamentoPerServer[]; soloMancanti: boolean }): Promise<number> => {
      const { data, error } = await db.rpc("inizializza_modelli_pagamento", {
        p_company_id: companyId, p_modelli: modelli, p_solo_mancanti: soloMancanti,
      });
      if (error) throw error;
      return Number(data) || 0;
    },
    onSuccess: riparti,
    onError,
  });

  // Le scelte dell'azienda: il modello di partenza e quando matura la rata di un SAL.
  const impostazioni = useMutation({
    mutationFn: async (valori: { modelloPredefinito?: string | null; salMatura?: SalMatura }) => {
      const p_valori: Record<string, unknown> = {};
      if (valori.modelloPredefinito !== undefined) p_valori.modello_predefinito = valori.modelloPredefinito;
      if (valori.salMatura !== undefined) p_valori.sal_matura_quando = valori.salMatura;
      const { error } = await db.rpc("pagamenti_impostazioni_salva", { p_company_id: companyId, p_valori });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fatto: vale da subito per le commesse nuove");
      void riparti();
    },
    onError,
  });

  const dati = query.data ?? NESSUNO;
  const offerti = useMemo(() => modelliPagamentoDaOffrire(dati.inizializzati, dati.modelli), [dati.inizializzati, dati.modelli]);
  return {
    modelli: dati.modelli,
    /** I modelli da offrire: i suoi, o finché non li ha fatti suoi quelli di partenza. */
    offerti,
    inizializzati: dati.inizializzati,
    predefinito: dati.predefinito,
    salMatura: dati.salMatura,
    disponibile: dati.disponibile,
    isLoading: query.isLoading,
    salva, elimina, inizializza, impostazioni,
  };
}
