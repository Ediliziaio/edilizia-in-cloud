/**
 * Dati della console Clienti marketing: i numeri del mese per cliente dal
 * database (admin_clienti_marketing_riepilogo), l'aggiornamento della spesa
 * Meta (chiede a Meta il totale del mese per l'account pubblicitario scelto
 * dal cliente e lo lascia in cache, dove la funzione lo legge) e i costi
 * inseriti a mano (campaign_costs).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fineMeseOOggi, type ClienteMarketing } from "./provvigioni";

// Funzioni e colonne nuove: i tipi generati non le conoscono ancora.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const n = (v: unknown) => Number(v ?? 0) || 0;

const NUMERICI: Array<keyof ClienteMarketing> = [
  "lead_mese", "lead_prec", "lead_meta", "lead_google", "lead_form", "lead_altri", "lead_lavorati", "lead_non_gestiti",
  "appuntamenti_mese", "appuntamenti_prec", "vinte_mese", "vinte_prec", "valore_vinto_mese", "valore_vinto_prec",
  "pipeline_aperta", "valore_pipeline_aperta", "spesa_meta", "lead_meta_dichiarati", "spesa_google", "spesa_manuale",
  "form_attivi", "utenti", "promemoria_aperti", "promemoria_scaduti",
];
const NUMERICI_O_NULL: Array<keyof ClienteMarketing> = ["ore_mediane_primo_contatto", "fatturato_mese", "fatturato_prec", "mese_dovuto", "mese_incassato", "giorni_senza_lead"];

export function useClientiMarketing(mese: string, enabled = true) {
  return useQuery({
    queryKey: ["clienti-marketing", "riepilogo", mese],
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_clienti_marketing_riepilogo", { p_mese: mese });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
        const out = { ...r } as Record<string, unknown>;
        for (const k of NUMERICI) out[k] = n(r[k]);
        for (const k of NUMERICI_O_NULL) out[k] = r[k] == null ? null : n(r[k]);
        out.lead_giorni = Array.isArray(r.lead_giorni) ? (r.lead_giorni as unknown[]).map(n) : [];
        return out as unknown as ClienteMarketing;
      });
    },
  });
}

export interface CostoManuale {
  id: string;
  company_id: string;
  source: string;
  campaign_name: string | null;
  date: string;
  spend_amount: number;
  notes: string | null;
}

/** I costi inseriti a mano di un cliente nel mese. */
export function useCostiManuali(companyId: string | null, mese: string) {
  const [y, m] = mese.split("-").map(Number);
  const fine = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
  return useQuery({
    queryKey: ["clienti-marketing", "costi", companyId, mese],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db.from("campaign_costs")
        .select("id, company_id, source, campaign_name, date, spend_amount, notes")
        .eq("company_id", companyId).gte("date", mese).lte("date", fine)
        .order("date", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as CostoManuale[]).map((c) => ({ ...c, spend_amount: n(c.spend_amount) }));
    },
  });
}

export function useSalvaCostoManuale(mese: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: { id?: string; company_id: string; source: string; campaign_name: string | null; date: string; spend_amount: number; notes: string | null }) => {
      const riga = { company_id: c.company_id, source: c.source, campaign_name: c.campaign_name, date: c.date, spend_amount: c.spend_amount, notes: c.notes };
      const { error } = c.id
        ? await db.from("campaign_costs").update(riga).eq("id", c.id)
        : await db.from("campaign_costs").insert(riga);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clienti-marketing", "costi"] });
      qc.invalidateQueries({ queryKey: ["clienti-marketing", "riepilogo", mese] });
    },
  });
}

export function useEliminaCostoManuale(mese: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("campaign_costs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clienti-marketing", "costi"] });
      qc.invalidateQueries({ queryKey: ["clienti-marketing", "riepilogo", mese] });
    },
  });
}

export interface EsitoAggiornamento {
  aggiornati: string[];
  /** Meta ha risposto, ma nel mese l'account non ha speso nulla (il proxy non scrive righe vuote in cache) */
  senzaSpesa: string[];
  saltati: string[];
  errori: Array<{ nome: string; motivo: string }>;
}

/**
 * Chiede a Meta la spesa del mese di ogni cliente con un account pubblicitario
 * scelto. Il proxy la mette in cache (level=account, date_start = primo del
 * mese) e admin_clienti_marketing_riepilogo la legge da lì: così la spesa
 * resta anche quando Meta è lento o giù.
 */
export function useAggiornaSpesaMeta(mese: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clienti: ClienteMarketing[]): Promise<EsitoAggiornamento> => {
      const oggi = new Date();
      const esito: EsitoAggiornamento = { aggiornati: [], senzaSpesa: [], saltati: [], errori: [] };
      const daFare = clienti.filter((c) => c.stato === "attivo");
      // Uno alla volta: Meta ha limiti per token, e il token è lo stesso per tutti.
      for (const c of daFare) {
        if (!c.meta_integration_id || !c.meta_account_id || c.meta_stato !== "connected") { esito.saltati.push(c.cliente_nome); continue; }
        const { data, error } = await supabase.functions.invoke("meta-api-proxy", {
          body: {
            action: "get-campaign-insights",
            company_id: c.company_id,
            integration_id: c.meta_integration_id,
            ad_account_id: c.meta_account_id,
            date_start: mese,
            date_end: fineMeseOOggi(mese, oggi),
            level: "account",
            time_increment: "all_days",
          },
        });
        const r = data as { error?: string; insights?: unknown[] } | null;
        if (error || r?.error) esito.errori.push({ nome: c.cliente_nome, motivo: r?.error ?? (error as Error)?.message ?? "errore" });
        else if (Array.isArray(r?.insights) && r.insights.length === 0) esito.senzaSpesa.push(c.cliente_nome);
        else esito.aggiornati.push(c.cliente_nome);
      }
      return esito;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["clienti-marketing", "riepilogo", mese] }),
  });
}
