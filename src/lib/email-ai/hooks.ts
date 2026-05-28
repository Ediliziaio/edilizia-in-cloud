/**
 * MP-EMAIL-AI-01 — Hooks React per chiamare le edge function della cascata.
 *
 *   useGenerateAiDraft  → chiama L4 (Sonnet bozza on-demand)
 *   useReclassifyEmail  → chiama RPC reclassify_email_manuale (feedback loop)
 *   useL1Backfill       → chiama email-ai-l1-classify mode=backfill (admin only)
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { EmailCategoria, EntitaTipo } from "./types";

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// ─── L4 — Genera bozza risposta ───────────────────────────────────────────────

export interface DraftResponse {
  ok: boolean;
  email_id: string;
  categoria: string;
  draft_subject: string;
  draft_body: string;
  playbook_used: string;
  entity_context_used: boolean;
  thread_context_used: boolean;
  elapsed_ms: number;
  model: string;
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
