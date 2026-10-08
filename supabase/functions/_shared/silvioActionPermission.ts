/** Current roles are resolved by the actor-scoped DB function, never the worker identity. */
export function verifiedActionActorRoles(data: unknown, error: unknown, allowedRoles: string[]): string[] {
  if (error || !Array.isArray(data) || data.length === 0 ||
      !data.every(role => typeof role === "string" && role.trim().length > 0) ||
      !data.some(role => allowedRoles.includes(role))) {
    throw new Error("Non posso autorizzare questa azione: verifica accesso all’azienda e permessi attuali dell’utente.");
  }
  return [...new Set(data as string[])];
}

/** Legacy dispatch does not pass through the registry's granular permission gate. */
export function legacyActionPermissionError(action: string, permissions: Record<string, unknown> | null): string | null {
  const required: Record<string, string[]> = {
    send_overdue_reminder: ["can_view_orders", "can_view_order_amounts", "can_manage_payments"],
    send_quote_followup: ["can_view_preventivi", "can_edit_preventivi"],
    create_quote_draft: ["can_view_preventivi", "can_edit_preventivi"],
    create_purchase_order: ["can_view_warehouse", "can_edit_warehouse", "can_view_costs"],
    update_purchase_order_delay: ["can_view_warehouse", "can_edit_warehouse"],
    create_logistics_task: ["can_view_team_tasks"],
    make_voice_call_lead: ["can_view_marketing_contacts", "can_edit_marketing_contacts", "can_view_marketing_ai_agent"],
  };
  if (!required[action]) return null; // Registry-only tools keep their own gate; admin-only legacy actions are checked by role.
  if (!permissions || permissions.sola_lettura !== false ||
      required[action].some(key => permissions[key] !== true)) {
    return "Permessi insufficienti per questa operazione. Chiedi all’amministratore di verificare i permessi dell’area.";
  }
  // These legacy handlers cannot safely enforce per-row scopes on every linked
  // entity yet. Keep the normal app flow available; never broaden AI access.
  if (permissions.only_assigned !== false || permissions.only_my_warehouse !== false) {
    return "Questa azione automatizzata non supporta ancora il tuo accesso limitato alle singole commesse. Usa il normale flusso dell’app.";
  }
  return null;
}

/** Never execute a legacy action on a guessed permission after an RPC error. */
export function verifiedActionPermission(data: unknown, error: unknown): Record<string, unknown> & {
  mode: "disabled" | "propose" | "require_confirmation" | "require_strong_confirmation" | "auto_execute";
  allowed_roles: string[];
} {
  const failure = () => new Error("Non riesco a verificare i permessi dell'azione. Nessuna azione eseguita: riprova tra poco.");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) throw failure();
  const raw = data as Record<string, unknown>;
  const modes = ["disabled", "propose", "require_confirmation", "require_strong_confirmation", "auto_execute"];
  if (typeof raw.mode !== "string" || !modes.includes(raw.mode) ||
      !Array.isArray(raw.allowed_roles) || !raw.allowed_roles.every((role) => typeof role === "string")) throw failure();
  if (!["green", "yellow", "red"].includes(String(raw.risk_level)) ||
      typeof raw.requires_company_admin !== "boolean" ||
      typeof raw.requires_strong_confirmation !== "boolean" ||
      typeof raw.daily_limit_reached !== "boolean") throw failure();
  for (const field of ["daily_executions", "max_daily_executions"]) {
    const value = raw[field];
    if (field === "max_daily_executions" && value === null) continue;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw failure();
  }
  const verified = raw as ReturnType<typeof verifiedActionPermission>;
  return {
    ...verified,
    daily_limit_reached: raw.daily_limit_reached ||
      (typeof raw.max_daily_executions === "number" && Number(raw.daily_executions) >= raw.max_daily_executions),
  };
}
