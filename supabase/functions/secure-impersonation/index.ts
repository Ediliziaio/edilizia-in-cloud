import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { isSuperAdminEmailAllowed } from "../_shared/auth.ts";
import { conMetriche } from "../_shared/withMetrics.ts";

Deno.serve(conMetriche("secure-impersonation", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check super_admin role
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isSuperAdmin = roles?.some((r: any) => r.role === "super_admin");
    // Defense-in-depth: oltre al ruolo in user_roles, l'email deve essere
    // nell'allowlist super_admin (vedi src/config/superAdmin.ts). Revoca =
    // rimuovere l'email dall'allowlist, anche se la riga user_roles sopravvive.
    if (!isSuperAdmin || !isSuperAdminEmailAllowed(user.email)) {
      return new Response(JSON.stringify({ error: "Forbidden: super_admin only" }), {
        status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { action, companyId, token: impersonationToken } = await req.json();
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    switch (action) {
      case "start": {
        if (!companyId) {
          return new Response(JSON.stringify({ error: "companyId required" }), {
            status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        // ── Rate limit: max 10 impersonations per hour per admin ──
        // Il conteggio DEVE stare su admin_audit_log, che è append-only:
        // contarlo su active_impersonations era inefficace, perché poche righe
        // più sotto questa stessa funzione cancella le impersonation precedenti
        // dell'admin prima di inserire la nuova — il contatore non superava mai 1.
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count: recentCount } = await supabaseAdmin
          .from("admin_audit_log")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("action", "impersonation_start")
          .gte("created_at", oneHourAgo);

        if ((recentCount ?? 0) >= 10) {
          // Il superamento va a registro: prima finiva su `audit_log`, tabella
          // inesistente, con .catch(() => {}) che ne nascondeva il fallimento.
          await supabaseAdmin.from("admin_audit_log").insert({
            user_id: user.id,
            action: "impersonation_rate_limited",
            target_type: "company",
            target_id: companyId,
            details: { company_id: companyId, count: recentCount, ip_address: clientIp },
            ip_address: clientIp,
          });
          return new Response(
            JSON.stringify({ error: "Rate limit: massimo 10 impersonazioni per ora" }),
            { status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
          );
        }

        // Verify company exists
        const { data: company, error: companyError } = await supabaseAdmin
          .from("companies")
          .select("id, name")
          .eq("id", companyId)
          .maybeSingle();

        if (companyError || !company) {
          return new Response(JSON.stringify({ error: "Company not found" }), {
            status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        // Revoke any existing impersonation for this admin
        await supabaseAdmin
          .from("active_impersonations")
          .delete()
          .eq("admin_user_id", user.id);

        // Generate secure token
        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");

        // Store with 2-hour expiry
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

        const { error: insertError } = await supabaseAdmin
          .from("active_impersonations")
          .insert({
            admin_user_id: user.id,
            target_company_id: companyId,
            token,
            expires_at: expiresAt,
            ip_address: clientIp,
            user_agent: userAgent,
          });

        if (insertError) {
          return new Response(JSON.stringify({ error: "Failed to create impersonation" }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        // Audit log
        await supabaseAdmin.from("admin_audit_log").insert({
          user_id: user.id,
          action: "impersonation_start",
          target_type: "company",
          target_id: companyId,
          details: { company_name: company.name, ip_address: clientIp },
          ip_address: clientIp,
        });

        return new Response(JSON.stringify({
          token,
          companyId,
          companyName: company.name,
          expiresAt,
        }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      case "validate": {
        if (!impersonationToken) {
          return new Response(JSON.stringify({ valid: false }), {
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        // Find active impersonation
        const { data: imp } = await supabaseAdmin
          .from("active_impersonations")
          .select("*, companies:target_company_id(*)")
          .eq("admin_user_id", user.id)
          .eq("token", impersonationToken)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();

        if (!imp) {
          return new Response(JSON.stringify({ valid: false }), {
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({
          valid: true,
          companyId: imp.target_company_id,
          company: imp.companies,
          expiresAt: imp.expires_at,
        }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      case "end": {
        // Delete all impersonations for this admin
        await supabaseAdmin
          .from("active_impersonations")
          .delete()
          .eq("admin_user_id", user.id);

        // Audit log
        await supabaseAdmin.from("admin_audit_log").insert({
          user_id: user.id,
          action: "impersonation_end",
          target_type: "company",
          details: { ip_address: clientIp },
          ip_address: clientIp,
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      case "cleanup": {
        // Clean expired impersonations (can be called by cron)
        const { data: deleted } = await supabaseAdmin
          .from("active_impersonations")
          .delete()
          .lt("expires_at", new Date().toISOString())
          .select("id");

        return new Response(JSON.stringify({ cleaned: deleted?.length || 0 }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
}));
