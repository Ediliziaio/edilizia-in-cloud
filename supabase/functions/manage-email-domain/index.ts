// Email Dual-Provider — Custom Sender Domain management per azienda.
//
// Actions (POST JSON body: { action, ... }):
//   - add_domain    → registers the domain on Elastic Email (marketing),
//                     SendGrid (transactional legacy) AND Resend (transactional
//                     default), saves the row and returns the DNS records.
//   - verify_domain → asks all 3 providers to validate DNS and refreshes
//                     per-record status + resend_status enum.
//   - remove_domain → deletes the domain on all 3 providers and drops the row.
//   - get_status    → current row for the given company (all DNS records +
//                     per-provider status + last_verified_at + attempt counters).
//
// Rate limiting via check_email_domain_rate_limit RPC:
//   - action='add' → max 3/h
//   - action='verify' → max 10/h

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
  /** Regione Resend (default eu-west-1). */
  region?: "us-east-1" | "eu-west-1" | "sa-east-1" | "ap-northeast-1";
}

interface ResendDnsRecord {
  type: string;
  name: string;
  value: string;
  priority?: number;
  verified?: boolean;
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
 * (Legacy pattern consistent with existing Sprint 7 function — we intentionally
 * do not tighten beyond it here to avoid breaking the SettingsEmailDomain UI.)
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

  // Membership check via profiles (user_roles does not have company_id column)
  const { data: profile } = await admin
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();

  if ((profile as { company_id?: string } | null)?.company_id !== companyId) {
    throw new Error("Non autorizzato");
  }

  // Must have company_admin role
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const isCompanyAdmin = (roles ?? []).some((r: { role: string }) =>
    r.role === "company_admin"
  );
  if (!isCompanyAdmin) throw new Error("Non autorizzato");

  return { userId: user.id, isSuperAdmin: false };
}

/**
 * Rate limiting wrapper: usa la RPC check_email_domain_rate_limit
 * (3 add/h, 10 verify/h per azienda).
 */
