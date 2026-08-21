// ============================================================================
// bank-eb-cron — sync notturno di TUTTE le connessioni Open Banking (Enable Banking)
// ============================================================================
// Chiamato da pg_cron con header x-cron-secret = INTERNAL_CRON_SECRET.
// Per ogni connessione 'linked' scarica i movimenti recenti + saldo e li
// aggiorna. Se la banca risponde 401/403 → consenso scaduto → status='expired'.
// Nessun JWT utente (verify_jwt=false): l'auth è il cron-secret.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EB = "https://api.enablebanking.com";

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
function normStatus(s: unknown): string {
  const u = (s ?? "booked").toString().toUpperCase();
  if (u === "BOOK" || u === "BOOKED") return "booked";
  if (u === "PDNG" || u === "PENDING") return "pending";
  return (s ?? "booked").toString().toLowerCase();
}
function mapTx(t: any, companyId: string, accountId: string) {
  const ind = t?.credit_debit_indicator;
  const rawAmt = Number(t?.transaction_amount?.amount ?? t?.amount ?? 0);
  const amount = ind === "DBIT" ? -Math.abs(rawAmt) : Math.abs(rawAmt);
  const remittance = Array.isArray(t?.remittance_information) ? t.remittance_information.join(" ") : (t?.remittance_information ?? null);
  const creditor = t?.creditor?.name ?? null;
  const debtor = t?.debtor?.name ?? null;
  return {
    company_id: companyId, account_id: accountId,
    external_transaction_id: t?.entry_reference ?? t?.transaction_id ?? `${t?.booking_date ?? ""}-${rawAmt}-${remittance ?? ""}`.slice(0, 200),
    booking_date: t?.booking_date ?? null, value_date: t?.value_date ?? null, amount,
    currency: t?.transaction_amount?.currency ?? t?.currency ?? "EUR",
    description: remittance, creditor_name: creditor, debtor_name: debtor,
    creditor_iban: t?.creditor_account?.iban ?? null, debtor_iban: t?.debtor_account?.iban ?? null,
    reference: t?.reference_number ?? null,
    transaction_type: ind === "DBIT" ? "debit" : "credit",
    status: normStatus(t?.status),
    // counterparty_name/_iban sono colonne GENERATED ALWAYS → non scriverle qui.
    metadata: t, synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== Deno.env.get("INTERNAL_CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Tutti i conti attivi di connessioni ancora 'linked'.
  const { data: rows } = await admin
    .from("bank_accounts")
    .select("id, external_account_id, company_id, connection_id, bank_connections!inner(status)")
    .eq("is_active", true)
    .eq("bank_connections.status", "linked");

  const dateFrom = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  let imported = 0, expired = 0, accountsDone = 0; const txErrors: any[] = [];
  for (const acc of (rows ?? []) as Array<{ id: string; external_account_id: string; company_id: string; connection_id: string }>) {
    try {
      const { status, data } = await eb(`/accounts/${acc.external_account_id}/transactions?date_from=${dateFrom}`);
      if (status === 401 || status === 403) {
        await admin.from("bank_connections").update({ status: "expired", error_message: "Consenso scaduto o revocato. Ricollega il conto." }).eq("id", acc.connection_id);
        expired++; continue;
      }
      if (status !== 200) continue;
      const txs = data.transactions || [];
      if (txs.length) {
        // Contatore, non scarto: due bonifici identici lo stesso giorno sono
        // movimenti diversi (v. bank-eb) — suffisso #n stabile tra i sync.
        const seen = new Map<string, number>();
        const rows = txs.map((t: any) => mapTx(t, acc.company_id, acc.id)).filter((r: any) => !!r.external_transaction_id).map((r: any) => {
          const n = seen.get(r.external_transaction_id) ?? 0;
          seen.set(r.external_transaction_id, n + 1);
          if (n > 0) r.external_transaction_id = `${r.external_transaction_id}#${n}`.slice(0, 200);
          return r;
        });
        const { error: txErr } = await admin.from("bank_transactions").upsert(rows, { onConflict: "company_id,external_transaction_id" });
        if (txErr) {
          txErrors.push({ account: acc.external_account_id, batch: txErr.message });
          let ok = 0;
          for (const row of rows) {
            const { error: e1 } = await admin.from("bank_transactions").upsert([row], { onConflict: "company_id,external_transaction_id" });
            if (!e1) ok++; else if (txErrors.length < 8) txErrors.push({ extid: row.external_transaction_id, error: e1.message });
          }
          imported += ok;
        } else imported += rows.length;
      }
      // Nome amichevole (Qonto: campo `details`) → display_name + chiave per il saldo giusto.
      let friendly: string | null = null;
      try {
        const det = await eb(`/accounts/${acc.external_account_id}/details`);
        if (det.status === 200) {
          friendly = (det.data?.details ?? det.data?.name) || null;
          if (friendly) await admin.from("bank_accounts").update({ display_name: friendly }).eq("id", acc.id);
        }
      } catch { /* nome best-effort */ }
      try {
        const bal = await eb(`/accounts/${acc.external_account_id}/balances`);
        if (bal.status === 200) {
          const arr = Array.isArray(bal.data?.balances) ? bal.data.balances : [];
          // Qonto ritorna tutti i saldi nominali nello stesso array → match per nome.
          const byName = friendly ? arr.find((b: any) => (b?.name ?? "").trim() === friendly!.trim()) : null;
          const pick = byName || arr.find((b: any) => ["CLBD", "XPCD", "ITBD", "CLAV", "PRCD"].includes(b?.balance_type)) || arr[0];
          const amt = pick ? Number(pick?.balance_amount?.amount ?? pick?.amount) : null;
          if (amt != null && !Number.isNaN(amt)) await admin.from("bank_accounts").update({ current_balance: amt, balance_updated_at: new Date().toISOString() }).eq("id", acc.id);
        }
      } catch { /* saldo best-effort */ }
      await admin.from("bank_connections").update({ last_sync_at: new Date().toISOString() }).eq("id", acc.connection_id);
      accountsDone++;
    } catch (e) {
      console.error("[bank-eb-cron] account", acc.external_account_id, e instanceof Error ? e.message : String(e));
    }
  }
  console.log(`[bank-eb-cron] done accounts=${accountsDone} imported=${imported} expired=${expired}`);
  return new Response(JSON.stringify({ ok: true, accounts: accountsDone, imported, expired, txErrors: txErrors.slice(0, 8) }), { headers: { "Content-Type": "application/json" } });
});
