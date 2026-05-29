/**
 * email-ai-deliverability — MP-EMAIL-AI-15 · Verifica DNS reale SPF/DKIM/DMARC
 *
 * Interroga il DNS pubblico (DNS-over-HTTPS, Google) per il dominio mittente:
 *   - SPF:   TXT su <dominio> con v=spf1
 *   - DMARC: TXT su _dmarc.<dominio> con v=DMARC1 (+ policy p=)
 *   - DKIM:  TXT su <selettore>._domainkey.<dominio> (prova selettori comuni)
 * Verifica, non fiducia. Nessun segreto. Salva lo stato in domini_invio.
 *
 * Endpoint POST: { domain?: string }  · Auth: Bearer (staff interno, RLS).
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DKIM_SELECTORS = ["default", "google", "selector1", "selector2", "k1", "dkim", "mail", "smtp", "s1", "s2", "mandrill", "sib"];

async function txtLookup(name: string): Promise<string[]> {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`, {
      headers: { accept: "application/dns-json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.Answer as any[]) || []).map((a) => (a.data || "").replace(/^"|"$/g, "").replace(/" "/g, ""));
  } catch { return []; }
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Auth required" }, 401, cors);
    const { data: u } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!u.user) return json({ error: "Invalid token" }, 401, cors);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = await req.json().catch(() => ({}));
    let domain: string = (body.domain || "").toString().toLowerCase().trim().replace(/^@/, "");

    // Auto-detect dal dominio delle caselle collegate (RLS via userClient).
    let companyId: string | null = null;
    const { data: conns } = await userClient
      .from("email_oauth_connections").select("email_address, company_id").limit(20);
    if ((conns as any[])?.length) {
      companyId = (conns as any[])[0].company_id;
      if (!domain) {
        const d = ((conns as any[])[0].email_address || "").toLowerCase().match(/@([^@\s>]+)/)?.[1];
        if (d) domain = d;
      }
    }
    if (!domain) return json({ error: "domain_richiesto", reason: "Nessun dominio mittente rilevato. Indicane uno." }, 400, cors);

    // SPF
    const spfTxt = await txtLookup(domain);
    const spf_ok = spfTxt.some((t) => /v=spf1/i.test(t));

    // DMARC
    const dmarcTxt = await txtLookup(`_dmarc.${domain}`);
    const dmarcRec = dmarcTxt.find((t) => /v=DMARC1/i.test(t));
    const dmarc_ok = !!dmarcRec;
    const dmarc_policy = dmarcRec?.match(/\bp=\s*(none|quarantine|reject)/i)?.[1]?.toLowerCase() ?? null;

    // DKIM (prova selettori comuni)
    let dkim_ok = false; let dkim_selector: string | null = null;
    for (const sel of DKIM_SELECTORS) {
      const t = await txtLookup(`${sel}._domainkey.${domain}`);
      if (t.some((x) => /v=DKIM1|k=rsa|p=[A-Za-z0-9+/]/.test(x))) { dkim_ok = true; dkim_selector = sel; break; }
    }

    // Salva stato (service role)
    if (companyId) {
      await supabase.from("domini_invio").upsert({
        company_id: companyId, dominio: domain, spf_ok, dkim_ok, dmarc_ok, dmarc_policy, dkim_selector,
        ultimo_check_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "company_id,dominio" }).then(() => {}, () => {});
    }

    // Record consigliati (valori generici copiabili; DKIM è gestito dal provider).
    const suggeriti = {
      spf: spf_ok ? null : { tipo: "TXT", host: "@", valore: "v=spf1 include:_spf.tuoprovider.it ~all", nota: "Sostituisci con l'include del tuo provider di invio." },
      dmarc: dmarc_ok ? null : { tipo: "TXT", host: "_dmarc", valore: "v=DMARC1; p=none; rua=mailto:dmarc@" + domain, nota: "Parti da p=none (monitoraggio), poi quarantine, poi reject." },
      dkim: dkim_ok ? null : { tipo: "TXT", host: "<selettore>._domainkey", valore: "(chiave pubblica fornita dal provider di invio)", nota: "Attiva il DKIM nel pannello del provider e copia qui il record." },
    };

    return json({ ok: true, dominio: domain, spf_ok, dkim_ok, dkim_selector, dmarc_ok, dmarc_policy, suggeriti }, 200, cors);
  } catch (e) {
    console.error("[email-ai-deliverability] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500, cors);
  }
});

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
