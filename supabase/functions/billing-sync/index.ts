import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAdapter } from "../_shared/billingAdapter.ts";
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });

  const corsH = getCorsHeaders(req);
  // Verifica JWT (SEC-013)
  let userId: string;
  let supabaseAdmin: ReturnType<typeof createClient>;
  try {
    ({ userId, supabaseAdmin } = await requireAuth(req, corsH));
  } catch (authErr) {
    if (authErr instanceof Response) return authErr;
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const { invoice_id, provider: preferredProvider } = await req.json();

    // Recupera fattura
    const { data: invoice } = await supabase
      .from("invoices").select("*").eq("id", invoice_id).single();
    if (!invoice) return json({ error: "Invoice not found" }, 404);
    if (!invoice.external_id) return json({ error: "Invoice not synced yet" }, 400);

    // Verifica ownership: l'utente deve appartenere all'azienda della fattura (SEC-013)
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    const isSuperAdmin = (callerRoles || []).some((r: { role: string }) => r.role === "super_admin");
    if (!isSuperAdmin) {
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles").select("company_id").eq("id", userId).maybeSingle();
      if (!callerProfile || callerProfile.company_id !== invoice.company_id) {
        return json({ error: "Non autorizzato" }, 403);
      }
    }

    // Recupera integrazione attiva
    let query = supabase.from("billing_integrations").select("*")
      .eq("company_id", invoice.company_id).eq("is_active", true);
    if (preferredProvider) query = query.eq("provider", preferredProvider);
    else query = query.eq("is_primary", true);

    let { data: integration } = await query.maybeSingle();
    if (!integration && !preferredProvider) {
      // Fix #9: Deterministic fallback — oldest integration first
      const { data: fallback } = await supabase
        .from("billing_integrations").select("*")
        .eq("company_id", invoice.company_id).eq("is_active", true)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      integration = fallback;
    }
    if (!integration) return json({ error: "No active integration found" }, 400);

    // Refresh token FIC se scaduto (con advisory lock anti-race-condition)
    if (integration.provider === "fattureincloud" && integration.token_expires_at) {
      const exp = new Date(integration.token_expires_at as string);
      // Buffer 30 minuti invece di 5
      if (exp < new Date(Date.now() + 30 * 60 * 1000)) {
        // Tentare advisory lock
        const { data: lockAcquired } = await supabase.rpc("try_acquire_token_refresh_lock", {
          p_integration_id: integration.id,
        });

        if (lockAcquired) {
          try {
            // Double-check: ri-leggere token dal DB dopo lock
            const { data: freshIntegration } = await supabase
              .from("billing_integrations").select("access_token, token_expires_at")
              .eq("id", integration.id).single();

            const freshExp = freshIntegration?.token_expires_at
              ? new Date(freshIntegration.token_expires_at as string)
              : exp;

            // Se un altro worker ha già refreshato, skip
            if (freshExp >= new Date(Date.now() + 30 * 60 * 1000)) {
              integration.access_token = freshIntegration!.access_token as string;
            } else {
              // Eseguire il refresh
              const r = await fetch("https://api.fattureincloud.it/v2/oauth/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                  grant_type: "refresh_token",
                  client_id: Deno.env.get("FIC_CLIENT_ID") || "",
                  client_secret: Deno.env.get("FIC_CLIENT_SECRET") || "",
                  refresh_token: integration.refresh_token as string,
                }),
              });
              if (r.ok) {
                const td = await r.json();
                integration.access_token = td.access_token;
                await supabase.from("billing_integrations").update({
                  access_token: td.access_token,
                  token_expires_at: new Date(Date.now() + td.expires_in * 1000).toISOString(),
                }).eq("id", integration.id);
              }
            }
          } finally {
            // Rilasciare il lock sempre
            await supabase.rpc("release_token_refresh_lock", {
              p_integration_id: integration.id,
            });
          }
        } else {
          // Lock non disponibile: breve attesa con jitter, poi ri-leggere token aggiornato
          const jitter = 500 + Math.floor(Math.random() * 1500); // 500–2000 ms
          await new Promise((resolve) => setTimeout(resolve, jitter));
          const { data: refreshed } = await supabase
            .from("billing_integrations").select("access_token")
            .eq("id", integration.id).single();
          if (refreshed?.access_token) {
            integration.access_token = refreshed.access_token as string;
          }
        }
      }
    }

    let adapter;
    try {
      adapter = createAdapter(integration as { provider: string; access_token?: string | null; api_key?: string | null; company_external_id?: string | null });
    } catch (e) {
      return json({ error: String(e) }, 400);
    }

    // Solo fetch_status — verifica stato fattura importata
    const result = await adapter.fetchStatus(invoice.external_id);

    await supabase.from("billing_sync_log").insert({
      company_id: invoice.company_id,
      invoice_id: invoice.id,
      provider: integration.provider as string,
      direction: "pull",
      action: "fetch_status",
      status: result.success ? "success" : "error",
      response_payload: result as unknown as Record<string, unknown>,
      error_message: result.error || null,
    });

    if (result.success) {
      await supabase.from("invoices").update({
        external_status: result.externalStatus,
        status: result.internalStatus,
        external_sdi_id: result.sdiId,
        last_synced_at: new Date().toISOString(),
      }).eq("id", invoice.id);
    }

    return json(result);
  } catch (e) {
    console.error("billing-sync error:", e);
    return json({ error: String(e) }, 500);
  }
});
