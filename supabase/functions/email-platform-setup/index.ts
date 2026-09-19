// email-platform-setup — setup one-shot del dominio marketing della piattaforma.
//
// Registra il dominio fallback marketing (mail.ediliziaincloud.com) su
// Elastic Email, crea i record DNS via API Cloudflare (la zona .com è su
// Cloudflare), triggera la verifica EE e invia un'email di test.
//
// Actions (POST { action, ... }):
//   - setup_domain → EE add + Cloudflare DNS records (SPF, DKIM, tracking)
//   - verify_domain → EE verification status
//   - test_send    → invia email di test (to obbligatorio nel body)
//
// Auth: header x-setup-token == platform_settings.email_setup_token
// (pattern one-time identico a email-provider-check / meta-warmup).

import { getPlatformSetting, leggiImpostazionePiattaforma } from "../_shared/getPlatformSetting.ts";

const MARKETING_DOMAIN = "mkt.ediliziaincloud.com";
const CF_ZONE_NAME = "ediliziaincloud.com";
const ELASTIC_DKIM_PUBLIC_KEY =
  "k=rsa;t=s;p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCbmGbQMzYeMvxwtNQoXN0waGYaciuKx8mtMh5czguT4EZlJXuCt6V+l56mmt3t68FEX5JJ0q4ijG71BGoFRkl87uJi7LrQt1ZZmZCvrEII0YO4mp8sDLXC8g1aUAoi8TJgxq2MJqCaMyj5kAm3Fdy2tzftPCV/lbdiJqmBnWKjtwIDAQAB";
const ELASTIC_SPF_VALUE = "v=spf1 a mx include:_spf.elasticemail.com ~all";

interface CfRecord {
  type: "TXT" | "CNAME";
  name: string;
  content: string;
}

async function cfApi(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    const errs = JSON.stringify(data?.errors ?? data).slice(0, 300);
    throw new Error(`Cloudflare ${path} → ${res.status}: ${errs}`);
  }
  return data;
}

