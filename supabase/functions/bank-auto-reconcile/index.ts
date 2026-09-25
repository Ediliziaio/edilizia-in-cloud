import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireCompanyAccess } from "../_shared/auth.ts";

/**
 * bank-auto-reconcile: Riconciliazione automatica batch
 * Matcha transazioni credit non riconciliate con fatture non pagate — dei
 * gestionali esterni (invoices) e della fatturazione interna (documenti_fiscali,
 * via riconcilia_bonifico_fattura) — e transazioni debit con scadenze fornitori.
 * Usa scoring (n° fattura 60pt, importo 50pt, IBAN 30pt, nome 20pt). Soglia auto: score >= 80.
 */

// Data "di oggi" nel fuso italiano: le edge girano in UTC e a mezzanotte
// italiana toISOString() è ancora al giorno prima — le finestre a 90 giorni e
// le date di pagamento slittavano di un giorno rispetto al resto dell'app.
function localDateIT(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
}

function fuzzyMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

// Riconosce il numero fattura nella causale del bonifico (es. "FATTURA 415/2026").
// Numeri corti (<3 char) richiedono un marcatore "fattura/fatt/ft/n." per evitare falsi positivi.
function invoiceNumberInCausale(description: string | null, invoiceNumber: string | null): boolean {
  if (!description || !invoiceNumber) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const inv = norm(invoiceNumber);
  if (inv.length < 2) return false;
  if (inv.length >= 3 && norm(description).includes(inv)) return true;
  const m = description.toLowerCase().match(/(?:fattura|fatt\.?|ft\.?|n\.?)\s*0*([0-9]{1,6})(?:\s*[\/\-]\s*([0-9]{2,4}))?/);
  if (m) {
    const candidate = norm(m[1] + (m[2] || ""));
    if (candidate === inv || norm(m[1]) === inv) return true;
  }
  return false;
}

function computeMatchScore(
  tx: { amount: number; creditor_iban: string | null; debtor_iban: string | null; creditor_name: string | null; debtor_name: string | null; description: string | null },
  inv: { remaining: number; client_iban: string | null; client_company_name: string | null; invoice_number: string | null; invoice_number_breve?: string | null },
): number {
  let score = 0;

  // N° fattura nella causale: segnale più forte (la banca cita la fattura).
  // Le fatture interne anche nella forma breve «37/2026»: chi paga scrive più
  // spesso quella che «FT-2026-0037».
  if (invoiceNumberInCausale(tx.description, inv.invoice_number)
      || invoiceNumberInCausale(tx.description, inv.invoice_number_breve ?? null)) {
    score += 60;
  }

  // Importo (max 50 punti)
  const txAmount = Math.abs(tx.amount);
  const diff = Math.abs(txAmount - inv.remaining);
  if (diff === 0) {
    score += 50;
  } else if (diff <= Math.max(inv.remaining * 0.01, 5)) {
    score += 35;
  } else if (txAmount > 0 && inv.remaining > 0 && txAmount < inv.remaining) {
    // Acconto (parziale): modesto; rilevante combinato con n° fattura / IBAN / nome.
    score += 10;
  }

  // IBAN (max 30 punti)
  const normalizeIban = (s: string | null) => (s || "").replace(/\s/g, "").toUpperCase();
  const txIban = normalizeIban(tx.creditor_iban) || normalizeIban(tx.debtor_iban);
  const invIban = normalizeIban(inv.client_iban);
  if (txIban && invIban && txIban === invIban) {
    score += 30;
  }

  // Nome (max 20 punti)
  const txName = tx.creditor_name || tx.debtor_name || tx.description || "";
  const invName = inv.client_company_name || "";
  if (txName && invName && fuzzyMatch(txName, invName)) {
    score += 20;
  }

  return score;
}

// Fatture della fatturazione interna che si incassano con un bonifico: emesse,
// non saldate, non note di credito/DDT/proforma (come src/lib/finance/fattureInterneBanca.ts).
const TIPI_INCASSABILI_DA_BANCA = [
  "fattura", "fattura_pa", "parcella", "fattura_accompagnatoria", "acconto_fattura",
  "acconto_parcella", "fattura_differita_b", "fattura_riepilogativa", "nota_debito",
];
const STATI_INCASSABILI_DA_BANCA = [
  "emessa", "inviata_sdi", "consegnata", "accettata", "scaduta", "parzialmente_pagata",
];

