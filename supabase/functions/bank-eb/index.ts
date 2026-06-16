// ============================================================================
// bank-eb — Open Banking (Enable Banking AIS) per EiC
// ============================================================================
// Collegamento conti correnti + import movimenti, per azienda.
// Auth: JWT utente (requireAuth). company_id risolto dal profilo.
// Secret project-wide: ENABLE_BANKING_APP_ID, ENABLE_BANKING_PRIVATE_KEY (PEM PKCS8).
// Azioni (body { action, ... }):
//   - list-aspsps                → banche disponibili (country IT)
//   - start-auth { aspsp_name }  → crea consenso, salva bank_connections, ritorna { url }
//   - finalize { code, state }   → POST /sessions, salva accounts, ritorna { ok, debug }
//   - sync { connection_id }     → import transactions → bank_transactions
// NB: finalize/sync ritornano "debug" col raw Enable Banking per rifinire le
//     mappature al primo test su Mock ASPSP (sandbox), poi si possono togliere.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EB = "https://api.enablebanking.com";
const REDIRECT_URL = "https://app.ediliziaincloud.com/azienda/impostazioni/integrazioni";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors });
}

// ── JWT RS256 firmato con la chiave Enable Banking ──────────────────────────
function b64url(bytes: Uint8Array): string {
  let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlStr(str: string): string { return b64url(new TextEncoder().encode(str)); }
function pemToDer(pem: string): Uint8Array {
  const b = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const bin = atob(b); const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}
let cachedKey: CryptoKey | null = null;
async function ebJwt(): Promise<string> {
  const appId = Deno.env.get("ENABLE_BANKING_APP_ID");
  const pem = Deno.env.get("ENABLE_BANKING_PRIVATE_KEY");
  if (!appId || !pem) throw new Error("Secret Enable Banking mancanti");
  if (!cachedKey) {
    cachedKey = await crypto.subtle.importKey("pkcs8", pemToDer(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  }
  const now = Math.floor(Date.now() / 1000);
  const head = b64urlStr(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const pay = b64urlStr(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 }));
  const input = head + "." + pay;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, cachedKey, new TextEncoder().encode(input)));
  return input + "." + b64url(sig);
}
async function eb(path: string, init?: RequestInit): Promise<{ status: number; data: any }> {
  const jwt = await ebJwt();
  const r = await fetch(EB + path, { ...init, headers: { ...(init?.headers || {}), Authorization: "Bearer " + jwt } });
  const txt = await r.text();
  let data: any; try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: r.status, data };
}