async function ensureCfRecord(
  token: string,
  zoneId: string,
  record: CfRecord,
): Promise<string> {
  // Esiste già?
  const list = await cfApi(
    token,
    `/zones/${zoneId}/dns_records?type=${record.type}&name=${encodeURIComponent(record.name)}`,
  );
  const existing = (list.result as Array<Record<string, unknown>>) ?? [];
  const match = existing.find((r) => String(r.content) === record.content);
  if (match) return "already_present";
  if (existing.length > 0 && record.type === "CNAME") {
    return "conflict_existing_cname"; // non sovrascriviamo CNAME altrui
  }
  await cfApi(token, `/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: 300,
      proxied: false,
    }),
  });
  return "created";
}

Deno.serve(async (req) => {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const token = req.headers.get("x-setup-token") ?? "";
    if (!token) return json({ error: "missing x-setup-token" }, 401);

    // Il token dal 19/09/2026 sta nel Vault.
    const tokenSalvato = await leggiImpostazionePiattaforma("email_setup_token");
    if (!tokenSalvato || tokenSalvato !== token) {
      return json({ error: "invalid token" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    const eeKey = await getPlatformSetting("email_marketing_api_key");
    if (!eeKey) return json({ error: "EMAIL_MARKETING_API_KEY non configurata" }, 500);
    const eeHeaders = {
      "Content-Type": "application/json",
      "X-ElasticEmail-ApiKey": eeKey,
    };

    if (action === "account_info") {
      // v2 API: l'unico endpoint che espone l'email dell'account
      const res = await fetch(
        `https://api.elasticemail.com/v2/account/load?apikey=${encodeURIComponent(eeKey)}`,
      );
      const data = await res.json().catch(() => ({}));
      return json({
        success: data?.success === true,
        email: data?.data?.email ?? null,
        reputation: data?.data?.reputation ?? null,
        daily_send_limit: data?.data?.dailysendlimit ?? null,
        error: data?.success === true ? null : JSON.stringify(data).slice(0, 300),
      });
    }

    if (action === "cf_debug") {
      const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN") ?? "";
      if (!cfToken) return json({ error: "CLOUDFLARE_API_TOKEN non configurato" }, 500);
      const verify = await cfApi(cfToken, "/user/tokens/verify").catch((e) => ({
        error: String(e),
      }));
      const zones = await cfApi(cfToken, "/zones?per_page=50").catch((e) => ({
        error: String(e),
      }));
      return json({
        token_status: (verify as Record<string, unknown>).result ?? verify,
        zones: Array.isArray((zones as Record<string, unknown>).result)
          ? ((zones as { result: Array<Record<string, unknown>> }).result).map((z) => ({
            name: z.name,
            id: z.id,
            status: z.status,
          }))
          : zones,
      });
    }

    if (action === "ee_add_domain") {
      // Registra il dominio piattaforma su EE senza toccare Cloudflare
      // (record DNS gestiti a mano finché il token CF non viene rigenerato).
      const addRes = await fetch("https://api.elasticemail.com/v4/domains", {
        method: "POST",
        headers: eeHeaders,
        body: JSON.stringify({ domain: MARKETING_DOMAIN }),
      });
      const ok = addRes.ok || addRes.status === 409 || addRes.status === 400;
      return json({
        success: ok,
        domain: MARKETING_DOMAIN,
        status: addRes.status,
        error: ok ? null : (await addRes.text()).slice(0, 300),
      });
    }

    if (action === "ee_remove_domain") {
      const domain = String(body.domain ?? "");
      if (!domain.endsWith(".ediliziaincloud.com") && !domain.endsWith(".ediliziaincloud.it")) {
        return json({ error: "rimozione consentita solo per sottodomini piattaforma" }, 400);
      }
      const delRes = await fetch(
        `https://api.elasticemail.com/v4/domains/${encodeURIComponent(domain)}`,
        { method: "DELETE", headers: { "X-ElasticEmail-ApiKey": eeKey } },
      );
      return json({ success: delRes.ok, domain, status: delRes.status });
    }

    if (action === "setup_domain") {
      const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN") ?? "";
      if (!cfToken) return json({ error: "CLOUDFLARE_API_TOKEN non configurato" }, 500);

      // 1. EE: registra il dominio (409 = già presente, ok)
      const addRes = await fetch("https://api.elasticemail.com/v4/domains", {
        method: "POST",
        headers: eeHeaders,
        body: JSON.stringify({ domain: MARKETING_DOMAIN }),
      });
      if (!addRes.ok && addRes.status !== 409 && addRes.status !== 400) {
        return json({
          error: `EE addDomain ${addRes.status}: ${(await addRes.text()).slice(0, 200)}`,
        }, 500);
      }

      // 2. Cloudflare: zona + record
      const zones = await cfApi(cfToken, `/zones?name=${CF_ZONE_NAME}`);
      const zone = (zones.result as Array<Record<string, unknown>>)?.[0];
      if (!zone?.id) return json({ error: `Zona Cloudflare "${CF_ZONE_NAME}" non trovata` }, 500);
      const zoneId = String(zone.id);

      const records: CfRecord[] = [
        { type: "TXT", name: MARKETING_DOMAIN, content: ELASTIC_SPF_VALUE },
        {
          type: "TXT",
          name: `api._domainkey.${MARKETING_DOMAIN}`,
          content: ELASTIC_DKIM_PUBLIC_KEY,
        },
        {
          type: "CNAME",
          name: `tracking.${MARKETING_DOMAIN}`,
          content: "api.elasticemail.com",
        },
      ];
      const dns: Record<string, string> = {};
      for (const r of records) {
        dns[`${r.type} ${r.name}`] = await ensureCfRecord(cfToken, zoneId, r);
      }

      return json({ success: true, domain: MARKETING_DOMAIN, zone_id: zoneId, dns });
    }

    if (action === "verify_domain") {
      const res = await fetch(
        `https://api.elasticemail.com/v4/domains/${encodeURIComponent(MARKETING_DOMAIN)}/verification`,
        { method: "PUT", headers: eeHeaders },
      );
      const data = res.ok ? await res.json() : null;
      return json({
        success: res.ok,
        status: res.status,
        verification: data,
        error: res.ok ? null : (await res.text()).slice(0, 300),
      });
    }

    if (action === "test_send") {
      const to = String(body.to ?? "");
      if (!to.includes("@")) return json({ error: "campo 'to' mancante" }, 400);
      const from = String(body.from ?? `Demo Azienda SRL via EdiliziaInCloud <demo@${MARKETING_DOMAIN}>`);
      const subject = String(
        body.subject ?? "Test Email Marketing — Edilizia in Cloud",
      );
      const html = String(
        body.html ??
          `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
            <h2 style="color:#1E3A5F">Test campagna marketing 🎉</h2>
            <p>Questa è un'email di prova inviata da <strong>Demo Azienda SRL</strong>
            tramite la piattaforma Edilizia in Cloud (provider: Elastic Email,
            dominio mittente: ${MARKETING_DOMAIN}).</p>
            <p>Se la stai leggendo, il canale email marketing è operativo.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
            <p style="color:#888;font-size:12px">© Edilizia in Cloud — email di test tecnico.</p>
          </div>`,
      );
      const res = await fetch("https://api.elasticemail.com/v4/emails", {
        method: "POST",
        headers: eeHeaders,
        body: JSON.stringify({
          Recipients: [{ Email: to }],
          Content: {
            From: from,
            Subject: subject,
            Body: [{ ContentType: "HTML", Charset: "utf-8", Content: html }],
          },
        }),
      });
      const data = res.ok ? await res.json() : null;
      return json({
        success: res.ok,
        status: res.status,
        message_id: data?.MessageID ?? null,
        transaction_id: data?.TransactionID ?? null,
        error: res.ok ? null : (await res.text()).slice(0, 300),
      });
    }

    return json({ error: `azione sconosciuta: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
