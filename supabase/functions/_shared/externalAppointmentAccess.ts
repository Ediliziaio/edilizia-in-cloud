type Result = { data: unknown; error: unknown };
type AppointmentFilter = {
  eq: (column: string, value: string) => AppointmentFilter;
  maybeSingle: () => PromiseLike<Result>;
};
type ScopedClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<Result>;
  from: (table: "appointments") => { select: (columns: string) => AppointmentFilter };
};
type PermissionClient = Pick<ScopedClient, "rpc">;
function isPermissionClient(value: unknown): value is PermissionClient {
  return !!value && typeof value === "object" && typeof (value as { rpc?: unknown }).rpc === "function";
}
function isScopedClient(value: unknown): value is ScopedClient {
  return isPermissionClient(value) && typeof (value as { from?: unknown }).from === "function";
}

export async function canSyncExternalCalendar(caller: unknown, companyId: string): Promise<boolean> {
  if (!isPermissionClient(caller) || typeof companyId !== "string" || !companyId) return false;
  const readonly = await caller.rpc("utente_sola_lettura", { p_company_id: companyId });
  const external = await caller.rpc("utente_e_cliente_esterno");
  return !readonly.error && readonly.data === false && !external.error && external.data === false;
}

/** Le credenziali del provider bypassano la RLS: prima di usarle verifica
 * identità, sola lettura e visibilità con il JWT del chiamante. I job interni
 * autenticati non passano da questo controllo (anche dopo un DELETE fisico). */
export async function canMutateExternalAppointment(
  caller: unknown,
  admin: unknown,
  userId: string,
  companyId: string,
  appointmentId: string,
  action: string,
): Promise<boolean> {
  if (!isScopedClient(caller) || !isPermissionClient(admin) || !userId || !companyId || typeof appointmentId !== "string" || !appointmentId) return false;
  if (!(await canSyncExternalCalendar(caller, companyId))) return false;
  const visible = await caller.from("appointments").select("id, created_by, status")
    .eq("id", appointmentId).eq("company_id", companyId).maybeSingle();
  if (visible.error || !visible.data || typeof visible.data !== "object") return false;
  const appointment = visible.data as { id?: string; created_by?: string | null; status?: string | null };
  if (appointment.id !== appointmentId) return false;
  const cancelled = appointment.status === "annullato" || appointment.status === "cancelled";
  // Prima si annulla nel CRM: un errore di salvataggio non deve cancellare
  // solo Google/Apple, facendo poi annullare anche il record dal reconcile.
  if (action === "delete-event" ? !cancelled : cancelled) return false;
  if (appointment.created_by === userId) return true;
  for (const permission of ["can_view_marketing_appointments", "can_edit_orders"]) {
    const result = await admin.rpc("has_permission_for_company", {
      _user_id: userId, _company_id: companyId, _permission: permission,
    });
    if (result.error) return false;
    if (result.data === true) return true;
  }
  return false;
}
