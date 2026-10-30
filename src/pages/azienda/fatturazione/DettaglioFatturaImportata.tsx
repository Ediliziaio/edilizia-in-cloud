import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CreditCard, Download, ExternalLink, FileCode, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { leggiOriginaleEmessa, scaricaFileOriginale } from "@/lib/fatturazione/originaleEmessaImportata";
import { PreviewFattura } from "@/components/fatturazione/PreviewFattura";
import { StatoBadge } from "@/components/fatturazione/StatoBadge";
import { EmessaImportataDettaglio } from "@/components/fatturazione/EmessaImportataDettaglio";
import { CollegamentiEmessaImportata } from "@/components/fatturazione/CollegamentiEmessaImportata";
import { PROVIDER_LABELS, SegnaPagataImportataDialog, importataPagabile, residuoImportata } from "@/components/fatturazione/GestionaleEsterno";
import { KpiMobili } from "@/components/mobile/FiltriMobile";
import { IncassiFatturaImportata } from "@/components/fatturazione/IncassiFattura";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { DocumentoFiscale, RigaDocumento, RiepilogoIVA, StatoDocumento, TipoDocumento } from "@/types/fatturazione";
import type { EditorState } from "./editor/useEditorState";

/**
 * Il dettaglio di una fattura emessa con un altro programma e importata. Stessa
 * impaginazione del dettaglio nativo (titolo, azioni in fila, anteprima del foglio,
 * informazioni e pagamenti sotto), ma in sola lettura: niente modifica, duplica,
 * nota di credito o invio allo SDI — li fa il gestionale da cui la fattura arriva.
 */

const TIPO_LABELS: Partial<Record<TipoDocumento, string>> = {
  fattura: "Fattura", nota_credito: "Nota di credito", nota_debito: "Nota di debito", proforma: "Proforma",
};

interface RigaImportata {
  id: string; description: string; quantity: number; unit: string | null; unit_price: number;
  discount_percent: number | null; tax_rate: number; tax_nature: string | null;
  line_net: number; line_tax: number; line_gross: number; product_code: string | null; sort_order: number | null;
}

interface FatturaImportata {
  id: string; company_id: string; invoice_number: string; document_type: string | null; order_id: string | null;
  external_provider: string | null; external_sdi_id: string | null; external_xml_url: string | null;
  client_company_name: string | null; client_fiscal_code: string | null; client_vat_number: string | null;
  client_email: string | null; client_address: string | null; client_city: string | null; client_zip: string | null;
  client_country: string | null; payment_method: string | null; bank_iban: string | null;
  invoice_lines: RigaImportata[] | null;
}

const COLONNE = "id, company_id, invoice_number, document_type, order_id, external_provider, external_sdi_id, external_xml_url, client_company_name, client_fiscal_code, client_vat_number, client_email, client_address, client_city, client_zip, client_country, payment_method, bank_iban, invoice_lines(id, description, quantity, unit, unit_price, discount_percent, tax_rate, tax_nature, line_net, line_tax, line_gross, product_code, sort_order)";

/** Le righe e il riepilogo IVA dell'importata nella forma che l'anteprima nativa disegna. */
function documentoPerAnteprima(riga: DocumentoFiscale, f: FatturaImportata): DocumentoFiscale {
  const righe: RigaDocumento[] = [...(f.invoice_lines ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r, i) => ({
      id: r.id, numero_linea: i + 1, codice_articolo: r.product_code ?? undefined, descrizione: r.description,
      quantita: Number(r.quantity), unita_misura: r.unit ?? "", prezzo_unitario: Number(r.unit_price),
      sconto_percentuale: r.discount_percent ? Number(r.discount_percent) : undefined,
      imponibile: Number(r.line_net), aliquota_iva: String(Number(r.tax_rate)),
      natura_iva: (r.tax_nature ?? undefined) as RigaDocumento["natura_iva"],
      imposta: Number(r.line_tax), totale_riga: Number(r.line_gross),
    }));
  const perAliquota = new Map<string, RiepilogoIVA>();
  for (const r of righe) {
    const chiave = `${r.aliquota_iva}|${r.natura_iva ?? ""}`;
    const v = perAliquota.get(chiave) ?? { aliquota: r.aliquota_iva, natura: r.natura_iva, imponibile: 0, imposta: 0, esigibilita: "I" as const };
    v.imponibile += r.imponibile;
    v.imposta += r.imposta;
    perAliquota.set(chiave, v);
  }
  return {
    ...riga,
    righe,
    riepilogo_iva: [...perAliquota.values()],
    metodo_pagamento_codice: (f.payment_method?.match(/^MP\d{2}$/) ? f.payment_method : undefined) as DocumentoFiscale["metodo_pagamento_codice"],
    iban_pagamento: f.bank_iban ?? undefined,
    scadenze_pagamento: [],
  };
}

