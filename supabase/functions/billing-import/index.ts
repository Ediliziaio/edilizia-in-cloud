import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAdapter, arubaSignin, arubaRefresh, arubaFindByUsername, ARUBA_STATUS_MAP } from "../_shared/billingAdapter.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FIC_CLIENT_ID = Deno.env.get("FIC_CLIENT_ID") || "";
const FIC_CLIENT_SECRET = Deno.env.get("FIC_CLIENT_SECRET") || "";

Deno.serve(async (req) => {
  const cors = { ...getCorsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

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
        paid_amount: inv.paidAmount || 0,
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
  if (provider === "itala") return await fetchItalaInvoices(integ);

  return [];
}

// FIX AUDIT: l'import non rinfrescava il token FIC (lo faceva solo billing-sync)
// → dopo la scadenza l'import andava in 401. Ora, se il token è scaduto/quasi,
// lo rinnoviamo col refresh_token e aggiorniamo il DB prima di chiamare l'API.
async function ensureFreshFicToken(integ: any): Promise<void> {
  const exp = integ.token_expires_at ? new Date(integ.token_expires_at).getTime() : 0;
  if (exp && exp - Date.now() > 60_000) return; // ancora valido (>60s)
  if (!integ.refresh_token || !FIC_CLIENT_ID || !FIC_CLIENT_SECRET) return; // niente refresh possibile
  try {
    const r = await fetch("https://api.fattureincloud.it/v2/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: FIC_CLIENT_ID,
        client_secret: FIC_CLIENT_SECRET,
        refresh_token: integ.refresh_token,
      }),
    });
    if (!r.ok) return; // lascia il token vecchio: l'API darà 401 con messaggio chiaro
    const td = await r.json();
    if (!td.access_token) return;
    integ.access_token = td.access_token; // aggiorna in-memory per questa run
    await supabase.from("billing_integrations").update({
      access_token: td.access_token,
      refresh_token: td.refresh_token || integ.refresh_token,
      token_expires_at: new Date(Date.now() + (td.expires_in || 86400) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", integ.id);
  } catch { /* best effort: se il refresh fallisce procediamo col token attuale */ }
}

async function fetchFICInvoices(integ: any): Promise<any[]> {
  await ensureFreshFicToken(integ);
  const base = `https://api.fattureincloud.it/v2/c/${integ.company_external_id}`;
  const h = { Authorization: `Bearer ${integ.access_token}`, "Content-Type": "application/json" };

  // Paginate through all results (100 per page max)
  const allDocs: any[] = [];
  let currentPage = 1;
  while (true) {
    const r = await fetch(`${base}/issued_documents?type=invoice&per_page=100&page=${currentPage}&sort=-date`, { headers: h });
    if (r.status === 401) throw new Error("Token FattureInCloud scaduto. Vai in Impostazioni → Integrazioni e riconnetti l'account.");
    if (!r.ok) throw new Error(`FIC API error: ${r.status}`);
    const d = await r.json();

    const docs = d.data || [];
    allDocs.push(...docs);

    // Stop if last page
    const pagination = d.pagination || {};
    if (!pagination.next_page || docs.length < 100) break;
    currentPage++;
    if (currentPage > 20) break; // safety cap: max 2000 invoices
  }

  const statusMap: Record<string, string> = {
    ok: "delivered", sending: "sent", not_sent: "issued", error: "issued",
  };

  return allDocs.map((doc: any) => {
    const isPaid = doc.is_marked === true || (doc.payments_sum != null && doc.payments_sum >= (doc.amount_gross || 0) && doc.amount_gross > 0);
    const resolvedStatus = isPaid ? "paid" : (statusMap[doc.status] || "issued");

    return {
      externalId: doc.id?.toString(),
      documentType: doc.type === "credit_note" ? "credit_note" : "invoice",
      number: doc.number?.value || doc.number,
      status: resolvedStatus,
      paidAmount: isPaid ? doc.amount_gross : (doc.payments_sum || 0),
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
      lines: (doc.items_list || []).map((item: any) => {
        const taxRate = item.vat?.value || 22;
        const lineNet = Math.round(item.net_price * item.qty * (1 - (item.discount || 0) / 100) * 100) / 100;
        const lineTax = Math.round(lineNet * (taxRate / 100) * 100) / 100;
        return {
          description: item.name,
          productCode: item.product_code,
          quantity: item.qty,
          unit: item.measure,
          unitPrice: item.net_price,
          discountPercent: item.discount,
          taxRate,
          lineNet,
          lineTax,
          lineGross: Math.round((lineNet + lineTax) * 100) / 100,
        };
      }),
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

// Aruba: cache del token (reuse → refresh → signin). /auth/signin è limitato a
// 1/min, quindi rinnoviamo via refresh_token quando possibile e rifacciamo il signin
// (con username+password salvati) solo se il refresh non è disponibile/scaduto.
async function ensureFreshArubaToken(integ: any): Promise<string> {
  const exp = integ.token_expires_at ? new Date(integ.token_expires_at).getTime() : 0;
  if (integ.access_token && exp - Date.now() > 120_000) return integ.access_token; // valido >2min

  let tok: { access_token: string; refresh_token?: string; expires_in: number } | null = null;
  if (integ.refresh_token) {
    try { tok = await arubaRefresh(integ.refresh_token); } catch { /* refresh scaduto → signin */ }
  }
  if (!tok) {
    if (!integ.company_external_id || !integ.api_key)
      throw new Error("Aruba: credenziali mancanti. Riconnetti l'account in Impostazioni → Provider esterni.");
    tok = await arubaSignin(integ.company_external_id, integ.api_key);
  }

  integ.access_token = tok.access_token; // aggiorna in-memory per questa run
  await supabase.from("billing_integrations").update({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || integ.refresh_token,
    token_expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", integ.id);
  return tok.access_token;
}

async function fetchArubaInvoices(integ: any): Promise<any[]> {
  const token = await ensureFreshArubaToken(integ);
  const username = integ.company_external_id;
  const out: any[] = [];
  let page = 1;
  while (true) {
    const d = await arubaFindByUsername(token, username, { page, size: 50 });
    const content = (d.content || []) as any[];
    for (const item of content) {
      const sdiId = item.idSdi?.toString();
      const receiver = item.receiver || {};
      // Un singolo file XML può contenere più fatture (ordinaria): iteriamo invoices[].
      for (const inv of (item.invoices || [])) {
        out.push({
          externalId: item.id?.toString() ?? `${item.filename}:${inv.number}`,
          documentType: "invoice", // il tipo TD reale è nell'XML, non nella lista Aruba
          number: inv.number,
          status: ARUBA_STATUS_MAP[inv.status] || "issued",
          externalStatus: inv.status,
          clientName: receiver.description || "",
          clientVat: receiver.vatCode,
          clientFiscalCode: receiver.fiscalCode,
          clientCountry: receiver.countryCode || "IT",
          issueDate: inv.invoiceDate,
          // ⚠️ Aruba NON espone gli importi nella lista (servirebbe l'XML p7m firmato):
          // header + stato SDI sono importati; i totali restano 0 (limite API Aruba).
          total: 0, subtotal: 0, taxAmount: 0,
          sdiId,
          lines: [],
        });
      }
    }
    const totalPages = d.totalPages || 1;
    if (page >= totalPages) break;
    page++;
    if (page > 20) break; // safety cap: max ~1000 fatture
  }
  return out;
}

async function fetchInvoicetronicInvoices(integ: any): Promise<any[]> {
  const r = await fetch("https://api.invoicetronic.com/invoice/v1/send?limit=50", {
    headers: { "x-api-key": integ.api_key, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`Invoicetronic API error: ${r.status}`);
  const d = await r.json();
  
  const statusMap: Record<string, string> = {
    Delivered: "delivered", Sent: "sent", Pending: "sent",
    Error: "issued", Paid: "paid", Accepted: "delivered",
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

// ITALA (fattura-elettronica-api.it) — intermediario SDI. Bearer token per-account.
// GET /fatture paginato (per_page max 1000). Stato SDI in sdi_stato.
// NOTA: i nomi esatti dei campi della risposta non sono stati verificati su un
// account reale → mapping difensivo. Da validare al primo collegamento vero.
async function fetchItalaInvoices(integ: any): Promise<any[]> {
  const base = "https://fattura-elettronica-api.it/ws2.0/prod";
  const h = { Authorization: `Bearer ${integ.api_key}`, "Content-Type": "application/json" };
  const all: any[] = [];
  let page = 1;
  while (true) {
    const r = await fetch(`${base}/fatture?per_page=100&page=${page}`, { headers: h });
    if (r.status === 401) throw new Error("Token ITALA non valido. Verifica la chiave in Impostazioni → Provider esterni.");
    if (!r.ok) throw new Error(`ITALA API error: ${r.status}`);
    const d = await r.json();
    const docs = d.fatture || d.data || (Array.isArray(d) ? d : []);
    all.push(...docs);
    if (docs.length < 100) break;
    page++;
    if (page > 20) break; // safety cap
  }
  const statusMap: Record<string, string> = {
    INVI: "sent", PREN: "sent", CONS: "delivered", ERRO: "issued", NONC: "issued",
    ACCE: "delivered", RIFI: "issued", DECO: "delivered",
  };
  return all.map((doc: any) => ({
    externalId: (doc.id ?? doc.sdi_id ?? doc.sdi_identificativo)?.toString(),
    documentType: "invoice",
    number: doc.numero ?? doc.number,
    status: statusMap[doc.sdi_stato] || "issued",
    clientName: doc.cliente?.denominazione ?? doc.denominazione ?? "",
    clientVat: doc.cliente?.partita_iva ?? doc.partita_iva,
    issueDate: doc.data ?? doc.data_documento,
    dueDate: doc.data_scadenza,
    total: doc.totale ?? doc.importo_totale ?? 0,
    subtotal: doc.imponibile ?? 0,
    taxAmount: doc.imposta ?? 0,
    lines: [],
  }));
}
