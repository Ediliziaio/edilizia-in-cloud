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

  // ── Motore bank_alert_rules ────────────────────────────────────────────────
  // La UI per configurare gli avvisi esiste da mesi; il motore che li fa
  // scattare no: le regole si salvavano e non succedeva mai niente.
  // Gira qui, a dati appena sincronizzati. Notifica in-app agli admin
  // dell'azienda, con dedup 24h per regola (niente campanella-spam).
  let alertsFired = 0;
  try {
    const { data: rules } = await admin
      .from("bank_alert_rules")
      .select("id, company_id, rule_type, threshold, days_threshold, notify_inapp, is_active")
      .eq("is_active", true)
      .limit(2000);

    const byCompany = new Map<string, any[]>();
    for (const r of rules || []) {
      if (!r.notify_inapp) continue; // email non ancora supportata: onesti, non finti
      const arr = byCompany.get(r.company_id) ?? [];
      arr.push(r);
      byCompany.set(r.company_id, arr);
    }

    for (const [cId, companyRules] of byCompany) {
      // Un solo giro di dati per azienda
      const { data: accounts } = await admin
        .from("bank_accounts").select("current_balance")
        .eq("company_id", cId).eq("is_active", true);
      const saldo = (accounts || []).reduce((s: number, a: any) => s + (Number(a.current_balance) || 0), 0);

      const fired: { rule: any; title: string; body: string }[] = [];
      for (const rule of companyRules) {
        if (rule.rule_type === "balance_below") {
          if (saldo < Number(rule.threshold || 0)) {
            fired.push({
              rule,
              title: "Saldo banca sotto soglia",
              body: `Liquidità totale ${saldo.toFixed(2)} € — soglia impostata ${Number(rule.threshold).toFixed(2)} €.`,
            });
          }
        } else if (rule.rule_type === "large_debit") {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          const { data: bigTxs } = await admin
            .from("bank_transactions")
            .select("id, amount, description")
            .eq("company_id", cId)
            .lt("amount", -Math.abs(Number(rule.threshold || 0)))
            .gte("booking_date", since)
            .limit(20);
          if (bigTxs && bigTxs.length > 0) {
            const tot = bigTxs.reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0);
            fired.push({
              rule,
              title: `${bigTxs.length} addebiti sopra ${Number(rule.threshold).toFixed(0)} €`,
              body: `Nelle ultime 24h: ${tot.toFixed(2)} € in uscite oltre soglia. Controlla la Tesoreria.`,
            });
          }
        } else if (rule.rule_type === "unreconciled_days") {
          const days = Number(rule.days_threshold || 7);
          const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          const { count } = await admin
            .from("bank_transactions")
            .select("id", { count: "exact", head: true })
            .eq("company_id", cId)
            .eq("transaction_type", "credit")
            .is("linked_invoice_id", null)
            .is("linked_installment_id", null)
            .is("linked_scadenza_id", null)
            .lte("booking_date", cutoff)
            .not("category", "ilike", "%giroconto%");
          if ((count ?? 0) > 0) {
            fired.push({
              rule,
              title: `${count} incassi non riconciliati da oltre ${days} giorni`,
              body: "Apri Tesoreria → Riconciliazione per abbinarli alle fatture.",
            });
          }
        } else if (rule.rule_type === "connection_expiring") {
          const days = Number(rule.days_threshold || 15);
          const limitDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
          const { data: expiring } = await admin
            .from("bank_connections")
            .select("id, institution_name, expires_at")
            .eq("company_id", cId)
            .eq("status", "active")
            .not("expires_at", "is", null)
            .lte("expires_at", limitDate)
            .limit(10);
          if (expiring && expiring.length > 0) {
            const nomi = expiring.map((c: any) => c.institution_name).filter(Boolean).join(", ");
            fired.push({
              rule,
              title: "Connessione bancaria in scadenza",
              body: `${nomi || "Una connessione"} scade entro ${days} giorni: rinnovala per non perdere i movimenti.`,
            });
          }
        }
      }

      if (fired.length === 0) continue;

      // Admin dell'azienda + dedup: stessa regola al massimo una volta al giorno.
      // Due query: profiles e user_roles puntano entrambe ad auth.users, non
      // c'è FK diretta tra loro — l'embed PostgREST qui non esiste.
      const { data: companyProfiles } = await admin
        .from("profiles").select("id").eq("company_id", cId).limit(200);
      const profileIds = (companyProfiles || []).map((p: any) => p.id);
      if (profileIds.length === 0) continue;
      const { data: adminRoles } = await admin
        .from("user_roles").select("user_id")
        .eq("role", "company_admin").in("user_id", profileIds).limit(20);
      const admins = (adminRoles || []).map((r: any) => ({ id: r.user_id }));
      if (admins.length === 0) continue;

      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recenti } = await admin
        .from("notifications")
        .select("entity_id")
        .eq("company_id", cId)
        .eq("entity_type", "bank_alert_rule")
        .gte("created_at", dayAgo);
      const giaNotificate = new Set((recenti || []).map((n: any) => n.entity_id));

      for (const f of fired) {
        if (giaNotificate.has(f.rule.id)) continue;
        const rows = admins.map((a: any) => ({
          company_id: cId,
          user_id: a.id,
          type: "bank_alert",
          title: f.title,
          body: f.body,
          entity_type: "bank_alert_rule",
          entity_id: f.rule.id,
          action_url: "/azienda/tesoreria",
        }));
        const { error: nErr } = await admin.from("notifications").insert(rows);
        if (nErr) console.error("[bank-eb-cron] alert insert failed:", nErr.message);
        else alertsFired++;
      }
    }
  } catch (alertErr) {
    console.error("[bank-eb-cron] alert engine error:", alertErr instanceof Error ? alertErr.message : String(alertErr));
  }
  if (alertsFired > 0) console.log(`[bank-eb-cron] alert scattati: ${alertsFired}`);

  return new Response(JSON.stringify({ ok: true, accounts: accountsDone, imported, expired, alertsFired, txErrors: txErrors.slice(0, 8) }), { headers: { "Content-Type": "application/json" } });
});
