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
}

export type ToolResult<T = unknown> =
  | { ok: true; data: T; user_message?: string }
  | { ok: false; error: string; user_message: string };

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requires_grants: string[];
  handler: (ctx: ToolCtx, args: Record<string, unknown>) => Promise<ToolResult>;
}

export function errResult(error: string, userMessage: string): ToolResult<never> {
  return { ok: false, error, user_message: userMessage };
}

export function okResult<T>(data: T, userMessage?: string): ToolResult<T> {
  return { ok: true, data, user_message: userMessage };
}
