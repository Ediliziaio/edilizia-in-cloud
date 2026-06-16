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
const REDIRECT_BASE = "https://app.ediliziaincloud.com";
const REDIRECT_URL = REDIRECT_BASE + "/azienda/impostazioni/integrazioni";
// Redirect ammessi (devono essere registrati come "Allowed redirect URLs" nell'app Enable Banking).
const ALLOWED_REDIRECTS = new Set([
  REDIRECT_BASE + "/azienda/impostazioni/integrazioni",
  REDIRECT_BASE + "/azienda/tesoreria",
]);

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
    // I componenti Tesoreria classificano entrata/uscita con transaction_type = "credit"|"debit".
    // Il codice banca grezzo resta in metadata.bank_transaction_code.
    transaction_type: ind === "DBIT" ? "debit" : "credit",
    status: (t?.status ?? "booked").toString().toLowerCase(),
    // NB: counterparty_name / counterparty_iban sono colonne GENERATED ALWAYS
    // (COALESCE(creditor*, debtor*)) → NON vanno scritte qui o l'upsert fallisce.
    metadata: t,
    synced_at: new Date().toISOString(),
  };
}

// ── Autorizzazione: solo admin o utenti col permesso Tesoreria ──────────────
// (allineato alla RLS: bank_* leggibili da admin o has_permission('can_view_tesoreria')).
async function canManageBank(admin: any, userId: string, companyId: string): Promise<boolean> {
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const roleList = ((roles ?? []) as Array<{ role: string }>).map((r) => r.role);
  if (roleList.includes("super_admin") || roleList.includes("company_admin")) return true;
  const { data: perm } = await admin.from("staff_permissions")
    .select("can_view_tesoreria").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
  return (perm as { can_view_tesoreria?: boolean } | null)?.can_view_tesoreria === true;
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

    // Sicurezza: collegare conti / sincronizzare / elencare banche è riservato
    // ad admin o utenti col permesso Tesoreria (can_view_tesoreria).
    if (!(await canManageBank(admin, user.id, companyId))) {
      return json({ error: "Permesso negato: serve l'autorizzazione Tesoreria per gestire i conti bancari." }, 403);
    }

    const { action, ...p } = await req.json().catch(() => ({}));
    console.log(`[bank-eb] action=${action} company=${companyId} user=${user.id} aspsp=${p.aspsp_name ?? ""} hasCode=${!!p.code}`);

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
        // Redirect dinamico: la pagina chiamante (Integrazioni o Tesoreria) decide dove tornare.
        // Solo URL whitelistati (= registrati nell'app Enable Banking) sono ammessi.
        const reqRedirect = REDIRECT_BASE + (typeof p.redirect_path === "string" ? p.redirect_path : "");
        const redirectUrl = ALLOWED_REDIRECTS.has(reqRedirect) ? reqRedirect : REDIRECT_URL;
        const { status, data } = await eb("/auth", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access: { valid_until: validUntil }, aspsp: { name: p.aspsp_name, country: "IT" }, state, redirect_url: redirectUrl, psu_type: "business" }),
        });
        console.log(`[bank-eb] start-auth EB /auth status=${status} hasUrl=${!!data?.url} redirect=${redirectUrl}`);
        if (status !== 200 || !data?.url) return json({ error: data }, 400);
        const { error: connInsErr } = await admin.from("bank_connections").insert({
          company_id: companyId, provider_slug: "enablebanking",
          institution_id: p.aspsp_name, // NOT NULL nello schema (eredità GoCardless): usiamo il nome banca come id
          institution_name: p.aspsp_name, institution_country: "IT", institution_logo: p.logo ?? null,
          requisition_id: data.authorization_id ?? null, requisition_link: data.url,
          auth_state: state, status: "created", expires_at: validUntil, created_by: user.id,
        });
        if (connInsErr) {
          console.error("[bank-eb] start-auth INSERT bank_connections fallita:", connInsErr.message);
          return json({ error: "Impossibile salvare la connessione: " + connInsErr.message }, 500);
        }
        return json({ url: data.url });
      }

      // ── finalizza (callback con code) ─────────────────────────────────────
      case "finalize": {
        if (!p.code) return json({ error: "code mancante" }, 400);
        const { status, data } = await eb("/sessions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: p.code }),
        });
        console.log(`[bank-eb] finalize /sessions status=${status} accounts=${Array.isArray(data?.accounts) ? data.accounts.length : "n/a"} accounts_data=${Array.isArray(data?.accounts_data) ? data.accounts_data.length : "n/a"} sessionStatus=${data?.status ?? ""} state=${p.state ?? ""}`);
        if (status !== 200) return json({ error: data, debug: data }, 400);

        // Trova la connessione: per state se presente, altrimenti l'ultima 'created'.
        let connQ = admin.from("bank_connections").select("id").eq("company_id", companyId);
        if (p.state) connQ = connQ.eq("auth_state", p.state);
        else connQ = connQ.eq("status", "created").order("created_at", { ascending: false });
        const { data: conn } = await connQ.limit(1).maybeSingle();
        const connectionId = (conn as { id?: string } | null)?.id ?? null;
        if (!connectionId) {
          console.error("[bank-eb] finalize: nessuna bank_connections trovata (state=" + (p.state ?? "") + ")");
          return json({ error: "Connessione non trovata per questo consenso. Riprova il collegamento.", debug: data }, 400);
        }

        // Enable Banking mette gli account in `accounts_data` (oggetti con uid + dettagli)
        // e/o in `accounts` (lista di uid stringa). Prendiamo il primo non vuoto.
        const accounts = (Array.isArray(data.accounts_data) && data.accounts_data.length)
          ? data.accounts_data
          : (Array.isArray(data.accounts) ? data.accounts : []);
        let accountsInserted = 0;
        for (const a of accounts) {
          const uid = typeof a === "string" ? a : (a.uid ?? a.account_uid ?? a.identification_hash ?? null);
          const accId = (a.account_id ?? a.identification ?? {}) as any;
          if (!uid) continue;
          const { error: accErr } = await admin.from("bank_accounts").upsert({
            company_id: companyId, connection_id: connectionId, external_account_id: uid,
            iban: accId.iban ?? a.iban ?? null, bban: accId.bban ?? null,
            account_name: a.name ?? a.product ?? null, account_owner_name: a.owner_name ?? null,
            currency: a.currency ?? "EUR", is_active: true,
          }, { onConflict: "company_id,external_account_id" });
          if (accErr) { console.error("[bank-eb] finalize upsert bank_accounts fallita:", accErr.message); continue; }
          accountsInserted++;
        }
        const noAccounts = accountsInserted === 0;
        await admin.from("bank_connections").update({
          status: noAccounts ? "error" : "linked",
          error_message: noAccounts ? "Nessun conto accessibile: in restricted mode il conto va abilitato nel pannello Enable Banking (Link accounts)." : null,
          provider_session_id: data.session_id ?? null,
          accounts_count: accountsInserted, last_sync_at: new Date().toISOString(),
        }).eq("id", connectionId);
        console.log(`[bank-eb] finalize done connection=${connectionId} accountsInserted=${accountsInserted}`);
        return json({
          ok: true, connection_id: connectionId, accounts: accountsInserted,
          warning: noAccounts ? "Nessun conto accessibile per questo consenso. In restricted mode abilita prima il conto nel pannello Enable Banking." : undefined,
          debug: data,
        });
      }

      // ── sync movimenti ────────────────────────────────────────────────────
      case "sync": {
        const connId = p.connection_id;
        const { data: accounts } = await admin.from("bank_accounts")
          .select("id, external_account_id, connection_id").eq("company_id", companyId)
          .eq(connId ? "connection_id" : "company_id", connId ?? companyId);
        let imported = 0; const debug: any[] = []; let expiredAny = false;
        const dateFrom = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
        for (const acc of (accounts ?? []) as Array<{ id: string; external_account_id: string; connection_id: string }>) {
          const { status, data } = await eb(`/accounts/${acc.external_account_id}/transactions?date_from=${dateFrom}`);
          // 401/403 = consenso scaduto o revocato (PSD2 max 90gg) → segna la connessione da ricollegare.
          if (status === 401 || status === 403) {
            expiredAny = true;
            await admin.from("bank_connections").update({
              status: "expired", error_message: "Consenso scaduto o revocato. Ricollega il conto.",
            }).eq("id", acc.connection_id);
            debug.push({ account: acc.external_account_id, status, expired: true });
            continue;
          }
          if (status !== 200) { debug.push({ account: acc.external_account_id, status, data }); continue; }
          const txs = data.transactions || [];
          if (txs.length) {
            // Dedup intra-batch sull'external_transaction_id: due righe con la stessa
            // chiave nel medesimo upsert fanno fallire l'INSERT ("cannot affect row a second time").
            const seen = new Set<string>();
            const rows = txs.map((t: any) => mapTx(t, companyId, acc.id)).filter((r: any) => {
              if (!r.external_transaction_id || seen.has(r.external_transaction_id)) return false;
              seen.add(r.external_transaction_id); return true;
            });
            const { error: txErr } = await admin.from("bank_transactions")
              .upsert(rows, { onConflict: "company_id,external_transaction_id" });
            if (txErr) {
              // Mai contare come importate righe non salvate: fallback per-riga per
              // isolare l'eventuale movimento problematico e salvare comunque gli altri.
              let ok = 0;
              for (const row of rows) {
                const { error: e1 } = await admin.from("bank_transactions")
                  .upsert([row], { onConflict: "company_id,external_transaction_id" });
                if (!e1) ok++; else if (debug.length < 10) debug.push({ extid: row.external_transaction_id, error: e1.message });
              }
              imported += ok;
              if (ok < rows.length) console.error("[bank-eb] sync upsert parziale:", acc.external_account_id, txErr.message);
            } else {
              imported += rows.length;
            }
          }
          // Nome "amichevole" del conto (Qonto lo mette in `details`: "Conto principale",
          // "IVA", "Stipendi"...). Lo salviamo come display_name (UI leggibile) e lo usiamo
          // per agganciare il saldo giusto: Qonto su /balances ritorna TUTTI i saldi nominali
          // dell'organizzazione nello stesso array → senza match-per-nome ogni conto prenderebbe
          // il primo saldo (di solito 0). Le banche normali ritornano un solo saldo → fallback.
          let friendly: string | null = null;
          try {
            const det = await eb(`/accounts/${acc.external_account_id}/details`);
            if (det.status === 200) {
              friendly = (det.data?.details ?? det.data?.name) || null;
              if (friendly) await admin.from("bank_accounts").update({ display_name: friendly }).eq("id", acc.id);
            }
          } catch { /* nome best-effort */ }
          // Best-effort: saldo corrente del conto (per l'overview Tesoreria). Mai bloccante.
          try {
            const bal = await eb(`/accounts/${acc.external_account_id}/balances`);
            if (bal.status === 200) {
              const arr = Array.isArray(bal.data?.balances) ? bal.data.balances : [];
              const byName = friendly ? arr.find((b: any) => (b?.name ?? "").trim() === friendly!.trim()) : null;
              const pick = byName || arr.find((b: any) => ["CLBD", "XPCD", "ITBD", "CLAV", "PRCD"].includes(b?.balance_type)) || arr[0];
              const amt = pick ? Number(pick?.balance_amount?.amount ?? pick?.amount) : null;
              if (amt != null && !Number.isNaN(amt)) {
                await admin.from("bank_accounts").update({ current_balance: amt, balance_updated_at: new Date().toISOString() }).eq("id", acc.id);
              }
            }
          } catch { /* saldo non disponibile: si prosegue */ }
        }
        const connUpd = admin.from("bank_connections").update({ last_sync_at: new Date().toISOString() }).eq("company_id", companyId);
        await (connId ? connUpd.eq("id", connId) : connUpd);
        return json({ ok: true, imported, expired: expiredAny || undefined, debug: debug.length ? debug : undefined });
      }

      // ── disconnetti / revoca consenso ─────────────────────────────────────
      case "disconnect": {
        if (!p.connection_id) return json({ error: "connection_id mancante" }, 400);
        const { data: c } = await admin.from("bank_connections")
          .select("provider_session_id").eq("company_id", companyId).eq("id", p.connection_id).maybeSingle();
        const sid = (c as { provider_session_id?: string } | null)?.provider_session_id;
        if (sid) { try { await eb(`/sessions/${sid}`, { method: "DELETE" }); } catch { /* revoca best-effort */ } }
        await admin.from("bank_connections").update({ status: "disconnected", error_message: null })
          .eq("company_id", companyId).eq("id", p.connection_id);
        await admin.from("bank_accounts").update({ is_active: false })
          .eq("company_id", companyId).eq("connection_id", p.connection_id);
        return json({ ok: true });
      }

      default:
        return json({ error: "Azione sconosciuta" }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