async function enforceRateLimit(
  admin: SupabaseClient,
  companyId: string,
  action: "add" | "verify",
): Promise<void> {
  try {
    const { data, error } = await admin.rpc("check_email_domain_rate_limit", {
      p_company_id: companyId,
      p_action: action,
    });
    if (error) {
      console.warn("rate-limit RPC error:", error.message);
      return; // fail-open: non blocciamo se la RPC non esiste ancora
    }
    if (data === false) {
      throw new Error(
        action === "add"
          ? "Limite raggiunto: massimo 3 domini aggiunti per ora."
          : "Limite raggiunto: massimo 10 tentativi di verifica per ora.",
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("Limite raggiunto")) throw e;
    // Silently continue on RPC missing (first deploy before migration)
  }
}

function buildDnsRecords(row: Record<string, unknown>): Array<{
  type: "TXT" | "CNAME" | "MX";
  host: string;
  value: string;
  priority?: number;
  purpose: string;
  provider: "elastic_email" | "sendgrid" | "resend";
  verified: boolean;
}> {
  const domain = String(row.domain ?? "");
  const recs: ReturnType<typeof buildDnsRecords> = [
    // ─── Elastic Email (marketing) ───
    {
      type: "TXT",
      host: domain,
      value: ELASTIC_SPF_VALUE,
      purpose: "SPF (marketing Elastic Email)",
      provider: "elastic_email",
      verified: Boolean(row.ee_spf_verified),
    },
    {
      type: "TXT",
      host: `api._domainkey.${domain}`,
      value: ELASTIC_DKIM_PUBLIC_KEY,
      purpose: "DKIM (marketing Elastic Email)",
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

  // ─── SendGrid (transactional legacy) ───
  for (let i = 1; i <= 3; i++) {
    const host = row[`sg_cname_${i}_host`];
    const value = row[`sg_cname_${i}_value`];
    const verified = Boolean(row[`sg_cname_${i}_valid`]);
    if (host && value) {
      recs.push({
        type: "CNAME",
        host: String(host),
        value: String(value),
        purpose: `SendGrid CNAME ${i} (transactional legacy, opzionale)`,
        provider: "sendgrid",
        verified,
      });
    }
  }

  // ─── Resend (transactional default, gestione via resend_dns_records JSONB) ───
  const resendRecords = Array.isArray(row.resend_dns_records)
    ? (row.resend_dns_records as ResendDnsRecord[])
    : [];
  for (const r of resendRecords) {
    recs.push({
      type: (r.type?.toUpperCase() as "TXT" | "CNAME" | "MX") || "TXT",
      host: r.name,
      value: r.value,
      priority: r.priority,
      purpose: `Resend ${r.type?.toUpperCase() || "TXT"} (transactional)`,
      provider: "resend",
      verified: Boolean(r.verified),
    });
  }

  return recs;
}

// ═══════════════════════════════════════════════════════════════════════════
// Provider API wrappers
// ═══════════════════════════════════════════════════════════════════════════

// ─── Elastic Email ──────────────────────────────────────────────────────────

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

// ─── SendGrid (legacy — kept for migration safety) ──────────────────────────

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

// ─── Resend (transactional default) ─────────────────────────────────────────

async function resendAddDomain(
  apiKey: string,
  domain: string,
  region: string,
): Promise<{ id: string; records: ResendDnsRecord[]; status: string }> {
  const res = await fetch("https://api.resend.com/domains", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: domain, region }),
  });
  if (!res.ok) {
    const txt = await res.text();
    // Resend 422 "already exists" → try lookup
    if (res.status === 422 && txt.includes("already exists")) {
      return await resendFindDomainByName(apiKey, domain);
    }
    throw new Error(`Resend addDomain ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const records: ResendDnsRecord[] = Array.isArray(data.records)
    ? data.records.map((r: Record<string, unknown>) => ({
      type: String(r.type ?? ""),
      name: String(r.name ?? ""),
      value: String(r.value ?? r.record ?? ""),
      priority: typeof r.priority === "number" ? r.priority : undefined,
      verified: r.status === "verified",
    }))
    : [];
  return {
    id: String(data.id),
    records,
    status: String(data.status ?? "pending"),
  };
}

async function resendFindDomainByName(
  apiKey: string,
  domain: string,
): Promise<{ id: string; records: ResendDnsRecord[]; status: string }> {
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Resend listDomains ${res.status}`);
  }
  const data = await res.json();
  const items: Array<Record<string, unknown>> = data.data ?? [];
  const found = items.find((it) => String(it.name) === domain);
  if (!found) throw new Error(`Resend: dominio "${domain}" non trovato dopo 422`);
  return await resendGetDomain(apiKey, String(found.id));
}

