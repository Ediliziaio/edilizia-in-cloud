/**
 * MP-EMAIL-AI-01 — Hooks React per chiamare le edge function della cascata.
 *
 *   useGenerateAiDraft  → chiama L4 (Sonnet bozza on-demand)
 *   useReclassifyEmail  → chiama RPC reclassify_email_manuale (feedback loop)
 *   useL1Backfill       → chiama email-ai-l1-classify mode=backfill (admin only)
 */

import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { EmailCategoria, EntitaTipo } from "./types";

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// ─── L4 — Genera bozza risposta (MP-EMAIL-AI-02) ──────────────────────────────

export interface DraftVariante {
  etichetta: string; // "Secca" | "Diplomatica" | "Operativa" | ...
  corpo: string;
}

export interface DraftResponse {
  ok: boolean;
  email_id: string;
  categoria: string;
  playbook_used?: string;
  /** Oggetto della risposta (null se no_reply). */
  oggetto: string | null;
  /** 1-2 varianti editabili. Vuoto se no_reply. */
  varianti: DraftVariante[];
  /** Descrizioni dei dati da completare prima dell'invio (placeholder [DA VERIFICARE]). */
  dati_mancanti: string[];
  /** true per categorie che non richiedono risposta (newsletter/social/notifica/spam). */
  no_reply?: boolean;
  message?: string;
  entity_context_used?: boolean;
  thread_context_used?: boolean;
  elapsed_ms?: number;
  model?: string;
  anthropic_usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export function useGenerateAiDraft() {
  return useMutation({
    mutationFn: async (email_id: string): Promise<DraftResponse> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Non autenticato");

      const res = await fetch(`${FN_BASE}/email-ai-l4-draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json as DraftResponse;
    },
    onError: (e) => {
      toast.error("Errore generazione bozza", {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });
}

// ─── Feedback loop — sposta email in altra categoria + aggiorna mittente ─────

export interface ReclassifyInput {
  email_id: string;
  categoria: EmailCategoria;
  entita_tipo?: EntitaTipo | null;
  entita_id?: string | null;
}

export function useReclassifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReclassifyInput) => {
      const { error } = await (supabase.rpc as any)("reclassify_email_manuale", {
        p_email_id: input.email_id,
        p_categoria: input.categoria,
        p_entita_tipo: input.entita_tipo ?? null,
        p_entita_id: input.entita_id ?? null,
      });
      if (error) throw error;
      return { ok: true };
    },
    onSuccess: () => {
      // Invalida liste email + thread
      queryClient.invalidateQueries({ queryKey: ["email-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["email-threads"] });
      queryClient.invalidateQueries({ queryKey: ["v_email_inbox_classified"] });
      toast.success("Email riclassificata. Il mittente è stato memorizzato.");
    },
    onError: (e) => {
      toast.error("Errore riclassificazione", {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });
}

// ─── MP-EMAIL-AI-03 — Feedback loop: 5 eventi di apprendimento ────────────────

export type EventoCorrezione = "sposta" | "associa" | "conferma" | "spam" | "annulla";

export interface RegistraCorrezioneInput {
  email_id: string;
  evento: EventoCorrezione;
  categoria?: EmailCategoria | null;
  entita_tipo?: EntitaTipo | null;
  entita_id?: string | null;
}

/**
 * Registra una correzione manuale (RPC registra_correzione_email).
 * Scrive audit immutabile + aggiorna mittenti_noti + email. Idempotente.
 * Effetto: la quota gestita da L1 sale nel tempo → costo medio scende.
 */
export function useRegistraCorrezione() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistraCorrezioneInput) => {
      const { data, error } = await (supabase.rpc as any)("registra_correzione_email", {
        p_email_id: input.email_id,
        p_evento: input.evento,
        p_categoria: input.categoria ?? null,
        p_entita_tipo: input.entita_tipo ?? null,
        p_entita_id: input.entita_id ?? null,
      });
      if (error) throw error;
      return data as { ok: boolean; evento: string; mittente: string };
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["email-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["email-threads"] });
      queryClient.invalidateQueries({ queryKey: ["email-learning-dashboard"] });
      const msg: Record<EventoCorrezione, string> = {
        sposta: "Categoria aggiornata. Il mittente è stato memorizzato.",
        associa: "Entità collegata. Memorizzato per le prossime email.",
        conferma: "Classificazione confermata.",
        spam: "Mittente messo in blacklist spam.",
        annulla: "Etichetta rimossa. Email rimessa tra quelle da rivedere.",
      };
      toast.success(msg[vars.evento] ?? "Correzione registrata.");
    },
    onError: (e) => {
      toast.error("Errore correzione", { description: e instanceof Error ? e.message : String(e) });
    },
  });
}

// ─── MP-EMAIL-AI-03 — Dashboard apprendimento (north star L1%) ────────────────

export interface LearningDashboard {
  north_star_l1_perc: number;
  totale: number;
  da_regola: number;
  da_haiku: number;
  da_manuale: number;
  da_rivedere: number;
  serie: Array<{ giorno: string; totale: number; da_regola: number; da_haiku: number; da_manuale: number }>;
  mittenti_appresi: number;
  blacklist_count: number;
}

export function useEmailLearningDashboard(days = 30) {
  return useQuery({
    queryKey: ["email-learning-dashboard", days],
    queryFn: async (): Promise<LearningDashboard> => {
      const { data, error } = await (supabase.rpc as any)("email_learning_dashboard", { p_days: days });
      if (error) throw error;
      return (data ?? {}) as LearningDashboard;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Backfill L1 — admin only ─────────────────────────────────────────────────

export interface L1BackfillResult {
  processed: number;
  l1_hits: number;
  l1_misses: number;
  perc_l1: number;
  dry_run?: boolean;
}

export function useL1Backfill() {
  return useMutation({
    mutationFn: async (opts: { company_id?: string; limit?: number; dry_run?: boolean }): Promise<L1BackfillResult> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Non autenticato");

      const res = await fetch(`${FN_BASE}/email-ai-l1-classify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode: "backfill", ...opts }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json as L1BackfillResult;
    },
  });
}

