import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAdapter } from "../_shared/billingAdapter.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  // Fix #4: Declare variables outside try for error logging access
  let companyId: string | null = null;
  let provider: string | null = null;
  let integId: string | null = null;

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: cu } = await supabase
      .from("company_users").select("company_id").eq("user_id", user.id).single();
    if (!cu?.company_id) return json({ error: "Company not found" }, 404);
    companyId = cu.company_id;

    const body = await req.json();
    provider = body.provider;

    // Get integration
    const { data: integ } = await supabase
      .from("billing_integrations").select("*")
      .eq("company_id", companyId).eq("provider", provider!).eq("is_active", true).single();
    if (!integ) return json({ error: "Provider non connesso" }, 404);
    integId = integ.id;

    const adapter = createAdapter(integ);

    // Fetch invoices from provider
    const invoices = await fetchProviderInvoices(adapter, integ);

    let imported = 0;
    let updated = 0;

    for (const inv of invoices) {
      const externalId = inv.externalId;
      
      // Check if already exists
      const { data: existing } = await supabase
        .from("invoices")
        .select("id, external_id")
        .eq("company_id", companyId)
        .eq("external_id", externalId)
        .eq("external_provider", provider!)
        .maybeSingle();

      const invoiceData = {
        company_id: companyId,
        document_type: inv.documentType || "invoice",
        status: inv.status || "issued",
        invoice_number: inv.number,
        client_company_name: inv.clientName,
        client_vat_number: inv.clientVat || null,
        client_fiscal_code: inv.clientFiscalCode || null,
        client_address: inv.clientAddress || null,
        client_city: inv.clientCity || null,
        client_zip: inv.clientZip || null,
        client_country: inv.clientCountry || "IT",
        client_pec: inv.clientPec || null,
        client_sdi_code: inv.clientSdi || null,
        issue_date: inv.issueDate,
        due_date: inv.dueDate || null,
        subtotal: inv.subtotal || 0,
        tax_amount: inv.taxAmount || 0,
        total: inv.total || 0,
        payment_method: inv.paymentMethod || null,
        bank_iban: inv.iban || null,
        notes: inv.notes || null,
        external_provider: provider,
        external_id: externalId,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase.from("invoices").update(invoiceData).eq("id", existing.id);
        
        // Fix #5: Atomic line update — insert new first, then delete old
        if (inv.lines?.length) {
          await updateInvoiceLinesAtomically(existing.id, inv.lines);
        }
        updated++;
      } else {
        const { data: newInv } = await supabase.from("invoices").insert({
          ...invoiceData,
          created_by: user.id,
        }).select("id").single();

        if (newInv && inv.lines?.length) {
          await supabase.from("invoice_lines").insert(
            mapLinesToDb(newInv.id, inv.lines)
          );
        }
        imported++;
      }
    }

    // Update last sync
    await supabase.from("billing_integrations").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "success",
      last_sync_error: null,
    }).eq("id", integ.id);

    // Fix #8: Use correct column names for billing_sync_log
    await supabase.from("billing_sync_log").insert({
      company_id: companyId,
      provider: provider!,
      direction: "pull",
      action: "import",
      status: "success",
      response_payload: { imported, updated, total: invoices.length },
    });

    return json({ success: true, imported, updated, total: invoices.length });
  } catch (e) {
    console.error("billing-import error:", e);

    // Fix #4: Log error to billing_integrations and billing_sync_log
    if (integId) {
      try {
        await supabase.from("billing_integrations").update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "error",
          last_sync_error: String(e),
        }).eq("id", integId);
      } catch { /* best effort */ }
    }
    if (companyId && provider) {
      try {
        await supabase.from("billing_sync_log").insert({
          company_id: companyId,
          provider,
          direction: "pull",
          action: "import",
          status: "error",
          error_message: String(e),
        });
      } catch { /* best effort */ }
    }

    return json({ error: String(e) }, 500);
  }
});

// Fix #5: Atomic line update helper
function mapLinesToDb(invoiceId: string, lines: any[]) {
  return lines.map((l: any, i: number) => ({
    invoice_id: invoiceId,
    description: l.description,
    product_code: l.productCode || null,
    unit: l.unit || "pz",
    quantity: l.quantity,
    unit_price: l.unitPrice,
    discount_percent: l.discountPercent || 0,
    tax_rate: l.taxRate,
    tax_nature: l.taxNature || null,
    line_net: l.lineNet || 0,
    line_tax: l.lineTax || 0,
    line_gross: l.lineGross || 0,
    sort_order: i,
  }));
}

async function updateInvoiceLinesAtomically(invoiceId: string, lines: any[]) {
  // Read existing lines for rollback
  const { data: oldLines } = await supabase
    .from("invoice_lines").select("*").eq("invoice_id", invoiceId);

  // Delete old lines
  await supabase.from("invoice_lines").delete().eq("invoice_id", invoiceId);

  // Insert new lines
  const { error: insertErr } = await supabase.from("invoice_lines").insert(
    mapLinesToDb(invoiceId, lines)
  );

  // If insert fails, restore old lines
  if (insertErr && oldLines?.length) {
    console.error("Line insert failed, restoring old lines:", insertErr);
    const restore = oldLines.map(({ id: _id, ...rest }) => rest);
    await supabase.from("invoice_lines").insert(restore);
    throw new Error(`Failed to update invoice lines: ${insertErr.message}`);
  }
}

