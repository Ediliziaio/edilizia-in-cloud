// ============================================================================
// _shared/effectiveCompany.ts
// ----------------------------------------------------------------------------
// Helper per risolvere la "company effettiva" di un utente in edge functions
// che girano con SERVICE_ROLE_KEY (bypass RLS) — quindi devono replicare
// manualmente la logica del helper SQL `public.get_effective_company_id()`.
//
// Logica:
//   1. Se esiste una row in `active_impersonations` con admin_user_id = userId
//      e expires_at > now() → torna target_company_id (la più recente).
//   2. Altrimenti, torna profiles.company_id dell'utente.
//   3. Se nessuno dei due → torna null.
//
// Uso tipico:
//   const supabaseAdmin = createClient(url, serviceRoleKey);
//   const companyId = await resolveEffectiveCompanyId(supabaseAdmin, userId);
//   if (!companyId) return 403;
//   // ...lavora con companyId come "azienda corrente".
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AdminClient = ReturnType<typeof createClient>;

/**
 * Risolve la company_id "effettiva" di userId considerando impersonation attiva.
 * Ritorna null se l'utente non ha né profilo con company_id né impersonation.
 *
 * NOTA: questa funzione richiede un client creato con SERVICE_ROLE_KEY (bypass
 * RLS), perché `active_impersonations` è protetta da RLS per-super_admin.
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

  // 2. Fallback: company del profilo
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();

  return (profile as { company_id?: string | null } | null)?.company_id ?? null;
}

/**
 * Verifica che `targetCompanyId` sia accessibile dall'utente corrente:
 *   - matcha la company effettiva, OPPURE
 *   - l'utente ha accesso multi-company, OPPURE
 *   - l'utente ha ruolo super_admin (accesso globale).
 *
 * Ritorna true se ok, false se accesso negato.
 */
export async function canAccessCompany(
  supabaseAdmin: AdminClient,
  userId: string,
  targetCompanyId: string,
): Promise<boolean> {
  // Bypass super_admin
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const isSuperAdmin = (roles ?? []).some(
    (r: { role?: string }) => r.role === "super_admin",
  );
  if (isSuperAdmin) return true;

  // Match con company effettiva (include impersonation)
  const effective = await resolveEffectiveCompanyId(supabaseAdmin, userId);
  if (effective === targetCompanyId) return true;

  // Multi-company users and platform roles can switch the active tenant in the
  // frontend without creating an active_impersonations row. Edge functions run
  // with service role, so we must explicitly mirror that access model here.
  const { data: multiCompanyAccess } = await supabaseAdmin
    .from("multi_company_access")
    .select("company_id")
    .eq("user_id", userId)
    .eq("company_id", targetCompanyId)
    .maybeSingle();

  return !!multiCompanyAccess;
}
