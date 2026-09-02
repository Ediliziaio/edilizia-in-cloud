/**
 * email-ai-deliverability v2 — SPF/DKIM/DMARC: presenti E giusti.
 *
 * v1 diceva solo "c'è / non c'è" e guardava una casella sola. Ora, per OGNI
 * dominio delle caselle collegate (o per un dominio indicato):
 *   - MX     → deduce il provider di posta (Google, Microsoft, Aruba…)
 *   - SPF    → record unico? `all` corretto? include del provider presente? ≤10 lookup?
 *   - DKIM   → selettori del provider + comuni; chiave vuota = revocata
 *   - DMARC  → policy presente; p=none segnalato come debole
 * La logica di giudizio è in _shared/emailAuth.ts (pura, testata con vitest).
 * DNS via DNS-over-HTTPS (Google). Salva lo stato in domini_invio.
 *
 * POST { domain?: string, all?: boolean } · Auth: Bearer (RLS via userClient).
 * Risposta compat v1 (spf_ok/dkim_ok/dmarc_ok…) + `stati`, `problemi`, `domini[]`.
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import {
  analizzaSpf, analizzaDkim, analizzaDmarc, providerDaMx, providerDaConnessione,
  INCLUDE_ATTESO, etichettaProvider, type ProviderPosta,
} from "../_shared/emailAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SELETTORI_COMUNI = ["default", "google", "selector1", "selector2", "k1", "dkim", "mail", "smtp", "s1", "s2", "mandrill", "sib", "aruba", "dkim1", "key1", "zoho", "protonmail", "ovhmo"];

async function dohLookup(name: string, type: "TXT" | "MX"): Promise<string[]> {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.Answer as any[]) || [])
      .filter((a) => (type === "TXT" ? a.type === 16 : a.type === 15))
      .map((a) => String(a.data || "").replace(/^"|"$/g, "").replace(/"\s+"/g, ""));
  } catch { return []; }
}

interface Casella { email_address: string; provider: string | null; imap_host: string | null; smtp_host: string | null; is_pec: boolean | null }

async function verificaDominio(domain: string, caselle: Casella[]) {
  // Provider: esplicito dalla connessione se possibile, altrimenti dagli MX.
  const mx = (await dohLookup(domain, "MX")).map((m) => m.replace(/^\d+\s+/, ""));
  let provider: ProviderPosta = providerDaMx(mx);
  for (const c of caselle) {
    const p = providerDaConnessione(c.provider, c.smtp_host ?? c.imap_host);
    if (p) { provider = p; break; }
  }

  const spf = analizzaSpf(await dohLookup(domain, "TXT"), provider);
  const dmarc = analizzaDmarc(await dohLookup(`_dmarc.${domain}`, "TXT"));

  // DKIM: prima i selettori del provider dedotto, poi quelli comuni.
  const attesi = provider !== "altro" ? INCLUDE_ATTESO[provider].selettori : [];
  const selettori = [...new Set([...attesi, ...SELETTORI_COMUNI])];
  const risultatiDkim: Array<{ selettore: string; txt: string[] }> = [];
  for (const sel of selettori) {
    const txt = await dohLookup(`${sel}._domainkey.${domain}`, "TXT");
    if (txt.length > 0) { risultatiDkim.push({ selettore: sel, txt }); break; }
  }
  const dkim = analizzaDkim(risultatiDkim);

  const pec = caselle.some((c) => c.is_pec);
  // MX: un dominio che non riceve posta è sospetto per i filtri antispam
  // (e i bounce/reply non tornano indietro).
  const mx_ok = mx.length > 0;
  const problemiMx = mx_ok ? [] : ["Il dominio non ha record MX: non riceve posta. I filtri antispam penalizzano i mittenti che non possono ricevere risposte."];
  const problemi = [...problemiMx, ...spf.problemi, ...dkim.problemi, ...dmarc.problemi];
  // Punteggio 0-100 leggibile dal titolare: SPF 35, DKIM 30, DMARC 20, MX 15.
  const punteggio =
    (spf.stato === "ok" ? 35 : spf.stato === "errato" ? 10 : 0) +
    (dkim.stato === "ok" ? 30 : 0) +
    (dmarc.stato === "ok" ? 20 : dmarc.stato === "debole" ? 12 : 0) +
    (mx_ok ? 15 : 0);
  const rischio_spam: "basso" | "medio" | "alto" = punteggio >= 85 ? "basso" : punteggio >= 55 ? "medio" : "alto";
  const suggeriti = {
    spf: spf.stato === "ok" ? null : {
      tipo: "TXT", host: "@",
      valore: provider !== "altro" ? `v=spf1 include:${INCLUDE_ATTESO[provider].include} ~all` : "v=spf1 include:_spf.tuoprovider.it ~all",
      nota: provider !== "altro" ? `Include di ${etichettaProvider(provider)} (rilevato dagli MX). Se spedisci anche da altri sistemi, aggiungi i loro include.` : "Sostituisci con l'include del tuo provider di invio.",
    },
    dkim: dkim.stato === "ok" ? null : {
      tipo: "TXT", host: attesi[0] ? `${attesi[0]}._domainkey` : "<selettore>._domainkey",
      valore: "(chiave pubblica fornita dal provider di posta)",
      nota: provider !== "altro" ? `Attiva DKIM nel pannello ${etichettaProvider(provider)} e pubblica il record che ti dà.` : "Attiva il DKIM nel pannello del provider e copia qui il record.",
    },
    dmarc: dmarc.stato === "ok" || dmarc.stato === "debole" ? null : {
      tipo: "TXT", host: "_dmarc",
      valore: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
      nota: "Parti da p=none (monitoraggio), poi quarantine, poi reject.",
    },
  };

  return {
    dominio: domain, provider_posta: provider, provider_label: etichettaProvider(provider), pec,
    caselle: caselle.map((c) => c.email_address),
    // compat v1
    spf_ok: spf.stato === "ok", dkim_ok: dkim.stato === "ok", dmarc_ok: dmarc.stato === "ok" || dmarc.stato === "debole",
    dkim_selector: dkim.selettore, dmarc_policy: dmarc.policy,
    // v2
    stati: { spf: spf.stato, dkim: dkim.stato, dmarc: dmarc.stato },
    mx_ok, mx, punteggio, rischio_spam,
    record: { spf: spf.record, dkim: dkim.record, dmarc: dmarc.record },
    problemi, suggeriti,
  };
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
    const domainRichiesto: string = (body.domain || "").toString().toLowerCase().trim().replace(/^@/, "");
    const tutti = body.all === true;

    // Caselle collegate visibili all'utente (RLS): raggruppate per dominio.
    const { data: conns } = await userClient
      .from("email_oauth_connections")
      .select("email_address, company_id, provider, imap_host, smtp_host, is_pec")
      .limit(50);
    const companyId: string | null = (conns as any[])?.[0]?.company_id ?? null;
    const perDominio = new Map<string, Casella[]>();
    for (const c of (conns as any[]) ?? []) {
      const d = String(c.email_address || "").toLowerCase().match(/@([^@\s>]+)/)?.[1];
      if (!d) continue;
      if (!perDominio.has(d)) perDominio.set(d, []);
      perDominio.get(d)!.push(c);
    }

    let domini: string[];
    if (domainRichiesto) domini = [domainRichiesto];
    else if (tutti) domini = [...perDominio.keys()];
    else domini = perDominio.size > 0 ? [[...perDominio.keys()][0]] : [];
    if (domini.length === 0) return json({ error: "domain_richiesto", reason: "Nessun dominio mittente rilevato. Indicane uno." }, 400, cors);

    const risultati = [];
    for (const d of domini) {
      const r = await verificaDominio(d, perDominio.get(d) ?? []);
      risultati.push(r);
      if (companyId) {
        await supabase.from("domini_invio").upsert({
          company_id: companyId, dominio: d,
          spf_ok: r.spf_ok, dkim_ok: r.dkim_ok, dmarc_ok: r.dmarc_ok, dmarc_policy: r.dmarc_policy, dkim_selector: r.dkim_selector,
          spf_stato: r.stati.spf, dkim_stato: r.stati.dkim, dmarc_stato: r.stati.dmarc, provider_posta: r.provider_posta,
          problemi: r.problemi, ultimo_check_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }, { onConflict: "company_id,dominio" }).then(() => {}, () => {});
      }
    }

    // Compat v1: i campi del primo dominio in cima, tutti in `domini`.
    return json({ ok: true, ...risultati[0], domini: risultati }, 200, cors);
  } catch (e) {
    console.error("[email-ai-deliverability] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500, cors);
  }
});

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
