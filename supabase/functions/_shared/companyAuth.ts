import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Verify that the authenticated user belongs to the given company.
 * Returns the user ID if authorized, throws otherwise.
 */
export async function verifyCompanyAccess(
  supabase: SupabaseClient,
  userId: string,
  companyId: string
): Promise<void> {
  // Check profiles table first (primary company)
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .single();

  if (profile?.company_id === companyId) return;

  // Check multi_company_access
  const { data: mca } = await supabase
    .from("multi_company_access")
    .select("id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (mca) return;

  // Check active impersonations (super admin)
  const { data: imp } = await supabase
    .from("active_impersonations")
    .select("id")
    .eq("admin_user_id", userId)
    .eq("target_company_id", companyId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (imp) return;

  throw new Error("Non autorizzato: accesso negato a questa azienda");
}
