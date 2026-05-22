/**
 * useAIFormCopilot — Feature #9 (Real-time copilot in-form)
 *
 * Hook che fornisce suggerimenti AI mentre l'utente compila un form
 * (preventivi, ordini, fatture). Pattern Copilot-style: l'utente digita,
 * dopo un debounce di 600ms l'AI suggerisce il prossimo campo probabile
 * basandosi sullo storico della company.
 *
 * STATO: scaffolding minimale e behavior-preserving. Il hook richiede:
 *   - feature_key: identifica il tipo di form (es. 'quote_builder', 'order_form')
 *   - companyId: scope tenant
 *   - currentDraft: oggetto del form corrente (parziale)
 *   - enabled: opt-in esplicito dal componente
 *
 * Quando enabled=true e currentDraft cambia, il hook:
 *   1. Debounce 600ms
 *   2. Chiama edge function 'ai-form-copilot-suggest' (opzionale, da creare)
 *      con feature_key + currentDraft → riceve suggestion {field, value, confidence}
 *   3. Espone suggestion + accept() + dismiss()
 *
 * Componenti UI possono:
 *   - mostrare suggestion in inline ghost-text (Tab per accettare)
 *   - mostrare in tooltip floating con badge confidence
 *   - mostrare in panel laterale "Suggerimenti AI"
 *
 * NB: il hook NON modifica mai il form da solo. Sempre l'utente clicca
 * accept() per applicare. Margin-alert real-time (es. "sotto 15%") può
 * usare lo stesso hook con feature_key='margin_check'.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CopilotSuggestion {
  /** Campo del form da popolare */
  field: string;
  /** Valore suggerito */
  value: string | number | boolean | null;
  /** Confidence 0-1 */
  confidence: number;
  /** Spiegazione human-readable */
  reasoning?: string;
}

export interface CopilotState {
  suggestion: CopilotSuggestion | null;
  loading: boolean;
  error: string | null;
}

export interface UseAIFormCopilotOptions {
  /** Identifica il tipo di form */
  featureKey: "quote_builder" | "order_form" | "invoice_draft" | "margin_check" | string;
  companyId: string | null;
  /** Stato corrente del form (parziale) */
  currentDraft: Record<string, unknown>;
  /** Opt-in: deve essere true per attivare */
  enabled?: boolean;
  /** Debounce in ms (default 600) */
  debounceMs?: number;
}

export function useAIFormCopilot({
  featureKey,
  companyId,
  currentDraft,
  enabled = false,
  debounceMs = 600,
}: UseAIFormCopilotOptions) {
  const [state, setState] = useState<CopilotState>({
    suggestion: null,
    loading: false,
    error: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const abortRef = useRef<AbortController | undefined>();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!enabled || !companyId) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Debounce
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((s) => ({ ...s, loading: true, error: null }));
      void supabase.functions
        .invoke("ai-form-copilot-suggest", {
          body: { feature_key: featureKey, current_draft: currentDraft },
        })
        .then(({ data, error }) => {
          if (!isMountedRef.current || controller.signal.aborted) return;
          if (error) {
            setState({ suggestion: null, loading: false, error: error.message });
            return;
          }
          const suggestion = (data as { suggestion?: CopilotSuggestion } | null)?.suggestion ?? null;
          setState({ suggestion, loading: false, error: null });
        })
        .catch((err: Error) => {
          if (!isMountedRef.current || controller.signal.aborted) return;
          // Edge function non ancora deployata → degrade silent (no error UX).
          // I componenti che usano il hook continuano a funzionare senza suggerimenti.
          setState({ suggestion: null, loading: false, error: null });
          if (typeof console !== "undefined" && import.meta.env?.DEV) {
            console.debug("[useAIFormCopilot] suggest unavailable:", err.message);
          }
        });
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, companyId, featureKey, currentDraft, debounceMs]);

  const dismiss = useCallback(() => {
    setState((s) => ({ ...s, suggestion: null }));
  }, []);

  const accept = useCallback(<T,>(applyFn: (suggestion: CopilotSuggestion) => T): T | null => {
    if (!state.suggestion) return null;
    const result = applyFn(state.suggestion);
    setState((s) => ({ ...s, suggestion: null }));
    return result;
  }, [state.suggestion]);

  return {
    ...state,
    dismiss,
    accept,
  };
}
