import { SaltEdgeClient, SaltEdgeError, saltId, saltTransaction, saltPublicError, type SaltConnection, type SaltAccount, type SaltTransaction } from "./saltedge.ts";

// Database type generation is separate from this additive beta migration.
type Database = any;
export function checkSaltDb(result: { error?: unknown }) { if (result.error) throw new SaltEdgeError("DatabaseError", 503); }
export async function saltLock<T>(db: Database, key: string, operation: () => Promise<T>): Promise<T> {
  const claim = await db.rpc("claim_saltedge_lock", { p_key: key }); checkSaltDb(claim);
  if (!claim.data) throw new SaltEdgeError("Busy", 409);
  try { return await operation(); }
  finally { await db.from("bank_saltedge_locks").delete().eq("key", key).eq("token", claim.data); }
}
export async function saltCustomer(db: Database, api: SaltEdgeClient, userId: string, email: string) {
  return saltLock(db, `customer:${userId}`, async () => {
    const existing = await db.from("bank_saltedge_customers").select("customer_id").eq("user_id", userId).maybeSingle(); checkSaltDb(existing);
    if (existing.data) return saltId(existing.data.customer_id);
    let customerId: string;
    const identifier = `eic:${userId}`;
    try { customerId = saltId((await api.request<{ customer_id: string }>("/customers", "POST", api.accessType === "partner" ? { email } : { identifier })).data.customer_id); }
    catch (error) {
      if (!(error instanceof SaltEdgeError) || error.code !== "DuplicatedCustomer") throw error;
      const matches = (await api.list<{ customer_id: string; email?: string; identifier?: string }>("/customers")).filter(c => api.accessType === "partner" ? c.email === email || c.identifier === email : c.identifier === identifier);
      if (matches.length !== 1) throw new SaltEdgeError("CustomerRecoveryRequired", 409);
      customerId = saltId(matches[0].customer_id);
    }
    checkSaltDb(await db.from("bank_saltedge_customers").insert({ user_id: userId, customer_id: customerId }));
    return customerId;
  });
}
export async function saltOwnedConnection(db: Database, companyId: string, id: string) {
  const row = await db.from("bank_connections").select("*").eq("id", id).eq("company_id", companyId).eq("provider_slug", "saltedge").maybeSingle();
  checkSaltDb(row);
  if (!row.data || row.data.status === "disconnected") throw new SaltEdgeError("ConnectionNotFound", 404);
  return row.data;
}
export async function saltAttach(db: Database, remote: SaltConnection, session: any) {
  saltId(remote.id);
  if (remote.customer_id !== session.customer_id) throw new SaltEdgeError("ConnectionNotFound", 404);
  const existing = await db.from("bank_connections").select("id,company_id,saltedge_customer_id,status").eq("provider_slug", "saltedge").eq("provider_connection_id", remote.id).maybeSingle(); checkSaltDb(existing);
  if (existing.data && (existing.data.company_id !== session.company_id || existing.data.saltedge_customer_id !== session.customer_id || existing.data.status === "disconnected")) throw new SaltEdgeError("ConnectionNotFound", 404);
  if (session.connection_id ? session.connection_id !== remote.id : remote.last_attempt?.custom_fields?.eic_session_id !== session.id) throw new SaltEdgeError("InvalidSession", 403);
  const values = { company_id: session.company_id, provider_slug: "saltedge", provider_connection_id: remote.id, saltedge_customer_id: remote.customer_id,
    institution_id: remote.provider_code, institution_name: remote.provider_name, institution_country: remote.country_code,
    status: remote.status === "active" ? (remote.last_attempt?.finished === true ? "linked" : "created") : "expired",
    next_refresh_possible_at: remote.next_refresh_possible_at ?? null };
  const saved = existing.data
    ? await db.from("bank_connections").update(values).eq("id", existing.data.id).eq("company_id", session.company_id).select("*").single()
    : await db.from("bank_connections").insert({ ...values, created_by: session.user_id }).select("*").single();
  checkSaltDb(saved); if (!saved.data) throw new SaltEdgeError("DatabaseError", 503);
  checkSaltDb(await db.from("bank_saltedge_sessions").update({ connection_id: remote.id, consumed_at: new Date().toISOString() }).eq("id", session.id));
  return saved.data;
}
export async function saltSync(db: Database, api: SaltEdgeClient, row: any) {
  try { return await saltLock(db, `connection:${row.id}`, async () => {
    const remote = (await api.request<SaltConnection>(`/connections/${saltId(row.provider_connection_id)}`)).data;
    if (remote.customer_id !== row.saltedge_customer_id || remote.id !== row.provider_connection_id) throw new SaltEdgeError("ConnectionNotFound", 404);
    if (api.mode === "pending" && remote.country_code !== "XF") throw new SaltEdgeError("BetaModeRequired", 403);
    if (remote.status !== "active") {
      checkSaltDb(await db.from("bank_connections").update({ status: "expired", error_message: "Consenso non attivo: ricollega la banca." }).eq("id", row.id).eq("company_id", row.company_id));
      throw new SaltEdgeError("AispConsentExpired", 409);
    }
    if (remote.last_attempt?.finished !== true) return { ok: true, processing: true, imported: 0, connection_id: row.id };
    let expiresAt: string | null = null;
    if (remote.last_consent_id) {
      const consent = (await api.request<{ connection_id: string; status: string; expires_at?: string }>(`/consents/${saltId(remote.last_consent_id)}?connection_id=${remote.id}&customer_id=${remote.customer_id}`)).data;
      if (consent.connection_id !== remote.id || consent.status !== "active") {
        checkSaltDb(await db.from("bank_connections").update({ status: "expired", error_message: "Consenso scaduto o revocato. Ricollega la banca." }).eq("id", row.id).eq("company_id", row.company_id));
        throw new SaltEdgeError("AispConsentRevoked", 409);
      }
      expiresAt = consent.expires_at ?? null;
    }
    const accounts = await api.list<SaltAccount>(`/accounts?connection_id=${saltId(remote.id)}`);
    if (!accounts.length) throw new SaltEdgeError("NoAccounts", 409);
    let imported = 0;
    for (const a of accounts) {
      saltId(a.id);
      if (a.connection_id !== remote.id || !Number.isFinite(a.balance) || !/^[A-Z]{3}$/.test(a.currency_code)) throw new SaltEdgeError("InvalidAccount", 502);
      const iban = a.extra?.iban?.replace(/\s/g, "").toUpperCase() || null;
      if (iban) {
        const legacy = await db.rpc("saltedge_account_conflict", { p_company: row.company_id, p_connection: row.id, p_iban: iban }); checkSaltDb(legacy);
        if (legacy.data === true) throw new SaltEdgeError("MigrationRequired", 409);
      }
      const existing = await db.from("bank_accounts").select("id,connection_id").eq("company_id", row.company_id).eq("external_account_id", `se:${a.id}`).maybeSingle(); checkSaltDb(existing);
      if (existing.data && existing.data.connection_id !== row.id) throw new SaltEdgeError("AccountAlreadyLinked", 409);
      const saved = await db.from("bank_accounts").upsert({ company_id: row.company_id, connection_id: row.id, external_account_id: `se:${a.id}`,
        iban, account_name: a.name, currency: a.currency_code, account_owner_name: a.extra?.client_name ?? null,
        is_active: a.extra?.status !== "inactive" && a.extra?.status !== "unauthorized",
      }, { onConflict: "company_id,external_account_id" }).select("id").single(); checkSaltDb(saved);
      if (!saved.data) throw new SaltEdgeError("DatabaseError", 503);
      if (a.extra?.status === "inactive" || a.extra?.status === "unauthorized") continue;
      const transactions = await api.list<SaltTransaction>(`/transactions?connection_id=${remote.id}&account_id=${a.id}&pending=false&duplicated=false`);
      const valid = transactions.map(t => saltTransaction(t, a.id, row.company_id, saved.data.id)).filter(Boolean);
      const mapped = [...new Map(valid.map(t => [t!.external_transaction_id, t!])).values()];
      for (let i = 0; i < mapped.length; i += 100) {
        checkSaltDb(await db.from("bank_transactions").upsert(mapped.slice(i, i + 100), { onConflict: "company_id,external_transaction_id" }));
      }
      imported += mapped.length;
      checkSaltDb(await db.from("bank_accounts").update({ current_balance: a.balance,
        balance_updated_at: a.updated_at && Number.isFinite(Date.parse(a.updated_at)) ? a.updated_at : null,
      }).eq("id", saved.data.id).eq("company_id", row.company_id));
    }
    checkSaltDb(await db.from("bank_connections").update({ status: "linked", accounts_count: accounts.length, error_message: null,
      last_sync_at: new Date().toISOString(), expires_at: expiresAt, next_refresh_possible_at: remote.next_refresh_possible_at ?? null,
    }).eq("id", row.id).eq("company_id", row.company_id));
    return { ok: true, imported, accounts: accounts.length, connection_id: row.id };
  }); } catch (error) {
    const excluded = ["Busy", "ConnectionNotFound", "BetaModeRequired", "AispConsentExpired", "AispConsentRevoked"];
    if (!(error instanceof SaltEdgeError) || !excluded.includes(error.code)) {
      await db.from("bank_connections").update({ status: "error", error_message: saltPublicError(error).error }).eq("id", row.id).eq("company_id", row.company_id);
    }
    throw error;
  }
}
