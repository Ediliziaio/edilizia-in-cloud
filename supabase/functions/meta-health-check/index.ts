import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { loadProviderSettings, sendViaProviderWithFailover } from "../_shared/emailProvider.ts";

const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";
// Alert operativo quando un'integrazione si rompe (email best-effort).
const ALERT_EMAIL = Deno.env.get("INTEGRATIONS_ALERT_EMAIL") || "flo.andriciuc@gmail.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // Protezione cron: accetta CRON_SECRET header o Bearer JWT
  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization");
  const authorized =
    (cronSecret && reqSecret === cronSecret) ||
    authHeader?.startsWith("Bearer ");
  if (!authorized) {
    console.error("meta-health-check: accesso non autorizzato");
    return errorResponse("Unauthorized", 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: integrations, error: intErr } = await admin
      .from("integrations")
      .select("id, company_id, status, health, last_sync_at, updated_at")
      .eq("provider", "meta")
      .in("status", ["connected", "error", "token_expired"]);

    if (intErr) throw intErr;

    const now = new Date();
    const results: { id: string; newHealth: string; newStatus?: string; reason?: string }[] = [];

    for (const integ of integrations || []) {
      let newHealth: "ok" | "warn" | "critical" = "ok";
      let newStatus: string | undefined;
      let reason: string | undefined;

      const { data: creds } = await admin
        .from("integration_credentials")
        .select("expires_at")
        .eq("integration_id", integ.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (creds?.expires_at) {
        const expiresAt = new Date(creds.expires_at);
        const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

        if (daysUntilExpiry <= 0) {
          newHealth = "critical";
          newStatus = "token_expired";
          reason = "Token Meta scaduto";
        } else if (daysUntilExpiry <= 7) {
          newHealth = "warn";
          reason = `Token scade tra ${Math.ceil(daysUntilExpiry)} giorni`;
        }
      }

      if (newHealth !== "critical") {
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const { count: failedCount } = await admin
          .from("integration_webhook_events")
          .select("id", { count: "exact", head: true })
          .eq("integration_id", integ.id)
          .eq("status", "failed")
          .gte("received_at", yesterday);

        if ((failedCount || 0) >= 10) {
          newHealth = "critical";
          reason = `${failedCount} eventi falliti nelle ultime 24h`;
        } else if ((failedCount || 0) >= 3) {
          newHealth = "warn";
          reason = reason || `${failedCount} eventi falliti nelle ultime 24h`;
        }
      }

      if (newHealth !== integ.health || (newStatus && newStatus !== integ.status)) {
        const updateData: Record<string, any> = {
          health: newHealth,
          updated_at: now.toISOString(),
        };
        if (newStatus) {
          updateData.status = newStatus;
          updateData.last_error_message = reason;
        }

        await admin.from("integrations").update(updateData).eq("id", integ.id);

        await admin.from("integration_audit_log").insert({
          company_id: integ.company_id,
          action: "health_check",
          entity_type: "integration",
          entity_id: integ.id,
          metadata: { old_health: integ.health, new_health: newHealth, reason },
        });

        results.push({ id: integ.id, newHealth, newStatus, reason });
      }
    }

    // ── Alert email: integrazioni appena diventate critiche ──
    // `results` contiene SOLO le transizioni di stato (newHealth ≠ health
    // precedente): un'integrazione già critica ieri non genera un nuovo
    // alert ogni giorno.
    const criticals = results.filter((r) => r.newHealth === "critical");
    if (criticals.length > 0) {
      try {
        const integById = new Map((integrations || []).map((i: any) => [i.id, i]));
        const companyIds = [...new Set(criticals.map((c) => integById.get(c.id)?.company_id).filter(Boolean))];
        const { data: companies } = await admin
          .from("companies")
          .select("id, name")
          .in("id", companyIds);
        const companyName = new Map((companies ?? []).map((c: any) => [c.id, c.name]));

        const rows = criticals
          .map((c) => {
            const integ = integById.get(c.id);
            const azienda = companyName.get(integ?.company_id) ?? integ?.company_id ?? "?";
            return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${azienda}</td><td style="padding:6px 12px;border-bottom:1px solid #eee">Meta</td><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#b91c1c">${c.reason ?? c.newStatus ?? "critico"}</td></tr>`;
          })
          .join("");
        const html =
          `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">` +
          `<h2 style="font-size:16px">⚠️ Integrazioni in errore su EdiliziaInCloud</h2>` +
          `<p>Il controllo di salute ha rilevato ${criticals.length} integrazion${criticals.length === 1 ? "e" : "i"} in stato critico:</p>` +
          `<table style="border-collapse:collapse;font-size:13px"><tr><th style="text-align:left;padding:6px 12px;border-bottom:2px solid #ddd">Azienda</th><th style="text-align:left;padding:6px 12px;border-bottom:2px solid #ddd">Provider</th><th style="text-align:left;padding:6px 12px;border-bottom:2px solid #ddd">Problema</th></tr>${rows}</table>` +
          `<p style="margin-top:16px">Controlla da super admin: Integrazioni dell'azienda → "Risolvi problemi" (spesso basta ricollegare Meta).</p>` +
          `<p style="color:#6b7280;font-size:12px">Email automatica di meta-health-check — inviata solo quando lo stato peggiora.</p>` +
          `</div>`;

        const provider = await loadProviderSettings("transactional");
        const r = await sendViaProviderWithFailover("transactional", provider, {
          from: provider.fromDefault,
          to: [ALERT_EMAIL],
          subject: `⚠️ EiC: ${criticals.length} integrazion${criticals.length === 1 ? "e" : "i"} Meta in errore`,
          html,
        });
        if (!r.ok) console.error("meta-health-check: alert email fallita:", r.error ?? r.status);
      } catch (e) {
        // best-effort: l'alert non deve mai far fallire il check
        console.error("meta-health-check: invio alert email fallito:", e);
      }
    }

    // ── Self-healing webhook lead ──
    // Ogni pagina selezionata DEVE essere iscritta al webhook leadgen su Meta
    // (POST /{page}/subscribed_apps): senza iscrizione i lead NON arrivano in
    // tempo reale ma solo col backfill manuale. Se l'iscrizione manca la crea
    // ora e recupera i lead degli ultimi 3 giorni (persi mentre mancava).
    const healed: Array<{ integration_id: string; page_id: string; backfilled: number }> = [];
    for (const integ of integrations || []) {
      if (integ.status === "token_expired") continue;
      try {
        const results2 = await ensureLeadgenSubscriptions(admin, integ);
        healed.push(...results2);
      } catch (e) {
        console.warn(`meta-health-check: self-healing iscrizioni ${integ.id} fallito:`, e);
      }
    }

    return jsonResponse({ checked: (integrations || []).length, updated: results, subscriptions_healed: healed });
  } catch (error: any) {
    console.error("meta-health-check error:", error);
    return errorResponse(error.message, 500);
  }
});

