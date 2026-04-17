// Sprint 7 — Custom Sender Domain management for companies.
//
// Actions (POST JSON body: { action, ... }):
//   - add_domain    → registers the domain on Elastic Email + SendGrid, saves
//                     the row and returns the DNS records the customer needs
//                     to add to their DNS panel.
//   - verify_domain → asks both providers to validate the DNS and refreshes
//                     per-record status. When every record is green, flips
//                     `is_active = true` and sets `verified_at`.
//   - remove_domain → deletes the domain on both providers and drops the row.
//   - get_status    → current row for the given company (all DNS records +
//                     per-provider status).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

const ELASTIC_DKIM_PUBLIC_KEY =
  "k=rsa;t=s;p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCbmGbQMzYeMvxwtNQoXN0waGYaciuKx8mtMh5czguT4EZlJXuCt6V+l56mmt3t68FEX5JJ0q4ijG71BGoFRkl87uJi7LrQt1ZZmZCvrEII0YO4mp8sDLXC8g1aUAoi8TJgxq2MJqCaMyj5kAm3Fdy2tzftPCV/lbdiJqmBnWKjtwIDAQAB";
const ELASTIC_SPF_VALUE = "v=spf1 a mx include:_spf.elasticemail.com ~all";

type Action = "add_domain" | "verify_domain" | "remove_domain" | "get_status";

interface RequestBody {
  action: Action;
  company_id: string;
  domain?: string;
}

function buildAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function buildUserClient(authHeader: string): Promise<SupabaseClient> {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

/**
 * Authorize caller: either super_admin OR company member with company_admin role.
 */
async function authorize(
  userClient: SupabaseClient,
  admin: SupabaseClient,
  companyId: string,
): Promise<{ userId: string; isSuperAdmin: boolean }> {
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: isSA } = await admin.rpc("has_role" as never, {
    _user_id: user.id,
    _role: "super_admin",
  } as never);

  if (isSA === true) return { userId: user.id, isSuperAdmin: true };

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("company_id", companyId);

  const allowed = (roles ?? []).some((r: { role: string }) =>
    r.role === "company_admin"
  );
  if (!allowed) throw new Error("Non autorizzato");

  return { userId: user.id, isSuperAdmin: false };
}

function buildDnsRecords(row: Record<string, unknown>): Array<{
  type: "TXT" | "CNAME";
  host: string;
  value: string;
  purpose: string;
  provider: "elastic_email" | "sendgrid";
  verified: boolean;
}> {
  const domain = String(row.domain ?? "");
  const recs: ReturnType<typeof buildDnsRecords> = [
    {
      type: "TXT",
      host: domain,
      value: ELASTIC_SPF_VALUE,
      purpose: "SPF (marketing)",
      provider: "elastic_email",
      verified: Boolean(row.ee_spf_verified),
    },
    {
      type: "TXT",
      host: `api._domainkey.${domain}`,
      value: ELASTIC_DKIM_PUBLIC_KEY,
      purpose: "DKIM (marketing)",
      provider: "elastic_email",
      verified: Boolean(row.ee_dkim_verified),
    },
    {
      type: "CNAME",
      host: `tracking.${domain}`,
      value: "api.elasticemail.com",
      purpose: "Tracking link (marketing, opzionale)",
      provider: "elastic_email",
      verified: Boolean(row.ee_tracking_verified),
    },
  ];
  for (let i = 1; i <= 3; i++) {
    const host = row[`sg_cname_${i}_host`];
    const value = row[`sg_cname_${i}_value`];
    const verified = Boolean(row[`sg_cname_${i}_valid`]);
    if (host && value) {
      recs.push({
        type: "CNAME",
        host: String(host),
        value: String(value),
        purpose: `SendGrid CNAME ${i} (transactional, SPF+DKIM automatici)`,
        provider: "sendgrid",
        verified,
      });
    }
  }
  return recs;
}

// ─── Provider API wrappers ────────────────────────────────────────────────────

async function eeAddDomain(apiKey: string, domain: string): Promise<void> {
  const res = await fetch("https://api.elasticemail.com/v4/domains", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ElasticEmail-ApiKey": apiKey,
    },
    body: JSON.stringify({ domain }),
  });
  if (!res.ok && res.status !== 409) {
    const txt = await res.text();
    throw new Error(`Elastic Email addDomain ${res.status}: ${txt.slice(0, 300)}`);
  }
}

