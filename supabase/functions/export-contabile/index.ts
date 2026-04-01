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
      fmtDate(d.data_documento),
      snap.denominazione || `${snap.nome || ""} ${snap.cognome || ""}`.trim() || "",
      snap.partita_iva || snap.codice_fiscale || "",
      fmtNum(d.totale_imponibile),
      fmtNum(d.totale_iva),
      fmtNum(d.totale_da_pagare),
      d.stato || "",
      d.pagato ? "Sì" : "No",
      d.note_documento || "",
    ].map(escCsv).join(",");
  });
  return [headers.join(","), ...rows].join("\n");
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
    const controparte = snap.denominazione || `${snap.nome || ""} ${snap.cognome || ""}`.trim() || "";
    const isNotaCredito = d.tipo?.includes("nota_credito");
    // Riga ricavi
    rows.push([
      fmtDate(d.data_documento),
      d.tipo || "",
      d.numero || "",
      `Emissione ${d.tipo?.replace("_", " ")}`,
      isNotaCredito ? fmtNum(d.totale_da_pagare) : "",
      isNotaCredito ? "" : fmtNum(d.totale_imponibile),
      "Ricavi vendite",
      controparte,
    ].map(escCsv).join(","));
    // Riga IVA (se presente)
    if ((d.totale_iva || 0) !== 0) {
      rows.push([
        fmtDate(d.data_documento),
        d.tipo || "",
        d.numero || "",
        "IVA a debito",
        "",
        fmtNum(d.totale_iva),
        "IVA a debito",
        controparte,
      ].map(escCsv).join(","));
    }
    // Riga crediti vs clienti
    rows.push([
      fmtDate(d.data_documento),
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
    <Data>${d.data_documento?.split("T")[0] || ""}</Data>
    <Cliente>
      <Denominazione>${escXml(snap.denominazione || `${snap.nome || ""} ${snap.cognome || ""}`)}</Denominazione>
      <PIVA>${escXml(snap.partita_iva || snap.codice_fiscale || "")}</PIVA>
    </Cliente>
    <Totale_Imponibile>${fmtNum(d.totale_imponibile)}</Totale_Imponibile>
    <Totale_IVA>${fmtNum(d.totale_iva)}</Totale_IVA>
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

    // Fetch documenti fiscali
    const { data: docs, error: docsErr } = await supabase
      .from("documenti_fiscali")
      .select("tipo, numero, data_documento, cliente_snapshot, totale_imponibile, totale_iva, totale_da_pagare, stato, pagato, note_documento")
      .eq("company_id", company_id)
      .gte("data_documento", date_from)
      .lte("data_documento", date_to)
      .in("tipo", ["fattura", "fattura_pa", "nota_credito", "nota_debito", "parcella"])
      .order("data_documento", { ascending: true });

    if (docsErr) {
      return new Response(JSON.stringify({ error: "Errore nel caricamento dei documenti" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const safeDocs = docs || [];
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