/**
 * Iscrive al webhook leadgen le pagine selezionate che non risultano già
 * iscritte (integration_webhook_subscriptions status=active). Al momento
 * dell'iscrizione recupera anche i lead recenti persi.
 */
async function ensureLeadgenSubscriptions(
  admin: any,
  integ: { id: string; company_id: string },
): Promise<Array<{ integration_id: string; page_id: string; backfilled: number }>> {
  const out: Array<{ integration_id: string; page_id: string; backfilled: number }> = [];

  const { data: pages } = await admin
    .from("meta_assets")
    .select("id, asset_id, asset_name")
    .eq("integration_id", integ.id)
    .eq("company_id", integ.company_id)
    .eq("asset_type", "page")
    .eq("selected", true);
  if (!pages?.length) return out;

  const { data: creds } = await admin
    .from("integration_credentials")
    .select("meta_page_tokens")
    .eq("integration_id", integ.id)
    .maybeSingle();
  const pageTokens = (creds?.meta_page_tokens ?? {}) as Record<string, string>;
  if (Object.keys(pageTokens).length === 0) return out;

  const { data: subs } = await admin
    .from("integration_webhook_subscriptions")
    .select("page_id, status")
    .eq("integration_id", integ.id);
  const activeSubs = new Set(
    (subs ?? []).filter((s: any) => s.status === "active" && s.page_id).map((s: any) => s.page_id),
  );

  const encKey = getEncryptionKey();

  for (const page of pages) {
    if (activeSubs.has(page.asset_id)) continue;
    const encTok = pageTokens[page.asset_id];
    if (!encTok) continue;

    let pageToken: string;
    try {
      pageToken = await decrypt(encTok, encKey);
    } catch {
      console.warn(`meta-health-check: token pagina ${page.asset_id} non decifrabile`);
      continue;
    }

    const subRes = await fetch(
      `https://graph.facebook.com/${apiVersion}/${page.asset_id}/subscribed_apps`,
      {
        method: "POST",
        body: new URLSearchParams({ subscribed_fields: "leadgen", access_token: pageToken }),
      },
    );
    const subData = await subRes.json();
    if (subData.error) {
      console.warn(`meta-health-check: subscribe ${page.asset_id} fallita:`, subData.error.message);
      continue;
    }

    await admin.from("integration_webhook_subscriptions").upsert(
      {
        company_id: integ.company_id,
        integration_id: integ.id,
        provider: "meta",
        page_id: page.asset_id,
        subscribed_fields: ["leadgen"],
        status: "active",
        subscribed_at: new Date().toISOString(),
      },
      { onConflict: "integration_id,page_id" },
    );
    await admin.from("integration_audit_log").insert({
      company_id: integ.company_id,
      action: "webhook_subscribed",
      entity_type: "integration",
      entity_id: integ.id,
      metadata: { page_id: page.asset_id, page_name: page.asset_name, source: "health_check_self_healing" },
    });

    // Lead persi mentre mancava l'iscrizione: rimettili in coda (upsert
    // idempotente su event_id, formato canonico con form/page espliciti).
    const backfilled = await backfillPageLeads(admin, integ, page, pageToken, 3);
    out.push({ integration_id: integ.id, page_id: page.asset_id, backfilled });
  }
  return out;
}

