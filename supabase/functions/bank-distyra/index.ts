/**
 * bank-distyra — collega il conto corrente del cliente e porta i movimenti in Tesoreria.
 *
 * Perché esiste: fino al 27/10/2026 la tesoreria leggeva le banche con `bank-eb` (Enable Banking
 * chiamata in diretta), poi sostituita da Salt Edge, che però è in beta e abilitata azienda per
 * azienda. Distyra rivende lo stesso motore (Enable Banking) con una API molto più corta, il primo
 * collegamento gratis e nessun minimo mensile: 333 banche italiane, solo lettura, nessun pagamento.
 *
 * Tre passi, come li chiama l'app:
 *   start-link { country?, psu_type? } → crea il link ospitato e la riga in bank_connections → { url }
 *   finalize   { connection_id }       → legge i conti e li scrive in bank_accounts
 *   sync       { connection_id }       → porta i movimenti in bank_transactions
 *
 * La chiave sta in DISTYRA_API_KEY (segreto del progetto, mai nel repository: è pubblico).
 * Una chiave `sk_test_` parla con la sandbox: stesso flusso, nessun conto vero e nessun consumo.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";

const BASE = "https://api.distyra.com";
const PROVIDER = "distyra";
/** Dove torna il cliente dopo la banca. Deve combaciare con un return URL registrato nel portale. */
const RITORNO = "https://app.ediliziaincloud.com/azienda/tesoreria";
/**
 * Al ritorno Distyra non promette di aggiungere parametri suoi, quindi il riferimento
 * ce lo mettiamo noi: la pagina legge `dy` e sa quale collegamento concludere.
 */
