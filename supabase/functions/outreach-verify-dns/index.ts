import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

/**
 * outreach-verify-dns — il SUPER_ADMIN verifica lo stato DNS reale (SPF/DKIM)
 * di un dominio mittente interrogando l'API Elastic Email, e aggiorna
 * outreach_sending_domains (spf_verified/dkim_verified/status). Sostituisce il
 * toggle manuale: lo stato riflette il provider, non un click. Solo lettura
 * dell'API EE (GET /v4/domains), nessuna modifica al DNS.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const domainId = String(body?.domain_id || "");
    if (!domainId) return errorResponse("domain_id mancante", 400, corsH);

    const { data: row, error: rErr } = await admin
      .from("outreach_sending_domains")
      .select("id,domain,status,spf_verified,dkim_verified,dmarc_verified")
      .eq("id", domainId).maybeSingle();
    if (rErr) throw rErr;
    if (!row) return errorResponse("Dominio non trovato", 404, corsH);

    const eeKey = await getPlatformSetting("email_marketing_api_key");
    if (!eeKey) return errorResponse("Provider email (Elastic Email) non configurato", 503, corsH);

    const res = await fetch("https://api.elasticemail.com/v4/domains", {
      headers: { "X-ElasticEmail-ApiKey": eeKey },
    });
    if (!res.ok) {
      const txt = (await res.text()).slice(0, 300);
      return errorResponse(`Elastic Email ha risposto ${res.status}: ${txt}`, 502, corsH);
    }
    const domains = await res.json().catch(() => []);
    const match = Array.isArray(domains)
      ? domains.find((d: Record<string, unknown>) => String(d.Domain ?? "").toLowerCase() === row.domain.toLowerCase())
      : null;

    const nowIso = new Date().toISOString();

    if (!match) {
      // Dominio non ancora presente su Elastic Email: va aggiunto e i record DNS configurati.
      await admin.from("outreach_sending_domains")
        .update({ status: "verifying", updated_at: nowIso }).eq("id", row.id);
      return jsonResponse({
        ok: true, found: false, domain: row.domain,
        spf_verified: false, dkim_verified: false, status: "verifying",
        message: "Dominio non ancora presente su Elastic Email: aggiungilo e configura SPF/DKIM/DMARC, poi riverifica.",
      }, 200, corsH);
    }

    const spf = Boolean(match.Spf ?? match.SpfVerified ?? false);
    const dkim = Boolean(match.Dkim ?? match.DkimVerified ?? false);
    const ready = spf && dkim;
    const status = ready ? "active" : "verifying";

    const { error: uErr } = await admin.from("outreach_sending_domains").update({
      spf_verified: spf, dkim_verified: dkim, status, updated_at: nowIso,
    }).eq("id", row.id);
    if (uErr) throw uErr;

    return jsonResponse({ ok: true, found: true, domain: row.domain, spf_verified: spf, dkim_verified: dkim, status }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-verify-dns error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
