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
 * Normalizza un'email per confronto case-insensitive (tollerante a whitespace).
 */
function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Allowlist email super_admin — defense-in-depth lato server.
 *
 * Mirror di `src/config/superAdmin.ts`: anche se un utente ha
 * `role = super_admin` in `user_roles` (seed errato, migrazione o DB
 * compromesso), SOLO le email in `SUPER_ADMIN_EMAIL_ALLOWLIST` possono
 * esercitare privilegi super_admin. È l'ULTIMA parola per la revoca: togliere
 * l'email qui blocca l'utente anche se la riga `user_roles` sopravvive.
 *
 * Usa la stessa env var e lo stesso default delle funzioni referral
 * (create-referral-partner / link-referral-partner) per coerenza.
 */
export function isSuperAdminEmailAllowed(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const configured = Deno.env.get("SUPER_ADMIN_EMAIL_ALLOWLIST") || "flo.andriciuc@gmail.com";
  return configured
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean)
    .includes(normalized);
}

/**
 * Risolve l'email (auth.users) dell'utente tramite il client service-role.
 * Ritorna null se non recuperabile — il chiamante DEVE trattare null come
 * "non in allowlist" (fail-closed).
 */
export async function resolveUserEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    return data.user.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Checks that the authenticated user has one of the allowed roles.
 * Returns the matched role string.
 * Throws a Response (403) if no matching role is found.
 *
 * Defense-in-depth: il ruolo `super_admin` è riconosciuto SOLO se l'email del
 * chiamante è nell'allowlist (vedi `isSuperAdminEmailAllowed`). Un super_admin
 * non in allowlist conserva gli altri eventuali ruoli ma perde i privilegi
 * super_admin, coerentemente con `src/config/superAdmin.ts`.
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

  let roleNames = userRoles.map((r: any) => r.role);

  // Defense-in-depth: "spegni" super_admin se l'email del chiamante non è
  // nell'allowlist. L'utente conserva gli altri ruoli (es. company_admin) ma
  // non può esercitare privilegi super_admin, anche se la riga `user_roles`
  // sopravvive. L'email viene risolta solo quando il ruolo è presente, così i
  // chiamanti non-super-admin non pagano la chiamata extra.
  if (roleNames.includes("super_admin")) {
    const callerEmail = await resolveUserEmail(supabaseAdmin, userId);
    if (!isSuperAdminEmailAllowed(callerEmail)) {
      roleNames = roleNames.filter((r: string) => r !== "super_admin");
    }
  }

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
 * L'utente può operare su questa azienda?
 *
 * Vale l'azienda scritta nel suo profilo, oppure un accesso multi-azienda
 * ancora valido. Confrontare solo con il profilo — come facevano parecchie
 * funzioni — nega l'accesso a chi è entrato in una seconda azienda dal
 * selettore, che è esattamente ciò per cui l'accesso multi-azienda esiste.
 *
 * Lo stato e la scadenza si controllano qui: una riga revocata o scaduta non
 * dà accesso. Prima bastava che la riga esistesse.
 */
export async function aziendaAccessibile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  userId: string,
  companyId: string,
): Promise<boolean> {
  if (!companyId) return false;

  const { data: profile } = await supabaseAdmin
    .from("profiles").select("company_id").eq("id", userId).maybeSingle();
  if ((profile as { company_id?: string | null } | null)?.company_id === companyId) return true;

  const { data: accesso } = await supabaseAdmin
    .from("multi_company_access")
    .select("expires_at")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .eq("status", "active")
    .maybeSingle();
  if (!accesso) return false;

  const scadenza = (accesso as { expires_at?: string | null }).expires_at;
  return scadenza === null || scadenza === undefined || new Date(scadenza) > new Date();
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

  const haAccesso = await aziendaAccessibile(supabaseAdmin, userId, companyId);

  if (!haAccesso) {
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