// ── Mappa una transaction Enable Banking → riga bank_transactions ────────────
function mapTx(t: any, companyId: string, accountId: string) {
  const ind = t?.credit_debit_indicator;                  // "CRDT" | "DBIT"
  const rawAmt = Number(t?.transaction_amount?.amount ?? t?.amount ?? 0);
  const amount = ind === "DBIT" ? -Math.abs(rawAmt) : Math.abs(rawAmt);
  const remittance = Array.isArray(t?.remittance_information) ? t.remittance_information.join(" ") : (t?.remittance_information ?? null);
  const creditor = t?.creditor?.name ?? null;
  const debtor = t?.debtor?.name ?? null;
  const counterparty = amount < 0 ? creditor : debtor;
  return {
    company_id: companyId,
    account_id: accountId,
    external_transaction_id: t?.entry_reference ?? t?.transaction_id ?? `${t?.booking_date ?? ""}-${rawAmt}-${remittance ?? ""}`.slice(0, 200),
    booking_date: t?.booking_date ?? null,
    value_date: t?.value_date ?? null,
    amount,
    currency: t?.transaction_amount?.currency ?? t?.currency ?? "EUR",
    description: remittance,
    creditor_name: creditor,
    debtor_name: debtor,
    creditor_iban: t?.creditor_account?.iban ?? null,
    debtor_iban: t?.debtor_account?.iban ?? null,
    reference: t?.reference_number ?? null,
    transaction_type: t?.bank_transaction_code?.description ?? null,
    status: (t?.status ?? "booked").toString().toLowerCase(),
    counterparty_name: counterparty,
    metadata: t,
    synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: profile } = await admin.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
    const companyId = (profile as { company_id?: string } | null)?.company_id;
    if (!companyId) return json({ error: "Azienda non identificata" }, 403);

    const { action, ...p } = await req.json().catch(() => ({}));

    switch (action) {
      // ── elenco banche ─────────────────────────────────────────────────────
      case "list-aspsps": {
        const { status, data } = await eb("/aspsps?country=IT");
        if (status !== 200) return json({ error: data }, 400);
        const aspsps = (data.aspsps || []).map((b: any) => ({ name: b.name, logo: b.logo, country: b.country, psu_types: b.psu_types }));
        return json({ aspsps });
      }

      // ── avvio consenso ────────────────────────────────────────────────────
      case "start-auth": {
        if (!p.aspsp_name) return json({ error: "aspsp_name mancante" }, 400);
        const state = crypto.randomUUID();
        const validUntil = new Date(Date.now() + 89 * 864e5).toISOString();
        const { status, data } = await eb("/auth", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access: { valid_until: validUntil }, aspsp: { name: p.aspsp_name, country: "IT" }, state, redirect_url: REDIRECT_URL, psu_type: "business" }),
        });
        if (status !== 200 || !data?.url) return json({ error: data }, 400);
        await admin.from("bank_connections").insert({
          company_id: companyId, provider_slug: "enablebanking",
          institution_name: p.aspsp_name, institution_country: "IT", institution_logo: p.logo ?? null,
          requisition_id: data.authorization_id ?? null, requisition_link: data.url,
          auth_state: state, status: "created", expires_at: validUntil, created_by: user.id,
        });
        return json({ url: data.url });
      }

      // ── finalizza (callback con code) ─────────────────────────────────────
      case "finalize": {
        if (!p.code) return json({ error: "code mancante" }, 400);
        const { status, data } = await eb("/sessions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: p.code }),
        });
        if (status !== 200) return json({ error: data, debug: data }, 400);

        // Trova la connessione: per state se presente, altrimenti l'ultima 'created'.
        let connQ = admin.from("bank_connections").select("id").eq("company_id", companyId);
        if (p.state) connQ = connQ.eq("auth_state", p.state);
        else connQ = connQ.eq("status", "created").order("created_at", { ascending: false });
        const { data: conn } = await connQ.limit(1).maybeSingle();
        const connectionId = (conn as { id?: string } | null)?.id ?? null;

        const accounts = Array.isArray(data.accounts) ? data.accounts : [];
        let accountsInserted = 0;
        for (const a of accounts) {
          const uid = typeof a === "string" ? a : (a.uid ?? a.account_uid ?? null);
          const accId = (a.account_id ?? a.identification ?? {}) as any;
          if (!uid) continue;
          await admin.from("bank_accounts").upsert({
            company_id: companyId, connection_id: connectionId, external_account_id: uid,
            iban: accId.iban ?? a.iban ?? null, bban: accId.bban ?? null,
            account_name: a.name ?? a.product ?? null, account_owner_name: a.owner_name ?? null,
            currency: a.currency ?? "EUR", is_active: true,
          }, { onConflict: "company_id,external_account_id" });
          accountsInserted++;
        }
        if (connectionId) {
          await admin.from("bank_connections").update({
            status: "linked", provider_session_id: data.session_id ?? null,
            accounts_count: accountsInserted, last_sync_at: new Date().toISOString(),
          }).eq("id", connectionId);
        }
        return json({ ok: true, connection_id: connectionId, accounts: accountsInserted, debug: data });
      }

      // ── sync movimenti ────────────────────────────────────────────────────
      case "sync": {
        const connId = p.connection_id;
        const { data: accounts } = await admin.from("bank_accounts")
          .select("id, external_account_id").eq("company_id", companyId)
          .eq(connId ? "connection_id" : "company_id", connId ?? companyId);
        let imported = 0; const debug: any[] = [];
        const dateFrom = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
        for (const acc of (accounts ?? []) as Array<{ id: string; external_account_id: string }>) {
          const { status, data } = await eb(`/accounts/${acc.external_account_id}/transactions?date_from=${dateFrom}`);
          if (status !== 200) { debug.push({ account: acc.external_account_id, status, data }); continue; }
          const txs = data.transactions || [];
          if (txs.length) {
            const rows = txs.map((t: any) => mapTx(t, companyId, acc.id));
            await admin.from("bank_transactions").upsert(rows, { onConflict: "company_id,external_transaction_id" });
            imported += rows.length;
          }
        }
        await admin.from("bank_connections").update({ last_sync_at: new Date().toISOString() }).eq("company_id", companyId).eq("id", connId);
        return json({ ok: true, imported, debug: debug.length ? debug : undefined });
      }

      default:
        return json({ error: "Azione sconosciuta" }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
