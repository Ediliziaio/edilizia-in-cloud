// ============================================================================
// _shared/effectiveCompany.ts
// ----------------------------------------------------------------------------
// Helper per risolvere la "company effettiva" di un utente in edge functions
// che girano con SERVICE_ROLE_KEY (bypass RLS) — quindi devono replicare
// manualmente la logica del helper SQL `public.get_effective_company_id()`.
//
// Logica (allineata al SQL get_effective_company_id):
//   1. Impersonation attiva (active_impersonations, super_admin) → target_company_id.
//   2. Selezione multi-azienda del frontend (active_company_selection), SOLO se
//      ancora accessibile (primaria o multi_company_access attiva).
//   3. Altrimenti profiles.company_id (azienda primaria).
//
// Uso tipico:
//   const supabaseAdmin = createClient(url, serviceRoleKey);
//   const companyId = await resolveEffectiveCompanyId(supabaseAdmin, userId);
//   if (!companyId) return 403;
// ============================================================================
// deno-lint-ignore no-explicit-any
type AdminClient = any;

async function getPrimaryCompanyId(
  supabaseAdmin: AdminClient,
  userId: string,
): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  return (profile as { company_id?: string | null } | null)?.company_id ?? null;
}

/** true se l'utente ha un accesso multi-azienda ATTIVO e non scaduto a targetCompanyId. */
async function hasActiveMultiCompanyAccess(
  supabaseAdmin: AdminClient,
  userId: string,
  targetCompanyId: string,
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from("multi_company_access")
    .select("company_id, status, expires_at")
    .eq("user_id", userId)
    .eq("company_id", targetCompanyId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return false;
  const exp = (data as { expires_at?: string | null }).expires_at;
  return !exp || exp > nowIso;
}

/** true se l'utente è membro attivo di uno studio commercialista con delega attiva sull'azienda. */
async function hasAccountantAccess(
  supabaseAdmin: AdminClient,
  userId: string,
  targetCompanyId: string,
): Promise<boolean> {
  const { data: firms } = await supabaseAdmin
    .from("accountant_firm_members")
    .select("firm_id")
    .eq("user_id", userId)
    .eq("status", "active");
  const firmIds = (firms ?? []).map((r: { firm_id: string }) => r.firm_id);
  if (firmIds.length === 0) return false;
  const { data: access } = await supabaseAdmin
    .from("accountant_company_access")
    .select("company_id")
    .eq("company_id", targetCompanyId)
    .eq("status", "active")
    .in("firm_id", firmIds)
    .maybeSingle();
  return !!access;
}

/**
 * Risolve la company_id "effettiva" di userId considerando impersonation attiva e
 * selezione multi-azienda. Ritorna null se l'utente non ha alcuna company.
 * Richiede un client SERVICE_ROLE (bypass RLS).
 */
export async function resolveEffectiveCompanyId(
  supabaseAdmin: AdminClient,
  userId: string,
): Promise<string | null> {
  // 1. Impersonation attiva (più recente, non scaduta)
  const { data: imp } = await supabaseAdmin
    .from("active_impersonations")
    .select("target_company_id, created_at")
    .eq("admin_user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (imp && (imp as { target_company_id?: string }).target_company_id) {
    return (imp as { target_company_id: string }).target_company_id;
  }

  const primaryId = await getPrimaryCompanyId(supabaseAdmin, userId);

  // 2. Selezione multi-azienda del frontend, SOLO se ancora accessibile.
  const { data: sel } = await supabaseAdmin
    .from("active_company_selection")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  const selectedId = (sel as { company_id?: string } | null)?.company_id ?? null;
  if (selectedId && selectedId !== primaryId) {
    if (await hasActiveMultiCompanyAccess(supabaseAdmin, userId, selectedId)) {
      return selectedId;
    }
  } else if (selectedId && selectedId === primaryId) {
    return primaryId;
  }

  // 3. Fallback: company primaria del profilo
  return primaryId;
}

/**
 * Verifica che `targetCompanyId` sia accessibile dall'utente corrente:
 *   - super_admin (accesso globale), OPPURE
 *   - è la sua azienda primaria, OPPURE
 *   - ha un'impersonation attiva su quella company, OPPURE
 *   - ha un accesso multi-azienda ATTIVO e non scaduto, OPPURE
 *   - è un commercialista con delega attiva su quella company.
 *
 * Ritorna true se ok, false se accesso negato.
 */
export async function canAccessCompany(
  supabaseAdmin: AdminClient,
  userId: string,
  targetCompanyId: string,
): Promise<boolean> {
  if (!targetCompanyId) return false;

  // super_admin
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if ((roles ?? []).some((r: { role?: string }) => r.role === "super_admin")) return true;

  // azienda primaria
  const primaryId = await getPrimaryCompanyId(supabaseAdmin, userId);
  if (primaryId === targetCompanyId) return true;

  // impersonation attiva sulla company target
  const { data: imp } = await supabaseAdmin
    .from("active_impersonations")
    .select("target_company_id")
    .eq("admin_user_id", userId)
    .eq("target_company_id", targetCompanyId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (imp) return true;

  // accesso multi-azienda attivo
  if (await hasActiveMultiCompanyAccess(supabaseAdmin, userId, targetCompanyId)) return true;

  // delega commercialista
  if (await hasAccountantAccess(supabaseAdmin, userId, targetCompanyId)) return true;

  return false;
}
