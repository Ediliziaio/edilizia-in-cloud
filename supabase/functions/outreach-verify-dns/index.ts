import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { NOME_SONDA_DKIM, selettoriDaNsec } from "../_shared/dkimNsec.ts";

/**
 * outreach-verify-dns — stato DNS REALE (SPF / DKIM / DMARC) di un dominio
 * mittente, letto dai record pubblici. Prima si chiedeva solo all'API Elastic
 * Email: un dominio Google Workspace, Register o Aruba (che non passa da EE)
 * non diventava mai "attivo". Se la chiave EE c'e', il suo verdetto si somma
 * (OR) a quello del DNS.
 */

const DKIM_SELECTORS = [
  "google", "default", "selector1", "selector2", "k1", "k2", "k3", "dkim", "mail", "s1", "s2",
  "smtp", "email", "api", "mx", "krs", "fm1", "fm2", "fm3", "protonmail", "zoho", "aruba", "register",
  "ee", "everlytickey1", "everlytickey2", "mandrill", "sendgrid", "mailjet", "amazonses", "pm", "hs1", "hs2",
];

async function txt(name: string): Promise<string[]> {
  try {
    const r = await Deno.resolveDns(name, "TXT");
    return r.map((parts) => parts.join(""));
  } catch { return []; }
}
async function cname(name: string): Promise<string | null> {
  try {
    const r = await Deno.resolveDns(name, "CNAME");
    return r[0] ?? null;
  } catch { return null; }
}

async function selettorePubblicato(domain: string, sel: string): Promise<boolean> {
  const name = `${sel}._domainkey.${domain}`;
  const t = await txt(name);
  if (t.some((v) => /v=DKIM1|p=/i.test(v))) return true;
  return !!(await cname(name));
}

async function selettoreDaNsec(domain: string): Promise<string | null> {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${NOME_SONDA_DKIM}._domainkey.${domain}&type=TXT&do=1`, {
      headers: { accept: "application/dns-json" },
    });
    if (!res.ok) return null;
    const risposta = await res.json();
    for (const sel of selettoriDaNsec(risposta?.Authority, domain)) {
      if (await selettorePubblicato(domain, sel)) return sel;
    }
  } catch { /* DoH non raggiungibile: restano i selettori noti */ }
  return null;
}

async function dkimSelector(domain: string, manuale?: string | null): Promise<string | null> {
  // Register (e altri) generano un selettore univoco per dominio: se l'operatore
  // lo ha scritto sul dominio, si prova quello per primo.
  const m = (manuale ?? "").trim().toLowerCase().replace(/\._domainkey.*$/, "");
  if (m && await selettorePubblicato(domain, m)) return m;
  // Senza selettore scritto: se la zona è firmata DNSSEC lo nomina il record
  // NSEC (vedi _shared/dkimNsec.ts). Una domanda sola, prima della lista.
  const daNsec = await selettoreDaNsec(domain);
  if (daNsec) return daNsec;
  for (const sel of DKIM_SELECTORS) {
    const name = `${sel}._domainkey.${domain}`;
    const t = await txt(name);
    if (t.some((v) => /v=DKIM1|p=/i.test(v))) return sel;
    if (await cname(name)) return sel;
  }
  return null;
}

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
      .select("id,domain,status,spf_verified,dkim_verified,dmarc_verified,notes,dkim_selector")
      .eq("id", domainId).maybeSingle();
    if (rErr) throw rErr;
    if (!row) return errorResponse("Dominio non trovato", 404, corsH);
    const domain = String(row.domain).toLowerCase().trim();
    // Selettore scritto a mano (dal pannello): si salva e si usa per primo.
    const selettoreManuale = typeof body?.dkim_selector === "string"
      ? body.dkim_selector.trim().toLowerCase().replace(/\._domainkey.*$/, "") || null
      : (row.dkim_selector ?? null);

    // 1. DNS reale
    const spfRec = (await txt(domain)).find((v) => /^v=spf1/i.test(v.trim())) ?? null;
    const dmarcRec = (await txt(`_dmarc.${domain}`)).find((v) => /^v=DMARC1/i.test(v.trim())) ?? null;
    const selector = await dkimSelector(domain, selettoreManuale);
    let spf = !!spfRec;
    let dkim = !!selector;
    const dmarc = !!dmarcRec;
    const fonti: string[] = ["dns"];

    // 2. Elastic Email (facoltativo): il suo verdetto si somma
    const eeKey = await getPlatformSetting("email_marketing_api_key");
    if (eeKey) {
      try {
        const res = await fetch("https://api.elasticemail.com/v4/domains", { headers: { "X-ElasticEmail-ApiKey": eeKey } });
        if (res.ok) {
          const domains = await res.json().catch(() => []);
          const match = Array.isArray(domains)
            ? domains.find((d: Record<string, unknown>) => String(d.Domain ?? "").toLowerCase() === domain) : null;
          if (match) {
            spf = spf || Boolean(match.Spf ?? match.SpfVerified ?? false);
            dkim = dkim || Boolean(match.Dkim ?? match.DkimVerified ?? false);
            fonti.push("elastic_email");
          }
        }
      } catch { /* EE giu' o piano scaduto: vale il DNS */ }
    }

    const ready = spf && dkim;
    const status = ready ? "active" : "verifying";
    const nowIso = new Date().toISOString();
    const dettagli = [
      spfRec ? `SPF: ${spfRec.slice(0, 80)}` : "SPF: assente",
      selector ? `DKIM: selettore "${selector}"` : (selettoreManuale ? `DKIM: il selettore "${selettoreManuale}" non risulta pubblicato` : "DKIM: nessun selettore noto trovato (scrivi quello del provider sul dominio)"),
      dmarcRec ? `DMARC: ${dmarcRec.slice(0, 80)}` : "DMARC: assente (consigliato p=none con rua)",
    ].join(" · ");
    const { error: uErr } = await admin.from("outreach_sending_domains").update({
      spf_verified: spf, dkim_verified: dkim, dmarc_verified: dmarc, status, updated_at: nowIso,
      dkim_selector: selector ?? selettoreManuale,
      notes: `Verifica ${nowIso.slice(0, 16).replace("T", " ")} (${fonti.join("+")}): ${dettagli}`,
    }).eq("id", row.id);
    if (uErr) throw uErr;

    return jsonResponse({
      ok: true, found: true, domain, spf_verified: spf, dkim_verified: dkim, dmarc_verified: dmarc,
      dkim_selector: selector, status, fonti, dettagli,
      message: ready
        ? (dmarc ? "Dominio pronto: SPF, DKIM e DMARC trovati." : "SPF e DKIM ok. Aggiungi il record DMARC (_dmarc) prima di partire.")
        : `Manca ${[!spf && "SPF", !dkim && "DKIM"].filter(Boolean).join(" e ")}: il dominio non puo' ancora spedire.`,
    }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-verify-dns error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
