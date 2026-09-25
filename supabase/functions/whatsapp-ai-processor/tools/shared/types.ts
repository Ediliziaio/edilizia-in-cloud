// MP02 — Tipi condivisi per i tool.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ToolCtx {
  supabase: SupabaseClient;
  company_id: string;
  user_id: string | null;
  employee_id: string | null;
  phone: string;
  role_grants: string[];
  locale: "it" | "en";
  waNumberId: string;
  sessionId: string | null;
  kind: "operaio" | "titolare" | "admin" | "unknown";
  /** Il file arrivato con questo messaggio, già salvato nel bucket (foto del DDT, foto di cantiere, vocale). */
  mediaCorrente?: { storagePath: string; url: string; tipo: string } | null;
}

export type ToolResult<T = unknown> =
  | { ok: true; data: T; user_message?: string }
  | { ok: false; error: string; user_message: string };

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requires_grants: string[];
  /** Enforcement lato codice (MP-AIE allineamento risk-routing): se true il
   *  tool NON esegue su richiesta "fredda" — solo dopo un gesto esplicito
   *  dell'utente in QUESTO turno (bottone interattivo non-negativo o testo
   *  affermativo). Prima la conferma era affidata SOLO al prompt. */
  requires_confirmation?: boolean;
  handler: (ctx: ToolCtx, args: Record<string, unknown>) => Promise<ToolResult>;
}

export function errResult(error: string, userMessage: string): ToolResult<never> {
  return { ok: false, error, user_message: userMessage };
}

export function okResult<T>(data: T, userMessage?: string): ToolResult<T> {
  return { ok: true, data, user_message: userMessage };
}
