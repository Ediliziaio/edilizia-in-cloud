import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

/**
 * sync-prima-nota: auto-import Prima Nota entries from:
 *  - bank_transactions (reconciled, not yet imported)
 *  - invoices (pagata status, not yet imported)
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const { company_id, action = "both" } = await req.json();
    if (!company_id) return errorResponse("company_id obbligatorio", 400);

    // Tenant check: l'utente deve appartenere alla company. Senza, si potevano
    // importare/scrivere prima_nota_entries per un'azienda arbitraria (e il
    // company_id finisce anche in una SQL string interpolata più sotto).
    try {
      await requireCompanyAccess(supabaseAdmin, userId, company_id, corsH);
    } catch (accessErr) {
      if (accessErr instanceof Response) return accessErr;
      return errorResponse("Forbidden", 403);
    }

    let importedBanking = 0;
    let importedInvoices = 0;

    // ── 1. Import from reconciled bank_transactions ──────────────────────────
    if (action === "from_banking" || action === "both") {
      // Fetch reconciled transactions not yet linked to a prima nota entry
      const { data: txs, error: txErr } = await supabaseAdmin
        .from("bank_transactions")
        .select("id, amount, booking_date, description, creditor_name, debtor_name, creditor_iban, debtor_iban")
        .eq("company_id", company_id)
        .eq("reconciliation_status", "reconciled")
        .not(
          "id",
          "in",
          // Subquery via inline: get already-imported bank_transaction_ids
          `(SELECT bank_transaction_id FROM prima_nota_entries WHERE company_id = '${company_id}' AND bank_transaction_id IS NOT NULL)`
        );

      if (txErr) {
        console.error("bank_transactions fetch error:", txErr);
      }

      // Fallback: use manual deduplication if the subquery syntax fails
      let bankTxs = txs;
      if (txErr || !txs) {
        const { data: txsFallback } = await supabaseAdmin
          .from("bank_transactions")
          .select("id, amount, booking_date, description, creditor_name, debtor_name, creditor_iban, debtor_iban")
          .eq("company_id", company_id)
          .eq("reconciliation_status", "reconciled");

        const { data: existingLinks } = await supabaseAdmin
          .from("prima_nota_entries")
          .select("bank_transaction_id")
          .eq("company_id", company_id)
          .not("bank_transaction_id", "is", null);

        const linkedIds = new Set((existingLinks || []).map((e: any) => e.bank_transaction_id));
        bankTxs = (txsFallback || []).filter((tx: any) => !linkedIds.has(tx.id));
      }

      for (const tx of bankTxs || []) {
        const isEntrata = (tx.amount ?? 0) >= 0;
        const counterparty = tx.creditor_name || tx.debtor_name || "Controparte banca";
        const importo = Math.abs(tx.amount ?? 0);
        if (importo === 0) continue;

        const { error: insErr } = await supabaseAdmin.from("prima_nota_entries").insert({
          company_id,
          direction: isEntrata ? "entrata" : "uscita",
          category: isEntrata ? "incasso" : "fornitore",
          description: tx.description
            ? `${counterparty} — ${tx.description}`.slice(0, 255)
            : `Movim. bancario: ${counterparty}`,
          amount: importo,
          entry_date: tx.booking_date || new Date().toISOString().split("T")[0],
          payment_method: "bonifico",
          bank_transaction_id: tx.id,
          account_label: "banca",
          is_auto: true,
          auto_source: "bank_transaction",
          created_by: userId,
        });

        if (insErr) {
          console.error("Prima nota insert (banking) failed:", insErr.message);
        } else {
          importedBanking++;
        }
      }
    }

    // ── 2. Import from paid invoices ──────────────────────────────────────────
    if (action === "from_invoices" || action === "both") {
      // Fetch paid invoices not already present in prima_nota_entries
      const { data: paidInvoices } = await supabaseAdmin
        .from("invoices")
        .select("id, invoice_number, total_amount, payment_date, due_date, contact_id, contacts(first_name, last_name, company_name)")
        .eq("company_id", company_id)
        .eq("status", "paid");

      const { data: existingInvoiceLinks } = await supabaseAdmin
        .from("prima_nota_entries")
        .select("invoice_id")
        .eq("company_id", company_id)
        .eq("is_auto", true)
        .eq("auto_source", "invoice")
        .not("invoice_id", "is", null);

      const linkedInvoiceIds = new Set((existingInvoiceLinks || []).map((e: any) => e.invoice_id));

      for (const inv of paidInvoices || []) {
        if (linkedInvoiceIds.has(inv.id)) continue;
        if (!inv.total_amount || inv.total_amount <= 0) continue;

        const contact = inv.contacts as any;
        const clienteName = contact?.company_name ||
          [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") ||
          "Cliente";

        const { error: insErr } = await supabaseAdmin.from("prima_nota_entries").insert({
          company_id,
          direction: "entrata",
          category: "incasso",
          description: `Incasso fattura ${inv.invoice_number || inv.id.slice(0, 8)} — ${clienteName}`,
          amount: inv.total_amount,
          entry_date: inv.payment_date || inv.due_date || new Date().toISOString().split("T")[0],
          payment_method: "bonifico",
          invoice_id: inv.id,
          account_label: "banca",
          is_auto: true,
          auto_source: "invoice",
          created_by: userId,
        });

        if (insErr) {
          console.error("Prima nota insert (invoice) failed:", insErr.message);
        } else {
          importedInvoices++;
        }
      }
    }

    return jsonResponse({
      success: true,
      imported_banking: importedBanking,
      imported_invoices: importedInvoices,
      total: importedBanking + importedInvoices,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${String(err)}`, 500);
  }
});
