import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { verificaPermessoAzienda } from "../_shared/permessoAzienda.ts";
import { isSuperAdminEmailAllowed } from "../_shared/auth.ts";
import { SaltEdgeClient, SaltEdgeError, saltConfiguration, saltId, saltPublicError, saltReturnUrl, saltWidgetUrl, sha256, type SaltConnection } from "../_shared/saltedge.ts";
import { checkSaltDb, saltAttach, saltCustomer, saltLock, saltOwnedConnection, saltSync } from "../_shared/saltedgeStore.ts";

Deno.serve(async req => {
  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  try {
    const token = req.headers.get("Authorization");
    if (!token?.startsWith("Bearer ")) return json({ error: "Accesso richiesto" }, 401);
    const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: token } }, auth: { persistSession: false } });
    const { data: { user }, error } = await auth.auth.getUser();
    if (error || !user?.email) return json({ error: "Sessione non valida" }, 401);
    const db: any = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const body = await req.json();
    const companyId = body.company_id;
    if (typeof companyId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) return json({ error: "Seleziona un'azienda" }, 400);
    const profile = await db.from("profiles").select("id,is_blocked,deleted_at").eq("id", user.id).maybeSingle(); checkSaltDb(profile);
    if (!profile.data || profile.data.is_blocked || profile.data.deleted_at) return json({ error: "Utente non abilitato" }, 403);
    const roles = await db.from("user_roles").select("role").eq("user_id", user.id); checkSaltDb(roles);
    if (roles.data?.some((r: { role: string }) => r.role === "super_admin") && !isSuperAdminEmailAllowed(user.email)) return json({ error: "Accesso negato" }, 403);
    await verificaPermessoAzienda(db, user.id, companyId, ["can_view_tesoreria"], "gestire i conti in Tesoreria");
    if (!["status", "sync"].includes(body.action)) await verificaPermessoAzienda(db, user.id, companyId, ["can_edit_settings_integrations"], "modificare i collegamenti bancari");
    let config;
    try { config = saltConfiguration(name => Deno.env.get(name), companyId); }
    catch (e) { if (body.action === "status") return json({ ready: false, ...saltPublicError(e) }); throw e; }
    if (body.action === "status") return json({ ready: true, provider: "saltedge", mode: config.mode,
      connectReady: new URL(config.origin).protocol === "https:",
      connectError: new URL(config.origin).protocol === "https:" ? null : "Per collegare o rinnovare un conto occorre riattivare l'indirizzo HTTPS della beta. I dati gia' importati restano consultabili e sincronizzabili.",
    });
    const api = new SaltEdgeClient(config);
    if (body.action === "start-auth" || body.action === "reconnect" || body.action === "refresh") {
      if (body.confirm_company_accounts !== true) return json({ error: "Conferma che collegherai solo conti dell'azienda selezionata." }, 400);
      return await saltLock(db, `start:${companyId}:${user.id}`, async () => {
        const row = body.action !== "start-auth" ? await saltOwnedConnection(db, companyId, body.connection_id) : null;
        if (body.action === "refresh" && row?.next_refresh_possible_at && Date.parse(row.next_refresh_possible_at) > Date.now()) throw new SaltEdgeError("RefreshNotAvailable", 429);
        if (row && config.mode === "pending") {
          const remote = (await api.request<SaltConnection>(`/connections/${saltId(row.provider_connection_id)}`)).data;
          if (remote.customer_id !== row.saltedge_customer_id || remote.country_code !== "XF") throw new SaltEdgeError("BetaModeRequired", 403);
        }
        const customerId = await saltCustomer(db, api, user.id, user.email!);
        if (row && row.saltedge_customer_id !== customerId) throw new SaltEdgeError("DifferentConsentOwner", 403);
        const state = crypto.randomUUID() + crypto.randomUUID();
        const session = await db.from("bank_saltedge_sessions").insert({ company_id: companyId, user_id: user.id, customer_id: customerId,
          state_hash: await sha256(state), connection_id: row?.provider_connection_id ?? null,
        }).select("id").single(); checkSaltDb(session);
        const data: Record<string, unknown> = { customer_id: customerId, automatic_refresh: false, categorization: "none",
          return_connection_id: true, return_error_class: true,
          attempt: { return_to: saltReturnUrl(config.origin, body.redirect_path, state), locale: "it", fetch_scopes: ["accounts", "balance", "transactions"], custom_fields: { eic_session_id: session.data.id } },
          widget: { show_account_overview: true, wait_all_transactions: true, allowed_countries: config.mode === "pending" ? ["XF"] : ["IT"], popular_providers_country: config.mode === "pending" ? "XF" : "IT" },
        };
        if (body.action !== "refresh") data.consent = { scopes: ["accounts", "transactions"] };
        if (config.accessType === "partner") data.kyc = { type_of_account: "business" };
        if (!row) data.provider = config.mode === "pending" ? { code: "fakebank_oauth_xf", include_sandboxes: true } : { include_sandboxes: false, modes: ["oauth", "api"] };
        const path = row ? `/connections/${saltId(row.provider_connection_id)}/${body.action}` : "/connections/connect";
        const result = (await api.request<{ connect_url: string; customer_id: string }>(path, "POST", data)).data;
        if (result.customer_id !== customerId) throw new SaltEdgeError("InvalidProviderResponse", 502);
        return json({ url: saltWidgetUrl(result.connect_url), mode: config.mode });
      });
    }
    if (body.action === "finalize") {
      if (typeof body.state !== "string" || body.state.length > 100) throw new SaltEdgeError("InvalidSession", 403);
      const session = await db.from("bank_saltedge_sessions").select("*").eq("company_id", companyId).eq("user_id", user.id).eq("state_hash", await sha256(body.state)).gt("expires_at", new Date().toISOString()).maybeSingle(); checkSaltDb(session);
      if (!session.data) throw new SaltEdgeError("InvalidSession", 403);
      const remote = (await api.request<SaltConnection>(`/connections/${saltId(body.provider_connection_id)}`)).data;
      const row = await saltAttach(db, remote, session.data);
      return json(await saltSync(db, api, row));
    }
    if (body.action === "sync") {
      const rows = body.connection_id ? [await saltOwnedConnection(db, companyId, body.connection_id)]
        : (await db.from("bank_connections").select("*").eq("company_id", companyId).eq("provider_slug", "saltedge").in("status", ["linked", "created"]));
      if (!Array.isArray(rows)) checkSaltDb(rows);
      const list = Array.isArray(rows) ? rows : rows.data ?? [];
      if (!list.length) throw new SaltEdgeError("ConnectionNotFound", 404);
      const results = [];
      for (const row of list) results.push(await saltSync(db, api, row));
      return json({ ok: true, imported: results.reduce((sum, r) => sum + r.imported, 0), processing: results.some(r => r.processing), connection_id: results.length === 1 ? results[0].connection_id : undefined });
    }
    if (body.action === "disconnect") {
      const row = await saltOwnedConnection(db, companyId, body.connection_id);
      await saltLock(db, `connection:${row.id}`, async () => {
        // Provider consent is revoked first; local history is never deleted.
        try { await api.request(`/connections/${saltId(row.provider_connection_id)}`, "DELETE"); }
        catch (e) { if (!(e instanceof SaltEdgeError) || e.code !== "ConnectionNotFound") throw e; }
        checkSaltDb(await db.from("bank_accounts").update({ is_active: false }).eq("connection_id", row.id).eq("company_id", companyId));
        checkSaltDb(await db.from("bank_connections").update({ status: "disconnected", error_message: null }).eq("id", row.id).eq("company_id", companyId));
      });
      return json({ ok: true });
    }
    return json({ error: "Azione non supportata" }, 400);
  } catch (error) {
    console.error("bank-saltedge request failed", {
      kind: error instanceof Error ? error.name : "Unknown",
      code: error instanceof SaltEdgeError ? error.code : "Unavailable",
    });
    if (error instanceof Error && error.message.startsWith("Non autorizzato")) return json({ error: "Accesso negato a questa azienda" }, 403);
    return json(saltPublicError(error), error instanceof SaltEdgeError ? error.status : 503);
  }
});