// ─── MP-EMAIL-AI-05 — CRUD regole instradamento ──────────────────────────────

import type { Condizione, Azione } from "./rules-engine";

export interface EmailRegola {
  id: string;
  nome: string;
  origine: "manuale" | "auto";
  stato: "attiva" | "in_approvazione" | "disattivata" | "rifiutata";
  priorita: number;
  combinatore: "AND" | "OR";
  condizioni: Condizione[];
  azioni: Azione[];
  match_count: number;
  ultimo_match_at: string | null;
  created_at: string;
}

export function useEmailRegole() {
  return useQuery({
    queryKey: ["email-regole"],
    queryFn: async (): Promise<EmailRegola[]> => {
      const { data, error } = await (supabase as any)
        .from("email_regole")
        .select("*")
        .order("priorita", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EmailRegola[];
    },
    staleTime: 60 * 1000,
  });
}

export function useSaveEmailRegola() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (regola: Partial<EmailRegola> & { company_id?: string }) => {
      const payload = {
        nome: regola.nome,
        origine: regola.origine ?? "manuale",
        stato: regola.stato ?? "attiva",
        priorita: regola.priorita ?? 100,
        combinatore: regola.combinatore ?? "AND",
        condizioni: regola.condizioni ?? [],
        azioni: regola.azioni ?? [],
      };
      if (regola.id) {
        const { error } = await (supabase as any).from("email_regole").update(payload).eq("id", regola.id);
        if (error) throw error;
        return { id: regola.id };
      }
      const { data, error } = await (supabase as any).from("email_regole").insert(payload).select("id").single();
      if (error) throw error;
      return { id: data.id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-regole"] });
      toast.success("Regola salvata.");
    },
    onError: (e) => toast.error("Errore salvataggio regola", { description: e instanceof Error ? e.message : String(e) }),
  });
}

export function useDeleteEmailRegola() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("email_regole").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-regole"] });
      toast.success("Regola eliminata.");
    },
  });
}

export function useToggleEmailRegola() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: EmailRegola["stato"] }) => {
      const { error } = await (supabase as any).from("email_regole").update({ stato }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-regole"] }),
  });
}

// ─── L3 batch trigger — admin only ────────────────────────────────────────────

export interface L3BatchResult {
  batched: number;
  classified: number;
  da_rivedere: number;
  processed?: number;
  elapsed_ms?: number;
  anthropic_usage?: Record<string, number>;
}

export function useL3BatchClassify() {
  return useMutation({
    mutationFn: async (opts: { company_id?: string; limit?: number; dry_run?: boolean }): Promise<L3BatchResult> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Non autenticato");

      const res = await fetch(`${FN_BASE}/email-ai-l3-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode: "live", ...opts }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json as L3BatchResult;
    },
  });
}