export default function DettaglioFatturaImportata() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { data: azienda } = useAnagraficaAzienda();
  const [incasso, setIncasso] = useState<DocumentoFiscale | null>(null);
  const [xmlAperto, setXmlAperto] = useState(false);
  const [scarico, setScarico] = useState(false);

  // La riga dell'elenco (stato, dovuto, incassato) e la fattura con le righe.
  const elenco = useQuery({
    queryKey: ["documenti-fiscali", "importata", companyId, id],
    enabled: !!companyId && !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("documenti_fiscali_elenco_con_importate" as never)
        .select("*").eq("company_id", companyId!).eq("id", id!).eq("origine", "importata").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Fattura non trovata in questa azienda.");
      return data as unknown as DocumentoFiscale;
    },
  });
  const fattura = useQuery({
    queryKey: ["emessa-importata-dettaglio", companyId, id, "righe"],
    enabled: !!companyId && !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select(COLONNE)
        .eq("company_id", companyId!).eq("id", id!).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Fattura non trovata in questa azienda.");
      return data as unknown as FatturaImportata;
    },
  });

  const doc = useMemo(
    () => (elenco.data && fattura.data ? documentoPerAnteprima({ ...elenco.data, origine: "importata" }, fattura.data) : null),
    [elenco.data, fattura.data],
  );

  if (elenco.isError || fattura.isError) {
    const err = elenco.error ?? fattura.error;
    return (
      <div className="space-y-3 p-6">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/azienda/documenti")}><ArrowLeft className="h-4 w-4" /> Torna ai documenti</Button>
        <p role="alert" className="text-sm text-destructive">{err instanceof Error ? err.message : "Fattura non disponibile."}</p>
      </div>
    );
  }
  if (!doc || !fattura.data || !companyId) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const f = fattura.data;
  const tipoLabel = TIPO_LABELS[doc.tipo] ?? "Fattura";
  const residuo = residuoImportata(doc);
  const progresso = doc.totale_da_pagare > 0 ? Math.min(100, (doc.importo_pagato / doc.totale_da_pagare) * 100) : 0;
  const gestionale = f.external_provider ? (PROVIDER_LABELS[f.external_provider] ?? f.external_provider) : "un altro programma";

  const scaricaOriginale = async () => {
    if (!f.external_xml_url) return;
    setScarico(true);
    try {
      const o = await leggiOriginaleEmessa(f.external_xml_url, companyId);
      scaricaFileOriginale(o.file, o.nome);
    } catch (e) {
      toast.error("File originale non scaricato", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setScarico(false);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto max-sm:space-y-3 max-sm:p-0">
      {/* Titolo e ritorno ai documenti, come nel dettaglio nativo. */}
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch max-sm:gap-1">
        <Button variant="outline" size="sm" className="w-fit gap-1.5 max-sm:hidden" onClick={() => navigate("/azienda/documenti")}>
          <ArrowLeft className="h-4 w-4" /> Torna ai documenti
        </Button>
        <div className="sm:text-right">
          <div className="flex items-center gap-2 sm:justify-end max-sm:flex-wrap max-sm:gap-1.5">
            <h1 className="text-xl font-semibold max-sm:text-lg max-sm:leading-tight">{tipoLabel} numero {doc.numero}</h1>
            <StatoBadge stato={doc.stato as StatoDocumento} />
          </div>
          <p className="text-sm text-muted-foreground max-sm:text-xs">
            {doc.cliente_snapshot?.ragione_sociale} — {formatDateShort(doc.data_emissione)}
            {doc.data_scadenza && <span className="sm:hidden"> · scade {formatDateShort(doc.data_scadenza)}</span>}
          </p>
        </div>
      </div>

      {/* Le azioni: solo quelle che non creano né modificano il documento. */}
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-2 max-sm:gap-1.5 max-sm:[&_button]:h-8 max-sm:[&_button]:px-2.5 max-sm:[&_button]:text-xs">
        {f.external_xml_url && (
          <>
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setXmlAperto(true)}><FileCode className="h-4 w-4" />Vedi XML originale</Button>
            <Button size="sm" variant="secondary" className="gap-1.5 max-sm:hidden" disabled={scarico} onClick={() => void scaricaOriginale()}>
              {scarico ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Scarica originale
            </Button>
          </>
        )}
        {importataPagabile(doc) && (
          <Button variant="outline" size="sm" onClick={() => setIncasso(doc)} className="gap-1.5">
            <CreditCard className="h-4 w-4" /> Segna pagata
          </Button>
        )}
      </div>

      {/* Mobile: al posto dell'anteprima A4 le righe e i due numeri che contano. */}
      <div className="space-y-2 sm:hidden">
        <KpiMobili
          voci={[
            { label: "Totale", valore: formatCurrency(doc.totale_documento) },
            { label: "Da incassare", valore: formatCurrency(residuo), tono: residuo > 0.005 ? "text-rose-600" : undefined },
          ]}
        />
        {(doc.righe ?? []).length > 0 && (
          <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
            {(doc.righe ?? []).map((r, i) => (
              <div key={r.id ?? i} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-tight">{r.descrizione}</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                    {r.quantita} {r.unita_misura} × {formatCurrency(r.prezzo_unitario)} · IVA {r.aliquota_iva}%
                  </p>
                </div>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums">{formatCurrency(r.imponibile)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* L'anteprima, al centro, come nel dettaglio nativo. */}
      <section className="max-sm:hidden" aria-label="Anteprima del documento">
        <div className="mb-3 text-center">
          <h2 className="text-lg font-semibold">Anteprima del documento</h2>
          <p className="text-sm text-muted-foreground">
            {f.external_xml_url ? "per vedere l'originale premi «Vedi XML originale»" : `l'originale è in ${gestionale}`}
          </p>
        </div>
        <div className="mx-auto flex max-w-4xl justify-center overflow-x-auto rounded-xl border bg-muted/30 p-6 shadow-inner">
          <PreviewFattura documento={doc as unknown as EditorState} azienda={azienda ?? null} logoAziendale={effectiveCompany?.logo_url} scale={0.9} />
        </div>
        <p className="mx-auto mt-2 max-w-4xl text-center text-xs text-muted-foreground">
          {(doc.righe ?? []).length === 0
            ? "Il gestionale ha importato solo i totali, senza le righe: il documento completo è nell'originale."
            : "Ricostruita dai dati importati: il documento fiscale è quello emesso dal gestionale."}
        </p>
      </section>

      {/* Sotto: informazioni, pagamenti, commessa, gestionale — a colonne. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 max-sm:gap-3">
        <Card className="max-sm:hidden">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Informazioni</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span>{tipoLabel}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Numero</span><span className="font-mono">{doc.numero}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Data emissione</span><span>{formatDateShort(doc.data_emissione)}</span></div>
            {doc.data_scadenza && <div className="flex justify-between"><span className="text-muted-foreground">Data scadenza</span><span>{formatDateShort(doc.data_scadenza)}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span>{doc.cliente_snapshot?.ragione_sociale || "—"}</span></div>
            {doc.cliente_snapshot?.partita_iva && <div className="flex justify-between"><span className="text-muted-foreground">P.IVA</span><span className="font-mono">{doc.cliente_snapshot.partita_iva}</span></div>}
          </CardContent>
        </Card>

        {doc.tipo !== "proforma" && (
          <Card className="max-sm:hidden">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Pagamenti</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Totale</p><p className="font-semibold">{formatCurrency(doc.totale_documento)}</p></div>
                <div><p className="text-xs text-muted-foreground">Da pagare</p><p className="font-semibold">{formatCurrency(doc.totale_da_pagare)}</p></div>
                <div><p className="text-xs text-muted-foreground">Incassato</p><p className="font-semibold text-emerald-600">{formatCurrency(doc.importo_pagato)}</p></div>
                <div><p className="text-xs text-muted-foreground">Residuo</p><p className={`font-semibold ${residuo > 0 ? "text-destructive" : ""}`}>{formatCurrency(residuo)}</p></div>
              </div>
              <Progress value={progresso} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">{Math.round(progresso)}% incassato</p>
              {/* Lo storico degli incassi registrati qui, con «Annulla»: lo stesso pannello delle native. */}
              <IncassiFatturaImportata
                invoiceId={f.id}
                stato={doc.stato === "pagata" ? "pagata" : doc.importo_pagato > 0.005 ? "parziale" : "altro"}
              />
              {importataPagabile(doc) && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => setIncasso(doc)}>
                  <CreditCard className="h-4 w-4 mr-1" /> Registra incasso
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Commessa e cliente collegati (si nasconde da solo se non c'è niente da dire). */}
        <CollegamentiEmessaImportata companyId={companyId} fattura={f} />

        <Card className="max-sm:hidden">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Gestionale</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Emessa con</span><span>{gestionale}</span></div>
            {f.external_sdi_id && <div className="flex justify-between gap-2"><span className="text-muted-foreground">Identificativo SdI</span><span className="font-mono text-xs truncate">{f.external_sdi_id}</span></div>}
            <p className="text-xs text-muted-foreground">Invio allo SDI, modifiche e note di credito si fanno nel gestionale: qui arrivano a ogni sincronizzazione.</p>
          </CardContent>
        </Card>

        {doc.documento_correlato_id && (
          <Card className="max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none">
            <CardHeader className="pb-3 max-sm:hidden"><CardTitle className="text-sm">Documenti collegati</CardTitle></CardHeader>
            <CardContent className="max-sm:p-0">
              <Button variant="outline" size="sm" asChild className="w-full max-sm:h-8 max-sm:text-xs">
                <Link to={`/azienda/documenti/importata/${doc.documento_correlato_id}`}>
                  <ExternalLink className="h-4 w-4 mr-1" /> Visualizza documento originale
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {xmlAperto && <EmessaImportataDettaglio id={f.id} companyId={companyId} apriXml onClose={() => setXmlAperto(false)} />}
      <SegnaPagataImportataDialog fattura={incasso} companyId={companyId} onClose={() => setIncasso(null)} />
    </div>
  );
}
