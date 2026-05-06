import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Shared authentication middleware for edge functions.
 * Validates JWT and optionally checks user roles.
 */

export interface AuthResult {
  userId: string;
  // Edge functions use a service-role client with dynamic RPC/table shapes.
  // Keeping this permissive avoids false Deno type failures on generated DB-less clients.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any;
}

export interface CompanyAccessResult {
  companyId: string;
  profileCompanyId: string | null;
  roles: string[];
  isSuperAdmin: boolean;
}

/**
 * Validates the Authorization header and returns the authenticated user ID
 * and a service-role Supabase client.
 * Throws a Response (401) if authentication fails.
 */
export async function requireAuth(
  req: Request,
  corsHeaders: Record<string, string>
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized: missing or invalid Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = authHeader.replace("Bearer ", "");

  // Try getClaims first (fast, no network call)
  const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  let userId: string | null = null;

  try {
    const { data, error } = await (supabaseAnon.auth as any).getClaims(token);
    if (!error && data?.claims?.sub) {
      userId = data.claims.sub;
    }
  } catch {
    // getClaims not available, fall through to getUser
  }

  // Fallback to getUser if getClaims failed
  if (!userId) {
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser();
    if (userError || !user) {
      throw new Response(
        JSON.stringify({ error: "Unauthorized: invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    userId = user.id;
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { userId, supabaseAdmin };
}

/**
 * Checks that the authenticated user has one of the allowed roles.
 * Returns the matched role string.
 * Throws a Response (403) if no matching role is found.
 */
export async function requireRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  userId: string,
  allowedRoles: string[],
  corsHeaders: Record<string, string>
): Promise<string> {
  const { data: userRoles, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error || !userRoles || userRoles.length === 0) {
    throw new Response(
      JSON.stringify({ error: "Forbidden: user has no roles" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const roleNames = userRoles.map((r: any) => r.role);
  const matchedRole = allowedRoles.find((r) => roleNames.includes(r));

  if (!matchedRole) {
    throw new Response(
      JSON.stringify({ error: "Forbidden: insufficient permissions" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return matchedRole;
}

/**
 * Verifies that the authenticated user can operate inside a company scope.
 *
 * Edge functions often need a service-role client for privileged RPCs. This
 * helper restores the missing tenant boundary before those RPCs are called:
 * - super_admin can access every company;
 * - primary profile company is accepted;
 * - multi_company_access grants are accepted;
 * - optional role allow-list is enforced after tenant membership.
 */
export async function requireCompanyAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  userId: string,
  companyId: string,
  corsHeaders: Record<string, string>,
  options?: { allowedRoles?: string[] },
): Promise<CompanyAccessResult> {
  if (!companyId || typeof companyId !== "string") {
    throw new Response(
      JSON.stringify({ error: "Forbidden: company scope required" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const [{ data: profile, error: profileError }, { data: userRoles, error: rolesError }] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId),
    ]);

  if (profileError || rolesError) {
    throw new Response(
      JSON.stringify({ error: "Forbidden: unable to verify tenant access" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const roles = ((userRoles ?? []) as Array<{ role: string }>).map((r) => r.role);
  const isSuperAdmin = roles.includes("super_admin");

  if (options?.allowedRoles?.length) {
    const hasAllowedRole = options.allowedRoles.some((role) => roles.includes(role));
    if (!hasAllowedRole && !isSuperAdmin) {
      throw new Response(
        JSON.stringify({ error: "Forbidden: insufficient permissions for this action" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  const profileCompanyId = (profile as { company_id?: string | null } | null)?.company_id ?? null;
  if (isSuperAdmin || profileCompanyId === companyId) {
    return { companyId, profileCompanyId, roles, isSuperAdmin };
  }

  const { data: multiCompanyAccess, error: accessError } = await supabaseAdmin
    .from("multi_company_access")
    .select("id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (accessError || !multiCompanyAccess) {
    throw new Response(
      JSON.stringify({ error: "Forbidden: tenant access denied" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return { companyId, profileCompanyId, roles, isSuperAdmin };
}

/**
 * Allows cron/internal edge functions to run only when the caller provides
 * the configured internal secret. Use for verify_jwt=false scheduled jobs.
 */
export function requireInternalSecret(
  req: Request,
  corsHeaders: Record<string, string>,
): void {
  if (!isInternalRequest(req)) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized: internal secret required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}

export function isInternalRequest(req: Request): boolean {
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  if (!cronSecret) return false;

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : "";
  const providedValues = [
    req.headers.get("x-internal-cron-secret") ??
      req.headers.get("x-cron-secret") ??
      "",
    bearerToken,
  ].filter(Boolean);

  return providedValues.some((provided) => provided === cronSecret);
}
