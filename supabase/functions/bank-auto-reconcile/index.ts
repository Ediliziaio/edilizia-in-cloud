import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

/**
 * bank-auto-reconcile: Riconciliazione automatica batch
 * Matcha transazioni credit non riconciliate con fatture non pagate.
 * Usa scoring (importo 50pt, IBAN 30pt, nome 20pt). Soglia auto: score >= 80.
 */

function fuzzyMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

function computeMatchScore(
  tx: { amount: number; creditor_iban: string | null; debtor_iban: string | null; creditor_name: string | null; debtor_name: string | null; description: string | null },
  inv: { remaining: number; client_iban: string | null; client_company_name: string | null },
): number {
  let score = 0;

  // Importo (max 50 punti)
  const txAmount = Math.abs(tx.amount);
  const diff = Math.abs(txAmount - inv.remaining);
  if (diff === 0) {
    score += 50;
  } else if (diff <= Math.max(inv.remaining * 0.01, 5)) {
    score += 35;
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
        // Transazioni credit booked non riconciliate degli ultimi 90 giorni
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const { data: unreconciledTxs } = await supabase
          .from("bank_transactions")
          .select("id, amount, creditor_iban, debtor_iban, creditor_name, debtor_name, description, external_transaction_id")
          .eq("company_id", cId)
          .eq("transaction_type", "credit")
          .eq("status", "booked")
          .gte("booking_date", ninetyDaysAgo.toISOString().split("T")[0]);

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
          .select("id, total, paid_amount, client_company_name, bank_iban, external_provider, external_id")
          .eq("company_id", cId)
          .not("status", "in", '("paid","cancelled","draft")');

        if (!unpaidInvoices || unpaidInvoices.length === 0) continue;

        // Matching
        for (const tx of txsToMatch) {
          let bestMatch: { invoice: any; score: number } | null = null;
          let secondScore = 0; // per il guard anti-ambiguità

          for (const inv of unpaidInvoices) {
            const remaining = (inv.total || 0) - (inv.paid_amount || 0);
            if (remaining <= 0) continue;

            const score = computeMatchScore(tx, {
              remaining,
              client_iban: inv.bank_iban, // bank_iban è il campo corretto (non client_iban)
              client_company_name: inv.client_company_name,
            });

            if (score < 50) continue;
            if (!bestMatch || score > bestMatch.score) {
              if (bestMatch) secondScore = Math.max(secondScore, bestMatch.score);
              bestMatch = { invoice: inv, score };
            } else if (score > secondScore) {
              secondScore = score;
            }
          }

          // Guard anti-ambiguità (come pickAutoMatch lato UI): se un secondo
          // candidato è a ≤15 punti dal migliore, NON auto-applicare (rischio di
          // pagare la fattura sbagliata) → declassa a proposta a media confidenza.
          const ambiguo = bestMatch != null && secondScore >= bestMatch.score - 15;

          if (bestMatch && bestMatch.score >= 80 && !ambiguo) {
            // Auto-match
            const matchedAmount = Math.min(
              Math.abs(tx.amount),
              (bestMatch.invoice.total || 0) - (bestMatch.invoice.paid_amount || 0)
            );

            const { data: recRow } = await supabase.from("bank_reconciliations").insert({
              company_id: cId,
              transaction_id: tx.id,
              invoice_id: bestMatch.invoice.id,
              matched_amount: matchedAmount,
              match_type: "auto",
              match_score: bestMatch.score,
              matched_at: new Date().toISOString(),
            }).select("id").single();

            // Registra il pagamento nel ledger (il trigger ricalcola paid_amount + status).
            // reference="recon:<id>" → alla rimozione del match lo storno è preciso.
            await supabase.from("invoice_payments").insert({
              invoice_id: bestMatch.invoice.id,
              amount: matchedAmount,
              payment_date: new Date().toISOString().split("T")[0],
              payment_method: "bonifico",
              reference: recRow?.id ? `recon:${recRow.id}` : tx.external_transaction_id,
              notes: `Auto-riconciliato (score: ${bestMatch.score}/100)`,
            });

            // paid_amount è ricalcolato dai trigger su invoice_payments → NON
            // sovrascriverlo a mano (doppia scrittura = importi incoerenti).
            // Impostiamo solo status/paid_at quando la fattura risulta saldata.
            const newPaidAmount = (bestMatch.invoice.paid_amount || 0) + matchedAmount;
            const fullyPaid = newPaidAmount >= (bestMatch.invoice.total || 0);
            if (fullyPaid) {
              await supabase.from("invoices")
                .update({ status: "paid", paid_at: new Date().toISOString() })
                .eq("id", bestMatch.invoice.id);
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
        // ── USCITE: transazioni debit → scadenze fornitori (uscita, da_pagare) ──
        const ninetyDaysAgo2 = new Date(); ninetyDaysAgo2.setDate(ninetyDaysAgo2.getDate() - 90);
        const { data: debitTxs } = await supabase
          .from("bank_transactions")
          .select("id, amount, creditor_iban, debtor_iban, creditor_name, debtor_name, description, external_transaction_id, booking_date")
          .eq("company_id", cId)
          .eq("transaction_type", "debit")
          .eq("status", "booked")
          .is("linked_scadenza_id", null)
          .gte("booking_date", ninetyDaysAgo2.toISOString().split("T")[0]);

        if (debitTxs && debitTxs.length > 0) {
          const { data: openScadenze } = await supabase
            .from("scadenze")
            .select("id, amount, paid_amount, description, due_date, supplier_id, suppliers(name, iban)")
            .eq("company_id", cId)
            .eq("direction", "uscita")
            .eq("status", "da_pagare");

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
              await supabase.from("bank_reconciliations").insert({
                company_id: cId, transaction_id: tx.id, scadenza_id: best.sc.id,
                matched_amount: matchedAmount, match_type: "auto", match_score: best.score, matched_at: new Date().toISOString(),
              });
              await supabase.from("bank_transactions").update({ linked_scadenza_id: best.sc.id }).eq("id", tx.id);
              const newPaid = (best.sc.paid_amount || 0) + matchedAmount;
              await supabase.from("scadenze").update({
                paid_amount: newPaid,
                status: newPaid >= (best.sc.amount || 0) ? "pagata" : "da_pagare",
                paid_date: tx.booking_date ?? new Date().toISOString().split("T")[0],
              }).eq("id", best.sc.id);
              best.sc.paid_amount = newPaid;
              totalCostsMatched++;
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
    const message = e instanceof Error ? e.message : String(e);
    console.error("bank-auto-reconcile error:", message);
    return errorResponse(message, 500);
  }
});
