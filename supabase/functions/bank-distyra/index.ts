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
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { verificaPermessoAzienda } from "../_shared/permessoAzienda.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { contoDistyra, DistyraError, erroreDistyra, intestazioniPsu } from "../_shared/distyra.ts";

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
    throw erroreDistyra(r.status, corpo as Record<string, unknown> | null);
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

serveConMetricheRapida("bank-distyra", async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
  let scheduledRun: string | null = null;
  let scheduledConnection: string | null = null;
  try {
    const corpo = await req.json().catch(() => ({})) as Record<string, any>;
    const azione = String(corpo.action ?? "");
    const companyId = String(corpo.company_id ?? "");
    if (!companyId) return errorResponse("company_id richiesto", 400, corsH);
    const scheduled = azione === "sync-scheduled";
    let userId = "";
    if (scheduled) {
      if (!cronSecretValido(req)) return errorResponse("Accesso interno negato", 401, corsH);
      const { data: run, error } = await admin.from("bank_sync_runs").update({status:"running",started_at:new Date().toISOString()})
        .eq("id",String(corpo.run_id ?? "")).eq("company_id",companyId).eq("connection_id",String(corpo.connection_id ?? "")).eq("status","queued").select("id").maybeSingle();
      if(error) throw new Error("Impossibile prendere in carico la sincronizzazione");
      if(!run) return jsonResponse({ok:true,skipped:true},200,corsH);
      scheduledRun=run.id; scheduledConnection=String(corpo.connection_id);
      const {data:settings,error:settingsError}=await admin.from("bank_sync_settings").select("automatic_sync").eq("company_id",companyId).maybeSingle();
      if(settingsError || !settings?.automatic_sync) throw new Error("Aggiornamento automatico non abilitato");
    } else {
    const auth = await requireAuth(req, corsH);
    userId = auth.userId;
    const supabaseAdmin = auth.supabaseAdmin;
    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsH);
    await verificaPermessoAzienda(supabaseAdmin, userId, companyId, ["can_view_tesoreria"], "consultare i movimenti bancari");
    if (azione !== "sync") {
      await verificaPermessoAzienda(supabaseAdmin, userId, companyId, ["can_edit_settings_integrations"], "modificare i collegamenti bancari");
      await verificaPermessoAzienda(supabaseAdmin, userId, companyId, ["can_view_bank_balances"], "autorizzare i conti bancari");
    }


    }

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
      let q = admin.from("bank_connections").select("id, auth_state, provider_connection_id, provider_slug").eq("company_id", companyId).eq("provider_slug", PROVIDER).neq("status","disconnected");
      q = corpo.state ? q.eq("auth_state", String(corpo.state)) : q.eq("id", String(corpo.connection_id ?? ""));
      const { data: conn, error: connectionError } = await q.maybeSingle();
      if (connectionError) throw new Error("Impossibile leggere il collegamento bancario");
      if (!conn) return errorResponse("Collegamento non trovato", 404, corsH);

      // Distyra elenca le connessioni: si riconosce la nostra dall'external_ref.
      const elenco = await distyra("/v1/connect/connections") as { connections?: Record<string, any>[] };
      const mia = (elenco.connections ?? []).find((c) => c.external_ref === conn.auth_state);
      if (!mia) return errorResponse("La banca non ha ancora confermato il collegamento", 409, corsH);
      if (mia.status === "pending") return errorResponse("La banca sta ancora completando il consenso. Riprova fra poco senza creare un nuovo collegamento.", 409, corsH);

      // Basta l'elenco già autorizzato: leggere i saldi qui consumava una delle
      // quattro richieste automatiche, anche quando il salvataggio poi falliva.
      const conti = await distyra(`/v1/connect/connections/${mia.id}/accounts?balances=false&allow_stored=true`) as { accounts?: Record<string, any>[] };
      if (!Array.isArray(conti.accounts) || !conti.accounts.length) return errorResponse("La banca non ha ancora reso disponibili i conti. Riprova fra poco senza ricollegare.", 409, corsH);
      let quanti = 0;
      for (const a of conti.accounts ?? []) {
        const { error } = await admin.from("bank_accounts").upsert(contoDistyra(a, companyId, conn.id), { onConflict: "company_id,external_account_id" });
        if (error) throw new Error("Impossibile salvare i conti ricevuti dalla banca. Il consenso resta valido: riprova senza ricollegare.");
        quanti++;
      }
      const nomeBanca = testo(mia.aspsp_name);
      const { error: updateError } = await admin.from("bank_connections").update({
        status: quanti > 0 ? "linked" : "error",
        error_message: quanti > 0 ? null : "La banca non ha dato nessun conto",
        provider_connection_id: String(mia.id),
        // institution_id e institution_name sono NOT NULL. Distyra non espone un codice
        // dell'istituto nell'elenco delle connessioni: si ricava dal nome, e se manca anche
        // quello restano i segnaposto.
        institution_id: nomeBanca ? `distyra:${nomeBanca.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ISTITUTO_IGNOTO,
        institution_name: nomeBanca ?? "Banca collegata",
        institution_country: testo(mia.country), accounts_count: quanti,
      }).eq("id", conn.id);
      if (updateError) throw new Error("Conti salvati, ma il collegamento non è stato aggiornato. Riprova senza ricollegare.");
      return jsonResponse({ ok: true, conti: quanti, connection_id: conn.id }, 200, corsH);
    }

    // ── 3. I movimenti ───────────────────────────────────────────────────────
    if (azione === "sync" || scheduled) {
      // Come finalize: si arriva col nostro riferimento o con l'id della riga.
      let qs = admin.from("bank_connections").select("id, provider_connection_id, created_by").eq("company_id", companyId).eq("provider_slug", PROVIDER).eq("status", "linked");
      qs = corpo.state ? qs.eq("auth_state", String(corpo.state)) : qs.eq("id", String(corpo.connection_id ?? ""));
      const { data: conn, error: connectionError } = await qs.maybeSingle();
      if (connectionError) throw new Error("Impossibile leggere il collegamento bancario");
      if (!conn?.provider_connection_id) { if(scheduled) throw new Error("Collegamento non pronto"); return errorResponse("Collegamento non pronto", 409, corsH); }

      const { data: conti, error: accountsError } = await admin.from("bank_accounts")
        .select("id, external_account_id").eq("connection_id", conn.id).eq("company_id", companyId).eq("is_active", true);
      if (accountsError) throw new Error("Impossibile leggere i conti collegati");
      const perConto = new Map((conti ?? []).map((c) => [c.external_account_id, c.id]));
      if (!perConto.size) { if(scheduled) throw new Error("Nessun conto selezionato per questa banca"); return errorResponse("Scegli prima i conti da utilizzare nella scheda Banche. Non serve creare un nuovo collegamento.", 409, corsH); }
      const psuHeaders = scheduled ? {} : intestazioniPsu(req, corpo.on_screen, conn.created_by, userId);
      // I saldi aggiornati sono utili quando il titolare attende sullo schermo.
      // Le sincronizzazioni automatiche non consumano una richiesta extra per i saldi.
      if (scheduled || Object.keys(psuHeaders).length) {
        const saldi = await distyra(`/v1/connect/connections/${conn.provider_connection_id}/accounts`, { headers: psuHeaders }) as { accounts?: Record<string, unknown>[] };
        for (const a of saldi.accounts ?? []) {
          const riga = contoDistyra(a, companyId, conn.id);
          if (!perConto.has(riga.external_account_id)) continue;
          const { company_id: _company, connection_id: _connection, external_account_id: _external, ...campi } = riga;
          const { error } = await admin.from("bank_accounts").update(campi).eq("company_id", companyId).eq("id", perConto.get(riga.external_account_id)!);
          if (error) throw new Error("Impossibile aggiornare i saldi bancari");
        }
      }

      // Da dove ripartire: l'ultimo movimento che abbiamo.
      // A newly selected account may have no history even if the other account
      // was synchronized today. Never start its import at the other account's watermark.
      const ultimeDate = await Promise.all([...perConto.values()].map(async accountId => {
        const {data,error}=await admin.from("bank_transactions").select("booking_date").eq("company_id",companyId)
          .eq("account_id",accountId).order("booking_date",{ascending:false}).limit(1).maybeSingle();
        if(error) throw new Error("Impossibile leggere il punto di ripresa dei movimenti");
        return data?.booking_date?String(data.booking_date).slice(0,10):null;
      }));
      const ultimoGiorno=ultimeDate.every(Boolean)?(ultimeDate as string[]).sort()[0]:null;
      const giorno = (d: string, delta: number) =>
        new Date(new Date(d).getTime() + delta * 86400000).toISOString().slice(0, 10);

      /**
       * Scarica una finestra e salva.
       *
       * `arricchisci` costa: con la chiave di produzione OGNI movimento restituito con
       * enrich=true conta sul tetto mensile, anche se lo avevamo gia' arricchito prima.
       * Per questo le finestre sono due e non si sovrappongono nell'arricchimento:
       * i giorni nuovi si arricchiscono una volta sola, il recupero dei ritardatari
       * si scarica grezzo. `soloNuovi` protegge le righe gia' arricchite: inserisce i
       * movimenti che mancano e non tocca quelli che ci sono gia'.
       */
      const scarica = async (par: Record<string, string>, arricchisci: boolean, soloNuovi: boolean) => {
        const q = new URLSearchParams({ ...par, resumable: "true" });
        if (arricchisci) q.set("enrich", "true");
        let continuazione: string | null = null, n = 0, giri = 0;
        do {
          if (continuazione) q.set("continuation", continuazione);
          const r = await distyra(`/v1/connect/connections/${conn.provider_connection_id}/transactions?${q}`, { headers: psuHeaders }) as
            { transactions?: Record<string, any>[]; complete?: boolean; continuation?: string | null };
          const righe = (r.transactions ?? [])
            .map((t) => {
              const accId = perConto.get(String(t.account_id));
              return accId ? mappaMovimento(t, companyId, accId) : null;
            })
            .filter((x): x is ReturnType<typeof mappaMovimento> => !!x && !!x.external_transaction_id);
          // Due righe con la stessa chiave nello stesso upsert fanno fallire tutto
          // («cannot affect row a second time»): si tiene l'ultima.
          const uniche = [...new Map(righe.map((x) => [x.external_transaction_id, x])).values()];
          if (uniche.length) {
            // The scheduled lookback refreshes booking status without buying the
            // same enrichment twice or discarding enrichment already paid for.
            if(!arricchisci && !soloNuovi) {
              for(let offset=0;offset<uniche.length;offset+=40) {
                const batch=uniche.slice(offset,offset+40);
                const {data:stored,error}=await admin.from("bank_transactions").select("external_transaction_id,metadata").eq("company_id",companyId).in("external_transaction_id",batch.map(x=>x.external_transaction_id));
                if(error) throw new Error("Impossibile conservare i dati dei movimenti già importati");
                const enrichment=new Map((stored??[]).map(x=>[x.external_transaction_id,x.metadata?.enrichment]));
                for(const row of batch) if(!row.metadata.enrichment && enrichment.get(row.external_transaction_id)) row.metadata={...row.metadata,enrichment:enrichment.get(row.external_transaction_id)};
              }
            }
            const { error } = await admin.from("bank_transactions").upsert(uniche, {
              onConflict: "company_id,external_transaction_id",
              ignoreDuplicates: soloNuovi,
            });
            if (error) throw new Error(`Movimenti non salvati: ${error.message}`);
            n += uniche.length;
          }
          if(r.complete===false&&!r.continuation) throw new Error("La banca ha restituito uno storico incompleto senza punto di ripresa.");
          continuazione = r.complete === false ? (r.continuation ?? null) : null;
        } while (continuazione && ++giri < 20);
        if(continuazione) throw new Error("Importazione parziale: la banca richiede ulteriori pagine. Riprova al prossimo aggiornamento.");
        return n;
      };

      let scritti = 0;
      if (scheduled) {
        // Two scheduled rounds fit the four automatic reads: one balances call
        // and one transaction window per round (pagination remains provider-controlled).
        scritti=await scarica(ultimoGiorno?{date_from:giorno(ultimoGiorno,-GIORNI_DI_SICUREZZA)}:{history:"all"},false,false);
      } else if (!ultimoGiorno) {
        // Primo scarico: tutto lo storico che la banca concede. Distyra arricchisce da se'
        // solo gli ultimi 90 giorni se non si chiede `enrich_history=all`, quindi il tetto
        // mensile non se ne va in una volta su anni di movimenti.
        scritti = await scarica({ history: "all" }, true, false);
      } else {
        // I giorni nuovi, arricchiti una volta sola.
        scritti = await scarica({ date_from: giorno(ultimoGiorno, 1) }, true, false);
        // I ritardatari: le banche registrano in ritardo, quindi si ripassa la finestra
        // gia' vista, ma grezza e senza toccare le righe gia' salvate.
        scritti += await scarica(
          { date_from: giorno(ultimoGiorno, -GIORNI_DI_SICUREZZA), date_to: ultimoGiorno },
          false,
          true,
        );
      }

      const {error:syncError}=await admin.from("bank_connections").update({ last_sync_at: new Date().toISOString(), error_message:null }).eq("id", conn.id).eq("company_id",companyId);
      if(syncError) throw new Error("Movimenti salvati, ma aggiornamento dello stato non riuscito");
      if(scheduledRun) {
        const {error}=await admin.from("bank_sync_runs").update({status:"completed",movements:scritti,finished_at:new Date().toISOString()}).eq("id",scheduledRun);
        if(error) throw new Error("Impossibile salvare l'esito della sincronizzazione");
      }
      return jsonResponse({ ok: true, movimenti: scritti }, 200, corsH);
    }

    // ── 4. Staccare la banca ─────────────────────────────────────────────────
    // Serve davvero: ogni connessione viva costa, quindi chi collega deve poter chiudere.
    if (azione === "disconnect") {
      const { data: conn } = await admin.from("bank_connections")
        .select("id, provider_connection_id").eq("company_id", companyId)
        .eq("id", String(corpo.connection_id ?? "")).eq("provider_slug",PROVIDER).maybeSingle();
      if (!conn) return errorResponse("Collegamento non trovato", 404, corsH);
      if (conn.provider_connection_id) {
        // Se Distyra l'ha gia' chiusa per conto suo va bene lo stesso: quello che conta
        // e' che da qui in poi non risulti piu' attiva.
        try { await distyra(`/v1/connect/connections/${conn.provider_connection_id}`, { method: "DELETE" }); }
        catch (e) { if(!(e instanceof DistyraError && [404,410].includes(e.status))) throw e; }
      }
      const {error:disconnectError}=await admin.from("bank_connections")
        .update({ status: "disconnected", error_message: null }).eq("id", conn.id).eq("company_id",companyId);
      if(disconnectError) throw new Error("Consenso chiuso ma stato locale non aggiornato: riprova la disconnessione.");
      const {error:accountError}=await admin.from("bank_accounts").update({ is_active: false }).eq("connection_id", conn.id).eq("company_id",companyId);
      if(accountError) throw new Error("Consenso chiuso ma conti locali non aggiornati: riprova la disconnessione.");
      const {data:closedAccounts,error:closedReadError}=await admin.from("bank_accounts").select("id").eq("connection_id",conn.id).eq("company_id",companyId);
      if(closedReadError) throw new Error("Consenso chiuso: riprova per aggiornare la selezione dei conti.");
      if(closedAccounts?.length) {
        const {error}=await admin.from("bank_account_choices").delete().eq("company_id",companyId).in("account_id",closedAccounts.map(a=>a.id));
        if(error) throw new Error("Consenso chiuso: riprova per liberare i posti dei conti selezionati.");
      }
      return jsonResponse({ ok: true }, 200, corsH);
    }

    return errorResponse("Azione sconosciuta: usa start-link, finalize, sync o disconnect", 400, corsH);
  } catch (e) {
    if(scheduledRun) {
      const message=e instanceof Error?e.message:"Aggiornamento non riuscito";
      await admin.from("bank_sync_runs").update({status:"failed",error_message:message.slice(0,500),finished_at:new Date().toISOString()}).eq("id",scheduledRun);
      await admin.from("bank_connections").update({error_message:message.slice(0,500)}).eq("id",scheduledConnection!);
    }
    // requireAuth e requireCompanyAccess rispondono lanciando una Response gia' pronta.
    if (e instanceof Response) return e;
    if (e instanceof DistyraError) {
      console.error("[bank-distyra]", { code: e.code, status: e.status });
      return jsonResponse({ error: e.message, code: e.code, retry_after_seconds: e.retryAfter, resets_at: e.resetsAt }, e.status, corsH);
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("Non autorizzato")) return errorResponse("Accesso negato ai collegamenti bancari", 403, corsH);
    console.error("[bank-distyra]", msg);
    return errorResponse(msg, 500, getCorsHeaders(req));
  }
});