async function backfillPageLeads(
  admin: any,
  integ: { id: string; company_id: string },
  page: { id: string; asset_id: string },
  pageToken: string,
  days: number,
): Promise<number> {
  const sinceTs = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  const { data: forms } = await admin
    .from("meta_lead_forms")
    .select("form_id")
    .eq("integration_id", integ.id)
    .eq("company_id", integ.company_id)
    .eq("page_asset_id", page.id)
    .eq("status", "active");

  let imported = 0;
  for (const form of forms ?? []) {
    let nextUrl: string | null =
      `https://graph.facebook.com/${apiVersion}/${form.form_id}/leads` +
      `?fields=id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name` +
      `&limit=50&filtering=[{"field":"time_created","operator":"GREATER_THAN","value":${sinceTs}}]` +
      `&access_token=${pageToken}`;
    while (nextUrl) {
      const res = await fetch(nextUrl);
      const data = await res.json();
      if (data.error) {
        console.warn(`meta-health-check: backfill form ${form.form_id} errore:`, data.error.message);
        break;
      }
      for (const lead of data.data ?? []) {
        // ignoreDuplicates: i lead già importati/processati NON vengono
        // rimessi in coda — entra solo ciò che era andato perso.
        await admin.from("integration_webhook_events").upsert(
          {
            company_id: integ.company_id,
            integration_id: integ.id,
            provider: "meta",
            event_type: "leadgen",
            event_id: lead.id,
            payload: { ...lead, leadgen_id: lead.id, form_id: form.form_id, page_id: page.asset_id },
            received_at: new Date().toISOString(),
            status: "pending",
            fail_count: 0,
          },
          { onConflict: "company_id,provider,event_id", ignoreDuplicates: true },
        );
        imported++;
      }
      nextUrl = data.paging?.next || null;
    }
  }
  return imported;
}
