import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Shared authentication middleware for edge functions.
 * Validates JWT and optionally checks user roles.
 */

export interface AuthResult {
  userId: string;
  supabaseAdmin: ReturnType<typeof createClient>;
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
  supabaseAdmin: ReturnType<typeof createClient>,
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