const ritornoCon = (rif: string) => `${RITORNO}?bank_provider=distyra&dy=${encodeURIComponent(rif)}`;
/** Quanti giorni si rileggono all'indietro a ogni giro: le banche registrano in ritardo. */
const GIORNI_DI_SICUREZZA = 7;
/** Finche' il cliente non ha scelto la banca non ne conosciamo il codice. */
const ISTITUTO_IGNOTO = "distyra-da-scegliere";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function distyra(path: string, init?: RequestInit) {
  const chiave = Deno.env.get("DISTYRA_API_KEY");
  if (!chiave) throw new Error("DISTYRA_API_KEY non configurata");
  const r = await fetch(BASE + path, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${chiave}`, "Content-Type": "application/json" },
  });
  const testo = await r.text();
  let corpo: unknown = null;
  try { corpo = testo ? JSON.parse(testo) : null; } catch { corpo = { error: testo.slice(0, 300) }; }
  if (!r.ok) {
    const e = corpo as { error?: string; detail?: string } | null;
    throw new Error(`Distyra ${r.status} su ${path}: ${e?.error ?? ""} ${e?.detail ?? ""}`.trim());
  }
  return corpo as Record<string, unknown>;
}

/** `BOOK` è l'unico stato contabilizzato: le viste di tesoreria filtrano su 'booked'. */
const statoMovimento = (s: unknown) => (String(s ?? "").toUpperCase() === "BOOK" ? "booked" : "pending");
const testo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Una riga di Distyra → una riga di bank_transactions.
 * NB: counterparty_name e counterparty_iban sono colonne GENERATE dal database
 * (COALESCE di creditor/debtor): scriverle fa fallire l'upsert.
 */
/** Il riferimento della banca, reso unico per conto: vedi il commento nell'upsert. */
function rifMovimento(t: Record<string, any>, accountId: string) {
  const rif = String(t.entry_reference ?? t.id ?? t.transaction_id ?? "").trim();
  return rif ? `${accountId}:${rif}`.slice(0, 200) : "";
}

function mappaMovimento(t: Record<string, any>, companyId: string, accountId: string) {
  const uscita = String(t.credit_debit ?? "").toUpperCase() === "DBIT";
  const importo = Math.abs(Number(t.amount ?? 0));
  const causale = Array.isArray(t.remittance_information)
    ? t.remittance_information.filter(Boolean).join(" ").trim() || null
    : testo(t.remittance_information);
  const controparte = testo(t.counterparty_name);
  const ibanControparte = testo(t.counterparty_iban);
  return {
    company_id: companyId,
    account_id: accountId,
    // `entry_reference` è il riferimento stabile della banca; `id` è il ripiego che Distyra sceglie da sé.
    // Non è unico FRA CONTI diversi (lo dice la specifica), mentre il vincolo del database è
    // UNIQUE (company_id, external_transaction_id): senza il conto davanti, due movimenti di
    // due conti della stessa banca si sovrascriverebbero a vicenda.
    external_transaction_id: rifMovimento(t, accountId),
    booking_date: t.booking_date ?? t.date ?? null,
    value_date: t.value_date ?? null,
    amount: uscita ? -importo : importo,
    currency: testo(t.currency) ?? "EUR",
    description: causale ?? testo(t.descriptor),
    creditor_name: uscita ? controparte : null,
    debtor_name: uscita ? null : controparte,
    creditor_iban: uscita ? ibanControparte : null,
    debtor_iban: uscita ? null : ibanControparte,
    reference: testo(t.reference_number) ?? testo(t.structured_reference),
    transaction_type: uscita ? "debit" : "credit",
    status: statoMovimento(t.status),
    // Nei metadati resta tutta la riga, compreso `enrichment`: nome del commerciante e
    // categoria, che servono alla riconciliazione automatica.
    metadata: t,
    synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const corpo = await req.json().catch(() => ({})) as Record<string, any>;
    const azione = String(corpo.action ?? "");
    const companyId = String(corpo.company_id ?? "");
    if (!companyId) return errorResponse("company_id richiesto", 400, corsH);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsH);

    // ── 1. Il link che il cliente apre per scegliere la banca ────────────────
    if (azione === "start-link") {
      const nostroRif = crypto.randomUUID();
      const link = await distyra("/v1/connect/hosted-link", {
        method: "POST",
        body: JSON.stringify({
          country: String(corpo.country ?? "IT").toUpperCase(),
          mode: "end_user",
          psu_type: corpo.psu_type === "personal" ? "personal" : "business",
          external_ref: nostroRif,
          return_url: ritornoCon(nostroRif),
          brand_name: "Edilizia in Cloud",
        }),
      });
      const { data: riga, error } = await admin.from("bank_connections").insert({
        company_id: companyId, provider_slug: PROVIDER, status: "pending",
        // La tabella e' nata per GoCardless, dove la banca si sceglie PRIMA: institution_id e
        // institution_name sono obbligatorie. Col link ospitato la banca la sceglie il cliente
        // dopo, quindi qui restano due segnaposto, scritti in italiano perche' l'elenco delle
        // connessioni in attesa li mostra; `finalize` li sostituisce con la banca vera.
        institution_id: ISTITUTO_IGNOTO, institution_name: "Banca da scegliere",
        auth_state: nostroRif, requisition_link: testo(link.url),
        expires_at: testo(link.expires_at), created_by: userId,
      }).select("id").single();
      if (error) return errorResponse(`Collegamento non salvato: ${error.message}`, 500, corsH);
      return jsonResponse({ ok: true, url: link.url, connection_id: riga.id }, 200, corsH);
    }

    // ── 2. Dopo la banca: quali conti ha scelto ──────────────────────────────
    if (azione === "finalize") {
      // Si arriva col nostro riferimento (`state`, quello messo nell'URL di ritorno)
      // oppure con l'id della riga, se l'app lo ha gia' in mano.
      let q = admin.from("bank_connections").select("id, auth_state, provider_connection_id").eq("company_id", companyId);
      q = corpo.state ? q.eq("auth_state", String(corpo.state)) : q.eq("id", String(corpo.connection_id ?? ""));
      const { data: conn } = await q.maybeSingle();
      if (!conn) return errorResponse("Collegamento non trovato", 404, corsH);

      // Distyra elenca le connessioni: si riconosce la nostra dall'external_ref.
      const elenco = await distyra("/v1/connect/connections") as { connections?: Record<string, any>[] };
      const mia = (elenco.connections ?? []).find((c) => c.external_ref === conn.auth_state);
      if (!mia) return errorResponse("La banca non ha ancora confermato il collegamento", 409, corsH);

      const conti = await distyra(`/v1/connect/connections/${mia.id}/accounts`) as { accounts?: Record<string, any>[] };
      let quanti = 0;
      for (const a of conti.accounts ?? []) {
        const uid = testo(a.account_id) ?? testo(a.uid);
        if (!uid) continue;
        const { error } = await admin.from("bank_accounts").upsert({
          company_id: companyId, connection_id: conn.id, external_account_id: uid,
          // Le banche danno l'IBAN mascherato: si salva com'è, serve solo a far riconoscere il conto.
          iban: testo(a.iban_masked), account_name: testo(a.name),
          account_owner_name: testo(a.holder_name), account_type: testo(a.account_type),
          currency: testo(a.currency) ?? "EUR", is_active: true,
          current_balance: a.balance_booked ?? a.balance ?? null,
          available_balance: a.balance_available ?? null,
          balance_updated_at: new Date().toISOString(),
        }, { onConflict: "company_id,external_account_id" });
        if (!error) quanti++;
      }
      const nomeBanca = testo(mia.aspsp_name);
      await admin.from("bank_connections").update({
        status: quanti > 0 ? "linked" : "error",
        error_message: quanti > 0 ? null : "La banca non ha dato nessun conto",
        provider_connection_id: String(mia.id),
        // institution_id e institution_name sono NOT NULL. Distyra non espone un codice
        // dell'istituto nell'elenco delle connessioni: si ricava dal nome, e se manca anche
        // quello restano i segnaposto.
        institution_id: nomeBanca ? `distyra:${nomeBanca.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ISTITUTO_IGNOTO,
        institution_name: nomeBanca ?? "Banca collegata",
        institution_country: testo(mia.country), accounts_count: quanti, last_sync_at: new Date().toISOString(),
      }).eq("id", conn.id);
      return jsonResponse({ ok: true, conti: quanti, connection_id: conn.id }, 200, corsH);
    }

    // ── 3. I movimenti ───────────────────────────────────────────────────────
    if (azione === "sync") {
      // Come finalize: si arriva col nostro riferimento o con l'id della riga.
      let qs = admin.from("bank_connections").select("id, provider_connection_id").eq("company_id", companyId);
      qs = corpo.state ? qs.eq("auth_state", String(corpo.state)) : qs.eq("id", String(corpo.connection_id ?? ""));
      const { data: conn } = await qs.maybeSingle();
      if (!conn?.provider_connection_id) return errorResponse("Collegamento non pronto", 409, corsH);

      const { data: conti } = await admin.from("bank_accounts")
        .select("id, external_account_id").eq("connection_id", conn.id);
      const perConto = new Map((conti ?? []).map((c) => [c.external_account_id, c.id]));

      // Da dove ripartire: l'ultimo movimento che abbiamo, meno qualche giorno,
      // perché le banche registrano in ritardo. L'upsert toglie i doppioni.
      const { data: ultimo } = await admin.from("bank_transactions")
        .select("booking_date").eq("company_id", companyId)
        .in("account_id", [...perConto.values()])
        .order("booking_date", { ascending: false }).limit(1).maybeSingle();
      const da = ultimo?.booking_date
        ? new Date(new Date(ultimo.booking_date).getTime() - GIORNI_DI_SICUREZZA * 86400000).toISOString().slice(0, 10)
        : null;

      const q = new URLSearchParams({ enrich: "true", resumable: "true" });
      if (da) q.set("date_from", da); else q.set("history", "all");
      let continuazione: string | null = null, scritti = 0, giri = 0;
      do {
        if (continuazione) q.set("continuation", continuazione);
        const r = await distyra(`/v1/connect/connections/${conn.provider_connection_id}/transactions?${q}`) as
          { transactions?: Record<string, any>[]; complete?: boolean; continuation?: string | null };
        const righe = (r.transactions ?? [])
          .map((t) => {
            const accId = perConto.get(String(t.account_id));
            return accId ? mappaMovimento(t, companyId, accId) : null;
          })
          .filter((x): x is ReturnType<typeof mappaMovimento> => !!x && !!x.external_transaction_id);
        // Due righe con la stessa chiave nello stesso upsert fanno fallire tutto
        // («cannot affect row a second time»): si tiene l'ultima.
        const uniche = [...new Map(righe.map((r) => [r.external_transaction_id, r])).values()];
        if (uniche.length) {
          const { error } = await admin.from("bank_transactions")
            .upsert(uniche, { onConflict: "company_id,external_transaction_id" });
          if (error) return errorResponse(`Movimenti non salvati: ${error.message}`, 500, corsH);
          scritti += uniche.length;
        }
        continuazione = r.complete === false ? (r.continuation ?? null) : null;
      } while (continuazione && ++giri < 20);

      const nomeBanca = testo(mia.aspsp_name);
      await admin.from("bank_connections").update({ last_sync_at: new Date().toISOString() }).eq("id", conn.id);
      return jsonResponse({ ok: true, movimenti: scritti }, 200, corsH);
    }

    return errorResponse("Azione sconosciuta: usa start-link, finalize o sync", 400, corsH);
  } catch (e) {
    // requireAuth e requireCompanyAccess rispondono lanciando una Response gia' pronta.
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bank-distyra]", msg);
    return errorResponse(msg, 500, getCorsHeaders(req));
  }
});