async function eeVerifyDomain(apiKey: string, domain: string): Promise<{
  spf: boolean;
  dkim: boolean;
  tracking: boolean;
}> {
  const res = await fetch(
    `https://api.elasticemail.com/v4/domains/${encodeURIComponent(domain)}/verification`,
    {
      method: "PUT",
      headers: { "X-ElasticEmail-ApiKey": apiKey },
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Elastic Email verify ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => ({}));
  // Response shape: { Spf: bool, Dkim: bool, TrackingStatus: bool/enum }
  return {
    spf: Boolean(data.Spf ?? data.SPF ?? data.spf),
    dkim: Boolean(data.Dkim ?? data.DKIM ?? data.dkim),
    tracking: Boolean(
      data.Tracking ?? data.TrackingStatus ?? data.tracking_ok ?? false,
    ),
  };
}

async function eeDeleteDomain(apiKey: string, domain: string): Promise<void> {
  await fetch(
    `https://api.elasticemail.com/v4/domains/${encodeURIComponent(domain)}`,
    { method: "DELETE", headers: { "X-ElasticEmail-ApiKey": apiKey } },
  );
}

async function sgAddDomain(apiKey: string, domain: string): Promise<{
  id: string;
  cnames: Array<{ host: string; value: string }>;
}> {
  const res = await fetch("https://api.sendgrid.com/v3/whitelabel/domains", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      domain,
      subdomain: "em",
      automatic_security: true,
      default: false,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SendGrid addDomain ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const cnames: Array<{ host: string; value: string }> = [];
  const dns = data.dns ?? {};
  for (const key of Object.keys(dns)) {
    const rec = dns[key];
    if (rec?.host && rec?.data && (rec.type ?? "").toLowerCase() === "cname") {
      cnames.push({ host: String(rec.host), value: String(rec.data) });
    }
  }
  return { id: String(data.id), cnames };
}

async function sgValidateDomain(
  apiKey: string,
  sgDomainId: string,
): Promise<{ cname1: boolean; cname2: boolean; cname3: boolean }> {
  const res = await fetch(
    `https://api.sendgrid.com/v3/whitelabel/domains/${sgDomainId}/validate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SendGrid validate ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  // Shape: { valid: bool, validation_results: { mail_cname, dkim1, dkim2 } }
  const vr = data.validation_results ?? {};
  return {
    cname1: Boolean(vr.mail_cname?.valid ?? vr.cname1?.valid),
    cname2: Boolean(vr.dkim1?.valid ?? vr.cname2?.valid),
    cname3: Boolean(vr.dkim2?.valid ?? vr.cname3?.valid),
  };
}

async function sgDeleteDomain(apiKey: string, sgDomainId: string): Promise<void> {
  await fetch(
    `https://api.sendgrid.com/v3/whitelabel/domains/${sgDomainId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${apiKey}` } },
  );
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function actionAddDomain(
  admin: SupabaseClient,
  companyId: string,
  domain: string,
) {
  const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalized)) {
    throw new Error(`Dominio non valido: "${domain}"`);
  }

  const eeKey = await getPlatformSetting("email_marketing_api_key");
  const sgKey = await getPlatformSetting("email_transactional_api_key");
  if (!eeKey) throw new Error("Elastic Email API key non configurata in platform_settings");
  if (!sgKey) throw new Error("SendGrid API key non configurata in platform_settings");

  // 1. Register on Elastic Email (idempotent — ignores 409)
  await eeAddDomain(eeKey, normalized);

  // 2. Register on SendGrid — returns an id + 3 CNAMEs
  const sg = await sgAddDomain(sgKey, normalized);
  const [c1, c2, c3] = sg.cnames;

  // 3. Upsert the row
  const row = {
    company_id: companyId,
    domain: normalized,
    ee_domain_added: true,
    ee_spf_verified: false,
    ee_dkim_verified: false,
    ee_tracking_verified: false,
    sg_domain_id: sg.id,
    sg_cname_1_host: c1?.host ?? null,
    sg_cname_1_value: c1?.value ?? null,
    sg_cname_2_host: c2?.host ?? null,
    sg_cname_2_value: c2?.value ?? null,
    sg_cname_3_host: c3?.host ?? null,
    sg_cname_3_value: c3?.value ?? null,
  };

  const { data, error } = await admin
    .from("company_email_domains")
    .upsert(row, { onConflict: "company_id,domain" })
    .select()
    .single();
  if (error) throw new Error(`DB upsert failed: ${error.message}`);

  return {
    domain_row: data,
    dns_records: buildDnsRecords(data as Record<string, unknown>),
  };
}

async function actionVerifyDomain(
  admin: SupabaseClient,
  companyId: string,
  domain: string,
) {
  const { data: row, error: rowErr } = await admin
    .from("company_email_domains")
    .select("*")
    .eq("company_id", companyId)
    .eq("domain", domain)
    .maybeSingle();
  if (rowErr) throw new Error(`DB read failed: ${rowErr.message}`);
  if (!row) throw new Error(`Dominio "${domain}" non trovato per questa azienda`);

  const eeKey = await getPlatformSetting("email_marketing_api_key");
  const sgKey = await getPlatformSetting("email_transactional_api_key");

  const updates: Record<string, unknown> = {};

  // Elastic Email
  if (eeKey) {
    try {
      const ee = await eeVerifyDomain(eeKey, row.domain);
      updates.ee_spf_verified = ee.spf;
      updates.ee_dkim_verified = ee.dkim;
      updates.ee_tracking_verified = ee.tracking;
    } catch (e) {
      console.warn("EE verify failed:", e);
    }
  }

  // SendGrid
  if (sgKey && row.sg_domain_id) {
    try {
      const sg = await sgValidateDomain(sgKey, row.sg_domain_id);
      updates.sg_cname_1_valid = sg.cname1;
      updates.sg_cname_2_valid = sg.cname2;
      updates.sg_cname_3_valid = sg.cname3;
    } catch (e) {
      console.warn("SG validate failed:", e);
    }
  }

  // Compute whether we're now verified (is_verified is GENERATED, so we
  // re-fetch after update to read the stored value).
  const { data: updated, error: updErr } = await admin
    .from("company_email_domains")
    .update(updates)
    .eq("id", row.id)
    .select()
    .single();
  if (updErr) throw new Error(`DB update failed: ${updErr.message}`);

  // Auto-activate when verified
  if (updated.is_verified && !updated.is_active) {
    const { data: activated } = await admin
      .from("company_email_domains")
      .update({ is_active: true, verified_at: new Date().toISOString() })
      .eq("id", row.id)
      .select()
      .single();
    return {
      domain_row: activated ?? updated,
      dns_records: buildDnsRecords(activated ?? updated),
    };
  }

  return {
    domain_row: updated,
    dns_records: buildDnsRecords(updated),
  };
}

async function actionRemoveDomain(
  admin: SupabaseClient,
  companyId: string,
  domain: string,
) {
  const { data: row } = await admin
    .from("company_email_domains")
    .select("*")
    .eq("company_id", companyId)
    .eq("domain", domain)
    .maybeSingle();

  if (row) {
    const eeKey = await getPlatformSetting("email_marketing_api_key");
    const sgKey = await getPlatformSetting("email_transactional_api_key");
    if (eeKey) await eeDeleteDomain(eeKey, row.domain).catch(() => {});
    if (sgKey && row.sg_domain_id) {
      await sgDeleteDomain(sgKey, row.sg_domain_id).catch(() => {});
    }

    await admin
      .from("company_email_domains")
      .delete()
      .eq("id", row.id);
  }

  return { removed: true };
}

async function actionGetStatus(admin: SupabaseClient, companyId: string) {
  const { data: rows } = await admin
    .from("company_email_domains")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  return {
    domains: (rows ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      dns_records: buildDnsRecords(r),
    })),
  };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as RequestBody;
    if (!body.action || !body.company_id) {
      return json({ error: "action and company_id are required" }, 400);
    }

    const admin = buildAdmin();
    const userClient = await buildUserClient(authHeader);
    await authorize(userClient, admin, body.company_id);

    switch (body.action) {
      case "add_domain": {
        if (!body.domain) return json({ error: "domain is required" }, 400);
        const res = await actionAddDomain(admin, body.company_id, body.domain);
        return json({ success: true, ...res });
      }
      case "verify_domain": {
        if (!body.domain) return json({ error: "domain is required" }, 400);
        const res = await actionVerifyDomain(admin, body.company_id, body.domain);
        return json({ success: true, ...res });
      }
      case "remove_domain": {
        if (!body.domain) return json({ error: "domain is required" }, 400);
        const res = await actionRemoveDomain(admin, body.company_id, body.domain);
        return json({ success: true, ...res });
      }
      case "get_status": {
        const res = await actionGetStatus(admin, body.company_id);
        return json({ success: true, ...res });
      }
      default:
        return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("manage-email-domain error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === "Unauthorized" || msg === "Non autorizzato" ? 401 : 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