// Provider-specific fetch logic
async function fetchProviderInvoices(adapter: any, integ: any): Promise<any[]> {
  const provider = integ.provider;

  if (provider === "fattureincloud") return await fetchFICInvoices(integ);
  if (provider === "fattura24") return await fetchFattura24Invoices(integ);
  if (provider === "aruba") return await fetchArubaInvoices(integ);
  if (provider === "invoicetronic") return await fetchInvoicetronicInvoices(integ);

  return [];
}

async function fetchFICInvoices(integ: any): Promise<any[]> {
  const base = `https://api.fattureincloud.it/v2/c/${integ.company_external_id}`;
  const h = { Authorization: `Bearer ${integ.access_token}`, "Content-Type": "application/json" };
  
  const r = await fetch(`${base}/issued_documents?type=invoice&per_page=50&sort=-date`, { headers: h });
  if (!r.ok) throw new Error(`FIC API error: ${r.status}`);
  const d = await r.json();
  
  return (d.data || []).map((doc: any) => {
    const statusMap: Record<string, string> = {
      ok: "delivered", sending: "sent", not_sent: "issued", error: "issued",
    };
    return {
      externalId: doc.id?.toString(),
      documentType: doc.type === "credit_note" ? "credit_note" : "invoice",
      number: doc.number?.value || doc.number,
      status: statusMap[doc.status] || "issued",
      clientName: doc.entity?.name || "",
      clientVat: doc.entity?.vat_number,
      clientFiscalCode: doc.entity?.tax_code,
      clientAddress: doc.entity?.address_street,
      clientCity: doc.entity?.address_city,
      clientZip: doc.entity?.address_postal_code,
      clientCountry: doc.entity?.address_country || "IT",
      clientSdi: doc.entity?.ei_code,
      clientPec: doc.entity?.certified_email,
      issueDate: doc.date,
      dueDate: doc.due_date,
      subtotal: doc.amount_net,
      taxAmount: doc.amount_vat,
      total: doc.amount_gross,
      paymentMethod: doc.payment_method?.name,
      lines: (doc.items_list || []).map((item: any) => ({
        description: item.name,
        productCode: item.product_code,
        quantity: item.qty,
        unit: item.measure,
        unitPrice: item.net_price,
        discountPercent: item.discount,
        taxRate: item.vat?.value || 22,
        lineNet: item.net_price * item.qty * (1 - (item.discount || 0) / 100),
        lineTax: 0,
        lineGross: 0,
      })),
    };
  });
}

async function fetchFattura24Invoices(integ: any): Promise<any[]> {
  const r = await fetch("https://www.fattura24.com/api/v0/getDocuments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: integ.api_key, documentType: "FT", limit: 50 }),
  });
  if (!r.ok) throw new Error(`Fattura24 API error: ${r.status}`);
  const d = await r.json();
  
  return (d.documents || []).map((doc: any) => ({
    externalId: doc.docId?.toString(),
    documentType: "invoice",
    number: doc.number,
    status: "issued",
    clientName: doc.customerName || "",
    clientVat: doc.customerVat,
    issueDate: doc.date,
    dueDate: doc.dueDate,
    total: doc.totalAmount || 0,
    subtotal: doc.netAmount || 0,
    taxAmount: doc.vatAmount || 0,
    lines: [],
  }));
}

async function fetchArubaInvoices(integ: any): Promise<any[]> {
  const r = await fetch("https://fatturazioneelettronica.aruba.it/v1/documents?type=out&limit=50", {
    headers: { Authorization: `Bearer ${integ.api_key}`, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`Aruba API error: ${r.status}`);
  const d = await r.json();
  
  const statusMap: Record<string, string> = {
    CONSEGNATA: "delivered", INVIATA: "sent", IN_ELABORAZIONE: "sent", SCARTATA: "issued",
  };

  return (d.documents || []).map((doc: any) => ({
    externalId: doc.documentId?.toString(),
    documentType: doc.tipoDocumento === "TD04" ? "credit_note" : "invoice",
    number: doc.numero,
    status: statusMap[doc.status] || "issued",
    clientName: doc.destinatario?.denominazione || "",
    clientVat: doc.destinatario?.partitaIva,
    issueDate: doc.data,
    dueDate: doc.dataScadenza,
    total: doc.importoTotale || 0,
    subtotal: doc.imponibile || 0,
    taxAmount: doc.imposta || 0,
    lines: [],
  }));
}

async function fetchInvoicetronicInvoices(integ: any): Promise<any[]> {
  const r = await fetch("https://api.invoicetronic.com/invoice/v1/send?limit=50", {
    headers: { "x-api-key": integ.api_key, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`Invoicetronic API error: ${r.status}`);
  const d = await r.json();
  
  const statusMap: Record<string, string> = {
    Delivered: "delivered", Sent: "sent", Pending: "sent", Error: "issued",
  };

  return (d.data || d || []).map((doc: any) => ({
    externalId: doc.id?.toString(),
    documentType: doc.tipo_documento === "TD04" ? "credit_note" : "invoice",
    number: doc.numero,
    status: statusMap[doc.status] || "issued",
    clientName: doc.cessionario_committente?.denominazione || "",
    clientVat: doc.cessionario_committente?.partita_iva,
    issueDate: doc.data,
    dueDate: doc.data_scadenza,
    total: doc.importo_totale || 0,
    subtotal: 0,
    taxAmount: 0,
    lines: [],
  }));
}
