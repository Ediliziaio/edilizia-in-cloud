// email-provider-check — one-shot di verifica provider email (super admin ops).
//
// Verifica che le chiavi configurate (Elastic Email marketing, Resend
// transactional) siano valide chiamando gli endpoint account/domains dei
// provider. Non invia email e non espone le chiavi.
//
// Auth: header x-check-token confrontato con platform_settings.email_check_token
// (token one-time scritto a DB prima della chiamata, stesso pattern di
// meta-warmup-api-calls).

import { getPlatformSetting, leggiImpostazionePiattaforma } from "../_shared/getPlatformSetting.ts";

Deno.serve(async (req) => {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const token = req.headers.get("x-check-token") ?? "";
    if (!token) return json({ error: "missing x-check-token" }, 401);

    // Il token dal 19/09/2026 sta nel Vault.
    const tokenSalvato = await leggiImpostazionePiattaforma("email_check_token");
    if (!tokenSalvato || tokenSalvato !== token) {
      return json({ error: "invalid token" }, 401);
    }

    const out: Record<string, unknown> = {};

    // ── Elastic Email (marketing) ──
    const eeKey = await getPlatformSetting("email_marketing_api_key");
    if (!eeKey) {
      out.elastic_email = { status: "unconfigured" };
    } else {
      const headers = { "X-ElasticEmail-ApiKey": eeKey };
      const [accRes, domRes] = await Promise.all([
        fetch("https://api.elasticemail.com/v4/account", { headers }),
        fetch("https://api.elasticemail.com/v4/domains", { headers }),
      ]);
      const acc = accRes.ok ? await accRes.json() : null;
      const domains = domRes.ok ? await domRes.json() : null;
      out.elastic_email = {
        status: accRes.ok ? "healthy" : `error ${accRes.status}`,
        account_email: acc?.Email ?? null,
        reputation: acc?.Reputation ?? null,
        domains_count: Array.isArray(domains) ? domains.length : null,
        domains: Array.isArray(domains)
          ? domains.map((d: Record<string, unknown>) => ({
            domain: d.Domain,
            spf: d.Spf,
            dkim: d.Dkim,
            verified: d.VerificationStatus ?? null,
          }))
          : null,
        error: accRes.ok ? null : (await accRes.text()).slice(0, 300),
      };
    }

    // ── Write-test EE: add + delete dominio fittizio (verifica permessi) ──
    const body = await req.json().catch(() => ({}));
    if (body?.test_domain_write && eeKey) {
      const testDomain = "eic-keycheck-test.example.com".replace(".example", "");
      const headers = {
        "Content-Type": "application/json",
        "X-ElasticEmail-ApiKey": eeKey,
      };
      const addRes = await fetch("https://api.elasticemail.com/v4/domains", {
        method: "POST",
        headers,
        body: JSON.stringify({ domain: testDomain }),
      });
      const addTxt = addRes.ok ? "" : (await addRes.text()).slice(0, 200);
      const delRes = await fetch(
        `https://api.elasticemail.com/v4/domains/${encodeURIComponent(testDomain)}`,
        { method: "DELETE", headers: { "X-ElasticEmail-ApiKey": eeKey } },
      );
      out.ee_domain_write_test = {
        add: addRes.ok || addRes.status === 409 ? "ok" : `error ${addRes.status}: ${addTxt}`,
        delete: delRes.ok ? "ok" : `error ${delRes.status}`,
      };
    }

    // ── Resend (transactional) ──
    const resendKey = await getPlatformSetting("email_transactional_api_key_resend")
      .then((v) => v || getPlatformSetting("email_transactional_api_key"));
    if (!resendKey) {
      out.resend = { status: "unconfigured" };
    } else {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${resendKey}` },
      });
      const data = res.ok ? await res.json() : null;
      out.resend = {
        status: res.ok ? "healthy" : `error ${res.status}`,
        domains_count: Array.isArray(data?.data) ? data.data.length : null,
        error: res.ok ? null : (await res.text()).slice(0, 300),
      };
    }

    return json({ success: true, ...out });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
