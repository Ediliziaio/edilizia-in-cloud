// Helper condivisi tra index.ts (server + tool scritti a mano) e silvioTools.ts
// (il ponte verso le RPC silvio_tool_*). Estratti da index.ts il 26/09/2026.
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface KeyCtx {
  id: string;
  company_id: string | null;
  name: string;
  scopes: string[];
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  /** Chi ha emesso la chiave: le scritture che richiedono un autore
   *  (es. p_user_id delle RPC) vengono attribuite a lui. */
  created_by: string;
}

export interface ToolDef {
  name: string;
  description: string;
  scope: string | null; // null = nessuno scope richiesto
  inputSchema: Record<string, unknown>;
  handler: (admin: SupabaseClient, ctx: KeyCtx, args: Record<string, unknown>) => Promise<unknown>;
}

/** Errore "di dominio" da mostrare all'AI (non un bug del server). */
export class ToolError extends Error {}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hasScope(ctx: KeyCtx, scope: string | null): boolean {
  if (!scope) return true;
  const scopes = ctx.scopes ?? [];
  if (scopes.includes("*")) return true;
  if (scopes.includes(scope)) return true;
  // "contacts:write" implica anche "contacts:read"
  const [res, action] = scope.split(":");
  return action === "read" && scopes.includes(`${res}:write`);
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
export function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
export function intLimit(v: unknown, def: number, max: number): number {
  const n = typeof v === "number" ? Math.floor(v) : def;
  return Math.min(Math.max(n > 0 ? n : def, 1), max);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Risolve l'azienda su cui operare: chiave scoped → la sua; piattaforma → arg. */
export async function resolveCompany(
  admin: SupabaseClient,
  ctx: KeyCtx,
  args: Record<string, unknown>,
): Promise<{ id: string; name: string }> {
  if (ctx.company_id) {
    const { data } = await admin.from("companies").select("id, name").eq("id", ctx.company_id).maybeSingle();
    if (!data) throw new ToolError("Azienda della chiave non trovata");
    return data as { id: string; name: string };
  }
  const raw = str(args.company);
  if (!raw) throw new ToolError('Parametro "company" obbligatorio per le chiavi piattaforma (nome o UUID azienda). Usa lista_aziende per scoprirle.');
  if (UUID_RE.test(raw)) {
    const { data } = await admin.from("companies").select("id, name").eq("id", raw).maybeSingle();
    if (!data) throw new ToolError(`Nessuna azienda con id ${raw}`);
    return data as { id: string; name: string };
  }
  const { data: matches } = await admin.from("companies").select("id, name").ilike("name", `%${raw}%`).limit(5);
  if (!matches || matches.length === 0) throw new ToolError(`Nessuna azienda che contenga "${raw}" nel nome`);
  if (matches.length > 1) {
    throw new ToolError(`Più aziende corrispondono a "${raw}": ${matches.map((m) => m.name).join(", ")}. Specifica meglio o usa l'UUID.`);
  }
  return matches[0] as { id: string; name: string };
}