function residuoFatturaInterna(doc: { totale_da_pagare: number | string | null; importo_pagato: number | string | null }): number {
  const residuo = Math.round((Number(doc.totale_da_pagare || 0) - Number(doc.importo_pagato || 0)) * 100) / 100;
  return residuo > 0.005 ? residuo : 0;
}

function nomeClienteSnapshot(snapshot: { ragione_sociale?: string | null; nome?: string | null; cognome?: string | null } | null): string | null {
  if (!snapshot) return null;
  const ragioneSociale = (snapshot.ragione_sociale ?? "").trim();
  if (ragioneSociale) return ragioneSociale;
  return [snapshot.nome, snapshot.cognome].filter(Boolean).join(" ").trim() || null;
}

// Scoring per le USCITE: transazione debit → scadenza fornitore (stesso schema).
function computeScadenzaScore(
  tx: { amount: number; creditor_iban: string | null; debtor_iban: string | null; creditor_name: string | null; debtor_name: string | null; description: string | null },
  sc: { remaining: number; supplier_iban: string | null; supplier_name: string | null; description: string | null },
): number {
  let score = 0;
  const txAmount = Math.abs(tx.amount);
  const diff = Math.abs(txAmount - sc.remaining);
  if (diff === 0) score += 50;
  else if (diff <= Math.max(sc.remaining * 0.01, 5)) score += 35;

  const normIban = (s: string | null) => (s || "").replace(/\s/g, "").toUpperCase();
  const txIban = normIban(tx.creditor_iban) || normIban(tx.debtor_iban);
  const scIban = normIban(sc.supplier_iban);
  if (txIban && scIban && txIban === scIban) score += 30;

  const txName = tx.creditor_name || tx.debtor_name || tx.description || "";
  const scName = sc.supplier_name || sc.description || "";
  if (txName && scName && fuzzyMatch(txName, scName)) score += 20;

  return score;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth: JWT utente o cron secret
    const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
    const requestCronSecret = req.headers.get("x-cron-secret");
    const isCronCall = cronSecret && requestCronSecret === cronSecret;

    let companyId: string | null = null;

    if (isCronCall) {
      // Cron: processa tutte le company con connessioni attive
      const body = await req.json().catch(() => ({}));
      companyId = body.company_id || null; // opzionale: limita a una company
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return errorResponse("Missing authorization", 401);
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!user) return errorResponse("Unauthorized", 401);
      const body = await req.json().catch(() => ({}));
      companyId = body.company_id;
      if (!companyId) {
        const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
        companyId = profile?.company_id;
      }
      // SICUREZZA (P0): verifica che l'utente possa operare su questa azienda.
      // Senza questo, chiunque con un JWT poteva riconciliare/pagare fatture di
      // un'ALTRA azienda passando company_id nel body (qui si usa il service-role,
      // che bypassa la RLS). requireCompanyAccess lancia 403 se non autorizzato e
      // impedisce anche il ramo "processa tutte le aziende" a un utente normale.
      await requireCompanyAccess(supabase, user.id, companyId as string, getCorsHeaders(req));
    }

    // Se non c'è company_id, processa tutte le company con connessioni attive
    let companyIds: string[] = [];
    if (companyId) {
      companyIds = [companyId];
    } else {
      const { data: companies } = await supabase
        .from("bank_connections")
        .select("company_id")
        .in("status", ["active", "linked"]);
      companyIds = [...new Set((companies || []).map((c: any) => c.company_id))];
    }

    let totalAutoMatched = 0;
    let totalCostsMatched = 0;
    let totalPendingReview = 0;
    let totalProposalsCreated = 0;
    const errors: string[] = [];

    // Risolutore user_id per company (necessario per creare ai_action_proposals).
    // Cache per evitare query ripetute nello stesso run.
    const defaultUserCache = new Map<string, string | null>();
    async function getDefaultUserId(cId: string): Promise<string | null> {
      if (defaultUserCache.has(cId)) return defaultUserCache.get(cId) ?? null;
      const { data: rl } = await supabase
        .from("user_roles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("user_id")
        .eq("company_id", cId)
        .in("role", ["company_admin", "company_staff"])
        .limit(1)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uid = (rl as any)?.user_id ?? null;
      defaultUserCache.set(cId, uid);
      return uid;
    }

    for (const cId of companyIds) {
      try {
        // ── USCITE: transazioni debit → scadenze fornitori (uscita, da_pagare) ──
        // Prima delle entrate: i «continue» del ramo entrate (nessun accredito
        // libero, nessuna fattura aperta) saltavano anche questo ramo, e gli
        // addebiti di chi non aveva fatture da incassare non si abbinavano mai.
        const ninetyDaysAgo2 = new Date(); ninetyDaysAgo2.setDate(ninetyDaysAgo2.getDate() - 90);
        const { data: debitTxs } = await supabase
          .from("bank_transactions")
          .select("id, amount, creditor_iban, debtor_iban, creditor_name, debtor_name, description, external_transaction_id, booking_date")
          .eq("company_id", cId)
          .eq("transaction_type", "debit")
          .eq("status", "booked")
          .is("linked_scadenza_id", null)
          .is("linked_cost_id", null)
          .gte("booking_date", localDateIT(ninetyDaysAgo2))
          .limit(2000);

        if (debitTxs && debitTxs.length > 0) {
          const { data: openScadenze } = await supabase
            .from("scadenze")
            .select("id, amount, paid_amount, description, due_date, supplier_id, suppliers(name, iban)")
            .eq("company_id", cId)
            .eq("direction", "uscita")
            .eq("status", "da_pagare")
            .limit(2000);

          for (const tx of debitTxs as any[]) {
            let best: { sc: any; score: number } | null = null;
            let second = 0;
            for (const sc of (openScadenze || []) as any[]) {
              const remaining = (sc.amount || 0) - (sc.paid_amount || 0);
              if (remaining <= 0) continue;
              const sup = (sc.suppliers || {}) as any;
              const score = computeScadenzaScore(tx, { remaining, supplier_iban: sup.iban ?? null, supplier_name: sup.name ?? null, description: sc.description });
              if (score < 50) continue;
              if (!best || score > best.score) { if (best) second = Math.max(second, best.score); best = { sc, score }; }
              else if (score > second) second = score;
            }
            const ambiguoSc = best != null && second >= best.score - 15;
            if (best && best.score >= 80 && !ambiguoSc) {
              const matchedAmount = Math.min(Math.abs(tx.amount), (best.sc.amount || 0) - (best.sc.paid_amount || 0));
              // Prima il registro: se non si riesce a tracciare, NON si paga.
              // (Questo insert falliva DA SEMPRE in silenzio: invoice_id era
              // NOT NULL — la migration 20280214 l'ha reso nullable — e la
              // scadenza veniva marcata pagata senza alcuna traccia.)
              const { error: recScErr } = await supabase.from("bank_reconciliations").insert({
                company_id: cId, transaction_id: tx.id, scadenza_id: best.sc.id,
                matched_amount: matchedAmount, match_type: "auto", match_score: best.score, matched_at: new Date().toISOString(),
              });
              if (recScErr) {
                console.error("bank_reconciliations insert (scadenza) failed:", recScErr.message);
                continue;
              }
              const { error: linkErr } = await supabase.from("bank_transactions").update({
                linked_scadenza_id: best.sc.id,
                reconciliation_status: "reconciled",
                reconciled_at: new Date().toISOString(),
              }).eq("id", tx.id).eq("company_id", cId);
              if (linkErr) console.error("bank_transactions link (scadenza) failed:", linkErr.message);
              const newPaid = (best.sc.paid_amount || 0) + matchedAmount;
              const { error: scErr } = await supabase.from("scadenze").update({
                paid_amount: newPaid,
                status: newPaid >= (best.sc.amount || 0) ? "pagata" : "da_pagare",
                paid_date: tx.booking_date ?? localDateIT(new Date()),
              }).eq("id", best.sc.id).eq("company_id", cId);
              if (scErr) console.error("scadenze update failed:", scErr.message);
              best.sc.paid_amount = newPaid;
              totalCostsMatched++;
            }
          }
        }

        // ── ENTRATE: transazioni credit → fatture (esterne e interne) ──
        // Transazioni credit booked non riconciliate degli ultimi 90 giorni.
        // I filtri linked_* sono la differenza tra "riconciliare" e "pagare
        // due volte": un bonifico già abbinato a una rata di commessa (flusso
        // che NON scrive bank_reconciliations) veniva riproposto qui e
        // registrato ANCHE come pagamento fattura.
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { data: unreconciledTxs } = await supabase
          .from("bank_transactions")
          .select("id, amount, booking_date, creditor_iban, debtor_iban, creditor_name, debtor_name, description, external_transaction_id")
          .eq("company_id", cId)
          .eq("transaction_type", "credit")
          .eq("status", "booked")
          .is("linked_invoice_id", null)
          .is("linked_installment_id", null)
          .is("linked_scadenza_id", null)
          .gte("booking_date", localDateIT(ninetyDaysAgo))
          .limit(2000);

        if (!unreconciledTxs || unreconciledTxs.length === 0) continue;

        // Filtra quelle già riconciliate
        const txIds = unreconciledTxs.map((t: any) => t.id);
        const { data: existingReconciliations } = await supabase
          .from("bank_reconciliations")
          .select("transaction_id")
          .in("transaction_id", txIds)
          .is("unmatched_at", null);

        const reconciledIds = new Set((existingReconciliations || []).map((r: any) => r.transaction_id));
        const txsToMatch = unreconciledTxs.filter((t: any) => !reconciledIds.has(t.id));

        if (txsToMatch.length === 0) continue;

        // Fatture non pagate
        const { data: unpaidInvoices } = await supabase
          .from("invoices")
          .select("id, total, paid_amount, client_company_name, bank_iban, external_provider, external_id, invoice_number")
          .eq("company_id", cId)
          .is("deleted_at", null)
          .not("status", "in", '("paid","cancelled","draft")')
          .limit(2000);

        // Fatture della fatturazione interna (documenti_fiscali): prima qui si
        // guardavano solo quelle dei gestionali esterni (invoices), e una fattura
        // interna pagata con un bonifico restava «da incassare» insieme alla rata
        // della commessa. Abbinata, diventa il suo incasso vero:
        // riconcilia_bonifico_fattura registra movimento, prima nota, scadenza,
        // stato e rata in una transazione.
        const { data: fattureInterne, error: fiErr } = await supabase
          .from("documenti_fiscali")
          .select("id, numero, numero_progressivo, anno, cliente_snapshot, totale_da_pagare, importo_pagato")
          .eq("company_id", cId)
          .is("deleted_at", null)
          .in("tipo", TIPI_INCASSABILI_DA_BANCA)
          .in("stato", STATI_INCASSABILI_DA_BANCA)
          .limit(2000);
        if (fiErr) console.error("documenti_fiscali fetch failed:", fiErr.message);

        const esterne = unpaidInvoices || [];
        const interne = fattureInterne || [];
        if (esterne.length === 0 && interne.length === 0) continue;

        // Matching
        for (const tx of txsToMatch) {
          // Candidati sopra soglia, esterne e interne insieme: il guard
          // anti-ambiguità le confronta tra loro, dal migliore in giù.
          const candidati: { esterna: any; interna: any; score: number }[] = [];
          for (const inv of esterne) {
            const remaining = (inv.total || 0) - (inv.paid_amount || 0);
            if (remaining <= 0) continue;

            const score = computeMatchScore(tx, {
              remaining,
              client_iban: inv.bank_iban, // bank_iban è il campo corretto (non client_iban)
              client_company_name: inv.client_company_name,
              invoice_number: inv.invoice_number,
            });
            if (score >= 50) candidati.push({ esterna: inv, interna: null, score });
          }
          for (const doc of interne) {
            const remaining = residuoFatturaInterna(doc);
            if (remaining <= 0) continue;

            const score = computeMatchScore(tx, {
              remaining,
              client_iban: null, // l'IBAN del cliente la fattura interna non lo conosce
              client_company_name: nomeClienteSnapshot(doc.cliente_snapshot),
              invoice_number: doc.numero,
              invoice_number_breve: doc.numero_progressivo && doc.anno ? `${doc.numero_progressivo}/${doc.anno}` : null,
            });
            if (score >= 50) candidati.push({ esterna: null, interna: doc, score });
          }
          candidati.sort((a, b) => b.score - a.score);
          const migliore = candidati[0];
          const secondScore = candidati[1]?.score ?? 0; // per il guard anti-ambiguità

          // Guard anti-ambiguità (come pickAutoMatch lato UI): se un secondo
          // candidato è a ≤15 punti dal migliore, NON auto-applicare (rischio di
          // pagare la fattura sbagliata) → declassa a proposta a media confidenza.
          const ambiguo = migliore != null && secondScore >= migliore.score - 15;

          if (migliore?.interna) {
            if (migliore.score >= 80 && !ambiguo) {
              const doc = migliore.interna;
              const residuo = residuoFatturaInterna(doc);
              const { error: rbErr } = await supabase.rpc("riconcilia_bonifico_fattura", {
                p_transaction_id: tx.id,
                p_documento_id: doc.id,
                p_match_type: "auto",
                p_match_score: migliore.score,
              });
              if (rbErr) {
                console.error(`riconcilia_bonifico_fattura failed for tx ${tx.id}:`, rbErr.message);
                continue;
              }
              // Il residuo locale scende: nello stesso giro la fattura non si riusa.
              doc.importo_pagato = Number(doc.importo_pagato || 0) + Math.min(Math.abs(tx.amount), residuo);
              totalAutoMatched++;
            } else {
              // Media confidenza: la proposta in chat conosce solo le fatture
              // esterne. La fattura interna compare come suggerimento sul
              // movimento in Tesoreria e si abbina con un clic.
              totalPendingReview++;
            }
            continue;
          }

          const bestMatch = migliore ? { invoice: migliore.esterna, score: migliore.score } : null;

          if (bestMatch && bestMatch.score >= 80 && !ambiguo) {
            // Auto-match
            const matchedAmount = Math.min(
              Math.abs(tx.amount),
              (bestMatch.invoice.total || 0) - (bestMatch.invoice.paid_amount || 0)
            );

            const { data: recRow, error: recErr } = await supabase.from("bank_reconciliations").insert({
              company_id: cId,
              transaction_id: tx.id,
              invoice_id: bestMatch.invoice.id,
              matched_amount: matchedAmount,
              match_type: "auto",
              match_score: bestMatch.score,
              matched_at: new Date().toISOString(),
            }).select("id").single();
            if (recErr || !recRow?.id) {
              // Senza registro NIENTE pagamento: scrivere soldi senza audit è
              // esattamente il bug che ha reso instornabili le scadenze.
              console.error("bank_reconciliations insert (invoice) failed:", recErr?.message);
              continue;
            }

            // Registra il pagamento nel ledger (il trigger ricalcola paid_amount + status).
            // reference="recon:<id>" → alla rimozione del match lo storno è preciso.
            const { error: payErr } = await supabase.from("invoice_payments").insert({
              invoice_id: bestMatch.invoice.id,
              amount: matchedAmount,
              payment_date: tx.booking_date ?? localDateIT(new Date()),
              payment_method: "bonifico",
              reference: `recon:${recRow.id}`,
              notes: `Auto-riconciliato (score: ${bestMatch.score}/100)`,
            });
            if (payErr) {
              console.error("invoice_payments insert failed:", payErr.message);
              await supabase.from("bank_reconciliations").delete().eq("id", recRow.id);
              continue;
            }

            // Simmetria col ramo DEBIT (che imposta linked_scadenza_id): marca la
            // transazione come riconciliata così le viste/idempotenza la riconoscono
            // (prima gli auto-match CREDIT restavano "non riconciliati" per le viste).
            await supabase.from("bank_transactions").update({
              linked_invoice_id: bestMatch.invoice.id,
              reconciliation_status: "reconciled",
              reconciled_at: new Date().toISOString(),
            }).eq("id", tx.id);

            // paid_amount è ricalcolato dai trigger su invoice_payments → NON
            // sovrascriverlo a mano (doppia scrittura = importi incoerenti).
            // Impostiamo solo lo stato quando la fattura risulta saldata.
            //
            // Fino al 20/09/2026 qui si scriveva anche `paid_at`, colonna che su
            // invoices NON esiste: PostgREST rifiutava tutta la UPDATE e l'errore
            // non veniva letto, così nessuna fattura riconciliata è mai passata a
            // «pagata» in EiC — mentre il pagamento partiva lo stesso verso FIC.
            const newPaidAmount = (bestMatch.invoice.paid_amount || 0) + matchedAmount;
            const fullyPaid = newPaidAmount >= (bestMatch.invoice.total || 0);
            // Per le fatture importate lo stato lo decide il gestionale esterno:
            // qui si spinge il pagamento (sotto) e l'allineamento lo riporta.
            if (fullyPaid && !bestMatch.invoice.external_provider) {
              const { error: statoErr } = await supabase.from("invoices")
                .update({ status: "paid", payment_date: tx.booking_date ?? localDateIT(new Date()) })
                .eq("id", bestMatch.invoice.id);
              if (statoErr) console.error("invoices status=paid failed:", statoErr.message);
            }

            // Write-back verso il gestionale esterno (best-effort): se la fattura è di
            // Fatture in Cloud ed è ora saldata, propaga il pagamento a FIC. Chiamata
            // interna server-side (service-role) → billing-payment-push (path interno).
            if (fullyPaid && bestMatch.invoice.external_provider === "fattureincloud") {
              try {
                await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/billing-payment-push`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ invoice_id: bestMatch.invoice.id }),
                });
              } catch (_) { /* best-effort: non blocca la riconciliazione */ }
            }

            // Aggiorna il paid_amount locale per non matchare la stessa fattura due volte
            bestMatch.invoice.paid_amount = newPaidAmount;

            totalAutoMatched++;
          } else if (bestMatch && bestMatch.score >= 50) {
            totalPendingReview++;

            // Feature #7 — Match a media confidenza: crea proposta in chat AI
            // per conferma umana. Senza questo step la transazione restava in
            // limbo (counter totalPendingReview ma niente UX visibile).
            // Idempotenza via create_proactive_proposal: se esiste già una
            // proposta pending per stessa (company, signal, tx_id) viene saltata.
            try {
              const userId = await getDefaultUserId(cId);
              if (userId) {
                const matchedAmount = Math.min(
                  Math.abs(tx.amount),
                  (bestMatch.invoice.total || 0) - (bestMatch.invoice.paid_amount || 0)
                );
                const summary = `Bonifico €${Math.abs(tx.amount).toFixed(2)} ` +
                  `da ${tx.creditor_name ?? tx.debtor_name ?? "—"} ` +
                  `→ fattura ${bestMatch.invoice.client_company_name ?? "cliente"} ` +
                  `(€${matchedAmount.toFixed(2)}, match ${bestMatch.score}/100). Confermo riconciliazione?`;
                const { error: propErr } = await supabase.rpc("create_proactive_proposal", {
                  p_company_id: cId,
                  p_user_id: userId,
                  p_persona_key: "amministrazione",
                  p_action_type: "confirm_bank_reconciliation",
                  p_summary: summary.substring(0, 200),
                  p_payload: {
                    transaction_id: tx.id,
                    invoice_id: bestMatch.invoice.id,
                    matched_amount: matchedAmount,
                    match_score: bestMatch.score,
                    tx_amount: Math.abs(tx.amount),
                    tx_counterparty: tx.creditor_name ?? tx.debtor_name ?? null,
                    invoice_client: bestMatch.invoice.client_company_name ?? null,
                    external_tx_id: tx.external_transaction_id,
                  },
                  p_signal_type: "bank_match_medium_confidence",
                  p_signal_entity_id: tx.id,
                  p_signal_metadata: {
                    score: bestMatch.score,
                    confidence: "medium",
                    matched_amount: matchedAmount,
                  },
                  // Yellow: l'azione registra un pagamento → reversibile ma
                  // tocca contabilità. La policy company decide se richiede
                  // conferma o auto_execute (mode=auto_execute consigliato solo
                  // per score >= 70).
                  p_risk_level: "yellow",
                  p_ttl_days: 7,
                });
                if (!propErr) {
                  totalProposalsCreated++;
                }
              }
            } catch (propE) {
              // Non bloccare il run principale per errori di proposta
              console.warn(`[bank-auto-reconcile] proposal creation failed for tx ${tx.id}:`, propE);
            }
          }
        }
      } catch (compErr: any) {
        console.error(`Auto-reconcile error for company ${cId}:`, compErr);
        errors.push(`${cId}: ${compErr.message}`);
      }
    }

    return jsonResponse({
      success: true,
      auto_matched: totalAutoMatched,
      costs_matched: totalCostsMatched,
      pending_review: totalPendingReview,
      proposals_created: totalProposalsCreated,
      companies_processed: companyIds.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    if (e instanceof Response) return e; // requireCompanyAccess lancia una Response 403
    const message = e instanceof Error ? e.message : String(e);
    console.error("bank-auto-reconcile error:", message);
    return errorResponse(message, 500);
  }
});
