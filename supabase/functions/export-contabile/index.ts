import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

function escCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtDate(d: string | null): string {
  if (!d) return "";
  const parts = d.split("T")[0].split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0,00";
  return n.toFixed(2).replace(".", ",");
}

function buildCsv(docs: any[]): string {
  const headers = [
    "Tipo documento",
    "Numero",
    "Data emissione",
    "Cliente",
    "P.IVA / CF Cliente",
    "Imponibile (€)",
    "IVA (€)",
    "Totale (€)",
    "Stato",
    "Pagato",
    "Note",
  ];
  const rows = docs.map((d) => {
    const snap = d.cliente_snapshot || {};
    return [
      d.tipo || "",
      d.numero || "",
      fmtDate(d.data_emissione),
      snap.ragione_sociale || snap.denominazione || `${snap.nome || ""} ${snap.cognome || ""}`.trim() || "",
      snap.partita_iva || snap.codice_fiscale || "",
      fmtNum(d.imponibile_totale),
      fmtNum(d.iva_totale),
      fmtNum(d.totale_da_pagare),
      d.stato || "",
      ((d.importo_pagato ?? 0) >= (d.totale_da_pagare ?? 0) && (d.totale_da_pagare ?? 0) > 0) ? "Sì" : "No",
      d.note_documento || "",
    ].map(escCsv).join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}

const TIPI_INTEGRAZIONE = ["autofattura", "reverse_charge_interno", "integrazione_servizi_estero", "integrazione_beni_ue", "integrazione_beni_extra_ue"];

/** Tutte le righe, non le prime mille (il limite di PostgREST). */
// deno-lint-ignore no-explicit-any
async function tutteLeRighe(pagina: (da: number, a: number) => any): Promise<{ righe: any[]; errore: unknown }> {
  const righe: unknown[] = [];
  for (let da = 0; ; da += 1000) {
    const { data, error } = await pagina(da, da + 999);
    if (error) return { righe: [], errore: error };
    righe.push(...(data ?? []));
    if ((data ?? []).length < 1000) return { righe, errore: null };
  }
}

// Le fatture dal gestionale esterno, negli stessi campi di quelle native.
// deno-lint-ignore no-explicit-any
function importataComeDocumento(i: any) {
  const credito = ["credit_note", "TD04", "TD08"].includes(i.document_type);
  return {
    tipo: credito ? "nota_credito" : i.external_document_type === "TD05" || i.document_type === "debit_note" ? "nota_debito" : "fattura",
    numero: i.invoice_number,
    data_emissione: i.issue_date,
    cliente_snapshot: { ragione_sociale: i.client_company_name, partita_iva: i.client_vat_number, codice_fiscale: i.client_fiscal_code },
    imponibile_totale: i.subtotal ?? 0,
    iva_totale: i.tax_amount ?? 0,
    totale_da_pagare: i.total ?? 0,
    stato: i.status,
    importo_pagato: i.paid_amount ?? 0,
    note_documento: i.notes,
  };
}

function buildPrimaNota(docs: any[]): string {
  const headers = [
    "Data",
    "Tipo",
    "Numero",
    "Causale",
    "Dare (€)",
    "Avere (€)",
    "Conto",
    "Controparte",
  ];
  const rows: string[] = [];
  for (const d of docs) {
    const snap = d.cliente_snapshot || {};
    const controparte = snap.ragione_sociale || snap.denominazione || `${snap.nome || ""} ${snap.cognome || ""}`.trim() || "";
    const isNotaCredito = d.tipo?.includes("nota_credito");
    // Autofatture e integrazioni: non sono ricavi né crediti, solo IVA a debito e a credito.
    if (TIPI_INTEGRAZIONE.includes(d.tipo)) {
      rows.push([fmtDate(d.data_emissione), d.tipo, d.numero || "", "IVA a credito (integrazione)", fmtNum(d.iva_totale), "", "IVA a credito", controparte].map(escCsv).join(","));
      rows.push([fmtDate(d.data_emissione), d.tipo, d.numero || "", "IVA a debito (integrazione)", "", fmtNum(d.iva_totale), "IVA a debito", controparte].map(escCsv).join(","));
      continue;
    }
    // Riga ricavi
    rows.push([
      fmtDate(d.data_emissione),
      d.tipo || "",
      d.numero || "",
      `Emissione ${d.tipo?.replace("_", " ")}`,
      isNotaCredito ? fmtNum(d.imponibile_totale) : "",
      isNotaCredito ? "" : fmtNum(d.imponibile_totale),
      "Ricavi vendite",
      controparte,
    ].map(escCsv).join(","));
    // Riga IVA (se presente)
    if ((d.iva_totale || 0) !== 0) {
      rows.push([
        fmtDate(d.data_emissione),
        d.tipo || "",
        d.numero || "",
        "IVA a debito",
        isNotaCredito ? fmtNum(d.iva_totale) : "",
        isNotaCredito ? "" : fmtNum(d.iva_totale),
        "IVA a debito",
        controparte,
      ].map(escCsv).join(","));
    }
    // Riga crediti vs clienti
    rows.push([
      fmtDate(d.data_emissione),
      d.tipo || "",
      d.numero || "",
      "Crediti vs clienti",
      isNotaCredito ? "" : fmtNum(d.totale_da_pagare),
      isNotaCredito ? fmtNum(d.totale_da_pagare) : "",
      "Crediti vs clienti",
      controparte,
    ].map(escCsv).join(","));
  }
  return [headers.join(","), ...rows].join("\n");
}

function buildXml(docs: any[], azienda: any): string {
  const escXml = (s: unknown) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const docsXml = docs
    .map((d) => {
      const snap = d.cliente_snapshot || {};
      return `  <Documento>
    <Tipo>${escXml(d.tipo)}</Tipo>
    <Numero>${escXml(d.numero)}</Numero>
    <Data>${d.data_emissione?.split("T")[0] || ""}</Data>
    <Cliente>
      <Denominazione>${escXml(snap.ragione_sociale || snap.denominazione || `${snap.nome || ""} ${snap.cognome || ""}`)}</Denominazione>
      <PIVA>${escXml(snap.partita_iva || snap.codice_fiscale || "")}</PIVA>
    </Cliente>
    <Totale_Imponibile>${fmtNum(d.imponibile_totale)}</Totale_Imponibile>
    <Totale_IVA>${fmtNum(d.iva_totale)}</Totale_IVA>
    <Totale>${fmtNum(d.totale_da_pagare)}</Totale>
    <Stato>${escXml(d.stato)}</Stato>
  </Documento>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ExportContabile>
  <Azienda>
    <RagioneSociale>${escXml(azienda?.ragione_sociale)}</RagioneSociale>
    <PIVA>${escXml(azienda?.partita_iva)}</PIVA>
  </Azienda>
  <Documenti>
${docsXml}
  </Documenti>
</ExportContabile>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { company_id, date_from, date_to, format } = await req.json();
    if (!company_id || !date_from || !date_to) {
      return new Response(JSON.stringify({ error: "company_id, date_from, date_to obbligatori" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    try {
      await verifyCompanyAccess(supabase, userId, company_id);
    } catch {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // I dati contabili non bastava essere in azienda per scaricarli (03/11/2026): serve un
    // permesso sulla finanza, oppure essere il commercialista (già verificato qui sopra).
    const { data: ruoli } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const commercialista = (ruoli ?? []).some((r: { role: string }) => r.role === "accountant");
    if (!commercialista) {
      let consentito = false;
      for (const permesso of ["can_view_billing", "can_view_prima_nota", "can_view_financial_reports"]) {
        const { data } = await supabase.rpc("has_permission_for_company", {
          _user_id: userId, _permission: permesso, _company_id: company_id,
        });
        if (data === true) { consentito = true; break; }
      }
      if (!consentito) {
        return new Response(JSON.stringify({ error: "Permesso insufficiente" }), {
          status: 403,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    // Fetch documenti fiscali
    const { righe: native, errore: docsErr } = await tutteLeRighe((da, a) => supabase
      .from("documenti_fiscali")
      .select("tipo, numero, data_emissione, cliente_snapshot, imponibile_totale, iva_totale, totale_da_pagare, stato, importo_pagato, note_documento")
      .eq("company_id", company_id)
      .is("deleted_at", null)
      .not("stato", "in", "(bozza,annullata)")
      .or("sdi_stato.is.null,sdi_stato.neq.NS")
      .gte("data_emissione", date_from)
      .lte("data_emissione", date_to)
      .in("tipo", ["fattura", "fattura_pa", "nota_credito", "nota_debito", "parcella", "fattura_riepilogativa", ...TIPI_INTEGRAZIONE])
      .order("data_emissione", { ascending: true })
      .order("id", { ascending: true })
      .range(da, a));
    const { righe: importate, errore: importateErr } = await tutteLeRighe((da, a) => supabase
      .from("invoices")
      .select("invoice_number, issue_date, client_company_name, client_vat_number, client_fiscal_code, subtotal, tax_amount, total, status, paid_amount, notes, document_type, external_document_type")
      .eq("company_id", company_id)
      .is("deleted_at", null)
      .not("external_provider", "is", null)
      .not("status", "in", "(draft,cancelled,canceled,void,deleted)")
      .gte("issue_date", date_from)
      .lte("issue_date", date_to)
      .order("issue_date", { ascending: true })
      .order("id", { ascending: true })
      .range(da, a));

    if (docsErr || importateErr) {
      return new Response(JSON.stringify({ error: "Errore nel caricamento dei documenti" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const safeDocs = [...native, ...importate.map(importataComeDocumento)]
      .sort((x, y) => String(x.data_emissione).localeCompare(String(y.data_emissione)));
    let content = "";
    let filename = "";

    const dateRange = `${date_from}_${date_to}`;
    if (format === "fatturapa_xml") {
      const { data: azienda } = await supabase
        .from("anagrafica_azienda")
        .select("ragione_sociale, partita_iva")
        .eq("company_id", company_id)
        .single();
      content = buildXml(safeDocs, azienda);
      filename = `export-contabile-${dateRange}.xml`;
    } else if (format === "prima_nota") {
      content = buildPrimaNota(safeDocs);
      filename = `prima-nota-${dateRange}.csv`;
    } else {
      content = buildCsv(safeDocs);
      filename = `export-contabile-${dateRange}.csv`;
    }

    return new Response(JSON.stringify({ content, filename, rows: safeDocs.length }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("export-contabile error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