async function resendGetDomain(
  apiKey: string,
  domainId: string,
): Promise<{ id: string; records: ResendDnsRecord[]; status: string }> {
  const res = await fetch(`https://api.resend.com/domains/${domainId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend getDomain ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const records: ResendDnsRecord[] = Array.isArray(data.records)
    ? data.records.map((r: Record<string, unknown>) => ({
      type: String(r.type ?? ""),
      name: String(r.name ?? ""),
      value: String(r.value ?? r.record ?? ""),
      priority: typeof r.priority === "number" ? r.priority : undefined,
      verified: r.status === "verified",
    }))
    : [];
  return {
    id: String(data.id),
    records,
    status: String(data.status ?? "pending"),
  };
}

async function resendVerifyDomain(
  apiKey: string,
  domainId: string,
): Promise<{ id: string; records: ResendDnsRecord[]; status: string }> {
  // Trigger re-verification
  const trigRes = await fetch(
    `https://api.resend.com/domains/${domainId}/verify`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );
  if (!trigRes.ok && trigRes.status !== 429) {
    // 429 → troppo frequente, basta leggere lo stato corrente
    const txt = await trigRes.text();
    console.warn(`Resend verify trigger ${trigRes.status}: ${txt.slice(0, 200)}`);
  }
  // Poll stato corrente
  return await resendGetDomain(apiKey, domainId);
}

async function resendDeleteDomain(
  apiKey: string,
  domainId: string,
): Promise<void> {
  await fetch(`https://api.resend.com/domains/${domainId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// Action handlers
// ═══════════════════════════════════════════════════════════════════════════

async function actionAddDomain(
  admin: SupabaseClient,
  companyId: string,
  domain: string,
  region: string,
) {
  const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalized)) {
    throw new Error(`Dominio non valido: "${domain}"`);
  }

  await enforceRateLimit(admin, companyId, "add");

  const [eeKey, sgKey, resendKey] = await Promise.all([
    getPlatformSetting("email_marketing_api_key"),
    getPlatformSetting("email_transactional_api_key_sendgrid")
      .then((v) => v ?? getPlatformSetting("email_transactional_api_key")),
    getPlatformSetting("email_transactional_api_key_resend")
      .then((v) => v ?? getPlatformSetting("email_transactional_api_key_resend_key")),
  ]);

  if (!eeKey) throw new Error("Elastic Email API key non configurata (email_marketing_api_key)");
  if (!resendKey && !sgKey) {
    throw new Error(
      "Nessun provider transactional configurato (serve email_transactional_api_key_resend o email_transactional_api_key_sendgrid)",
    );
  }

  // 1. Register on Elastic Email (always — marketing stream)
  await eeAddDomain(eeKey, normalized);

  // 2. Register on Resend (new default) and SendGrid (legacy) in parallel
  const [resendResult, sgResult] = await Promise.allSettled([
    resendKey
      ? resendAddDomain(resendKey, normalized, region)
      : Promise.reject(new Error("Resend non configurato")),
    sgKey
      ? sgAddDomain(sgKey, normalized)
      : Promise.reject(new Error("SendGrid non configurato")),
  ]);

  const row: Record<string, unknown> = {
    company_id: companyId,
    domain: normalized,
    ee_domain_added: true,
    ee_spf_verified: false,
    ee_dkim_verified: false,
    ee_tracking_verified: false,
    last_verification_attempt_at: new Date().toISOString(),
    verification_attempts: 0,
  };

  if (resendResult.status === "fulfilled") {
    row.resend_domain_id = resendResult.value.id;
    row.resend_status = resendResult.value.status;
    row.resend_region = region;
    row.resend_dns_records = resendResult.value.records;
  } else {
    row.resend_status = "not_started";
    row.failure_reason = `Resend: ${String(resendResult.reason?.message ?? resendResult.reason)}`;
  }

  if (sgResult.status === "fulfilled") {
    const [c1, c2, c3] = sgResult.value.cnames;
    row.sg_domain_id = sgResult.value.id;
    row.sg_cname_1_host = c1?.host ?? null;
    row.sg_cname_1_value = c1?.value ?? null;
    row.sg_cname_2_host = c2?.host ?? null;
    row.sg_cname_2_value = c2?.value ?? null;
    row.sg_cname_3_host = c3?.host ?? null;
    row.sg_cname_3_value = c3?.value ?? null;
  }

  const { data, error } = await admin
    .from("company_email_domains")
    .upsert(row, { onConflict: "company_id,domain" })
    .select()
    .single();
  if (error) throw new Error(`DB upsert failed: ${error.message}`);

  return {
    domain_row: data,
    dns_records: buildDnsRecords(data as Record<string, unknown>),
    provider_errors: {
      resend: resendResult.status === "rejected" ? String(resendResult.reason?.message ?? resendResult.reason) : null,
      sendgrid: sgResult.status === "rejected" ? String(sgResult.reason?.message ?? sgResult.reason) : null,
    },
  };
}

async function actionVerifyDomain(
  admin: SupabaseClient,
  companyId: string,
  domain: string,
) {
  await enforceRateLimit(admin, companyId, "verify");

  const { data: row, error: rowErr } = await admin
    .from("company_email_domains")
    .select("*")
    .eq("company_id", companyId)
    .eq("domain", domain)
    .maybeSingle();
  if (rowErr) throw new Error(`DB read failed: ${rowErr.message}`);
  if (!row) throw new Error(`Dominio "${domain}" non trovato per questa azienda`);

  const [eeKey, sgKey, resendKey] = await Promise.all([
    getPlatformSetting("email_marketing_api_key"),
    getPlatformSetting("email_transactional_api_key_sendgrid")
      .then((v) => v ?? getPlatformSetting("email_transactional_api_key")),
    getPlatformSetting("email_transactional_api_key_resend"),
  ]);

  const updates: Record<string, unknown> = {
    last_verification_attempt_at: new Date().toISOString(),
    verification_attempts: (row.verification_attempts ?? 0) + 1,
  };
  const providerErrors: Record<string, string | null> = {
    elastic_email: null,
    sendgrid: null,
    resend: null,
  };

  // Verify all 3 providers in parallel
  const tasks: Array<Promise<void>> = [];

  if (eeKey) {
    tasks.push(
      eeVerifyDomain(eeKey, row.domain)
        .then((ee) => {
          updates.ee_spf_verified = ee.spf;
          updates.ee_dkim_verified = ee.dkim;
          updates.ee_tracking_verified = ee.tracking;
        })
        .catch((e) => {
          providerErrors.elastic_email = e instanceof Error ? e.message : String(e);
        }),
    );
  }

  if (sgKey && row.sg_domain_id) {
    tasks.push(
      sgValidateDomain(sgKey, row.sg_domain_id)
        .then((sg) => {
          updates.sg_cname_1_valid = sg.cname1;
          updates.sg_cname_2_valid = sg.cname2;
          updates.sg_cname_3_valid = sg.cname3;
        })
        .catch((e) => {
          providerErrors.sendgrid = e instanceof Error ? e.message : String(e);
        }),
    );
  }

  if (resendKey && row.resend_domain_id) {
    tasks.push(
      resendVerifyDomain(resendKey, row.resend_domain_id)
        .then((rd) => {
          updates.resend_status = rd.status;
          updates.resend_dns_records = rd.records;
        })
        .catch((e) => {
          providerErrors.resend = e instanceof Error ? e.message : String(e);
        }),
    );
  }

  await Promise.allSettled(tasks);

  const { data: updated, error: updErr } = await admin
    .from("company_email_domains")
    .update(updates)
    .eq("id", row.id)
    .select()
    .single();
  if (updErr) throw new Error(`DB update failed: ${updErr.message}`);

  // Auto-activate when verified (GENERATED column is_verified already recomputed)
  if (updated.is_verified && !updated.is_active) {
    const { data: activated } = await admin
      .from("company_email_domains")
      .update({ is_active: true, verified_at: new Date().toISOString(), last_verified_at: new Date().toISOString() })
      .eq("id", row.id)
      .select()
      .single();
    return {
      domain_row: activated ?? updated,
      dns_records: buildDnsRecords(activated ?? updated),
      provider_errors: providerErrors,
    };
  }

  return {
    domain_row: updated,
    dns_records: buildDnsRecords(updated),
    provider_errors: providerErrors,
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
    const [eeKey, sgKey, resendKey] = await Promise.all([
      getPlatformSetting("email_marketing_api_key"),
      getPlatformSetting("email_transactional_api_key_sendgrid")
        .then((v) => v ?? getPlatformSetting("email_transactional_api_key")),
      getPlatformSetting("email_transactional_api_key_resend"),
    ]);

    await Promise.allSettled([
      eeKey ? eeDeleteDomain(eeKey, row.domain) : Promise.resolve(),
      sgKey && row.sg_domain_id ? sgDeleteDomain(sgKey, row.sg_domain_id) : Promise.resolve(),
      resendKey && row.resend_domain_id ? resendDeleteDomain(resendKey, row.resend_domain_id) : Promise.resolve(),
    ]);

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

// ═══════════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════════

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

    const region = body.region ?? "eu-west-1";

    switch (body.action) {
      case "add_domain": {
        if (!body.domain) return json({ error: "domain is required" }, 400);
        const res = await actionAddDomain(admin, body.company_id, body.domain, region);
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
