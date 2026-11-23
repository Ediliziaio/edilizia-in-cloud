import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, CreditCard, FileCode, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { raggruppaPerMese, type EmessaImportata } from "@/lib/fatturazione/emesseImportate";
import { EmessaImportataDettaglio } from "@/components/fatturazione/EmessaImportataDettaglio";
import { RecuperaClientiImportati } from "@/components/fatturazione/RecuperaClientiImportati";
import { SegnaPagataImportataDialog, importataPagabile } from "@/components/fatturazione/GestionaleEsterno";
import { RiportaDaIncassareDialog } from "@/components/fatturazione/RiportaDaIncassare";
import { BannerSenzaIncasso, useEmesseSenzaIncasso, type SenzaIncasso } from "@/components/fatturazione/EmesseSenzaIncasso";

const NESSUNA = new Map<string, SenzaIncasso>();
import type { DocumentoFiscale } from "@/types/fatturazione";
import { importoConSegno, isNotaCredito, isDocumentoEmesso, isTipoVendita, tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const dataBreve = (s: string | null) => {
  if (!s) return "—";
  const [a, m, g] = s.slice(0, 10).split("-");
  return a && m && g ? `${g}/${m}/${a}` : s;
};

/**
 * Le fatture emesse con un altro programma (Aruba, Fatture in Cloud…) e importate
 * da XML, mese per mese: si consultano e si segna se sono state incassate.
 */
export default function FattureEmesseImportate() {
  const t = useT();
  const companyId = useEffectiveCompanyId();
  const [cerca, setCerca] = useState("");
  const [selezionata, setSelezionata] = useState<{ id: string; xml: boolean } | null>(null);
  const apriDettaglio = (id: string, xml = false) => setSelezionata({ id, xml });
  const [daIncassare, setDaIncassare] = useState<DocumentoFiscale | null>(null);
  const [daRiaprire, setDaRiaprire] = useState<{ id: string; numero: string } | null>(null);
  const [soloSenzaIncasso, setSoloSenzaIncasso] = useState(false);
  const { data: senzaIncasso = NESSUNA } = useEmesseSenzaIncasso(companyId);

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["fatture-emesse-importate", companyId, "dettagli-elenco"],
    enabled: !!companyId,
    queryFn: async () => {
      return await tutteLePagine((from,to) => supabase
        .from("invoices")
        .select("id, invoice_number, document_type, status, client_id, order_id, client_company_name, client_fiscal_code, client_vat_number, client_address, client_city, client_zip, issue_date, due_date, subtotal, tax_amount, total, paid_amount, external_provider, external_xml_url, invoice_lines(description, sort_order)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .not("external_provider", "is", null)
        .order("issue_date", { ascending: false })
        .order("id", { ascending: false })
        // Solo l'anteprima della prima riga; tutte le righe si caricano nel dettaglio.
        .order("sort_order", { ascending: true, referencedTable: "invoice_lines" })
        .limit(1, { referencedTable: "invoice_lines" })
        .range(from,to)) as EmessaImportata[];
    },
  });

  // Cosa si può incassare lo dice la stessa vista del registro incassi: stato e dovuto al
  // netto delle note di credito collegate, che gli importi dell'elenco non sanno.
  const { data: daIncassareElenco = [] } = useQuery({
    queryKey: ["incassi-importate", "aperte", companyId],
    enabled: !!companyId,
    queryFn: async () => (await tutteLePagine((from, to) => supabase
      .from("documenti_fiscali_elenco_con_importate" as never)
      .select("id, company_id, origine, external_provider, tipo, numero, data_emissione, data_scadenza, cliente_snapshot, elenco_cliente, stato, totale_documento, totale_da_pagare, importo_pagato, deleted_at")
      .eq("company_id", companyId!)
      .eq("origine", "importata")
      .is("deleted_at", null)
      .in("stato", ["emessa", "parzialmente_pagata"])
      .not("tipo", "in", "(nota_credito,proforma)")
      .order("data_scadenza", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to))) as unknown as DocumentoFiscale[],
  });
  const aperte = useMemo(() => new Map(daIncassareElenco.filter(importataPagabile).map((d) => [d.id, d])), [daIncassareElenco]);

  const filtrate = useMemo(() => {
    const emesse = data.filter(f => isDocumentoEmesso(f.status) && isTipoVendita(f.document_type) && (!soloSenzaIncasso || senzaIncasso.has(f.id)));
    const q = cerca.trim().toLowerCase();
    if (!q) return emesse;
    return emesse.filter((f) => [f.invoice_number, f.client_company_name, f.client_fiscal_code, f.client_vat_number, f.client_address, f.client_city, f.client_zip].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [data, cerca, soloSenzaIncasso, senzaIncasso]);
  const mesi = useMemo(() => raggruppaPerMese(filtrate), [filtrate]);
  const totale = useMemo(() => mesi.reduce((s, m) => s + m.totale, 0), [mesi]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link to="/azienda/documenti"><ArrowLeft className="h-4 w-4" /> {t("Fatture")}</Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold">{t("Fatture emesse importate")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Dati cliente, descrizioni e scadenze direttamente nell’elenco. Apri «Dettagli» per consultare tutte le righe e l’XML collegato.")}
          </p>
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder={t("Numero, cliente, CF/P.IVA o indirizzo…")} aria-label={t("Cerca fatture importate")} className="h-9 pl-8" />
        </div>
      </div>

      {companyId && <BannerSenzaIncasso companyId={companyId} senzaIncasso={senzaIncasso} soloQueste={soloSenzaIncasso} onSoloQueste={setSoloSenzaIncasso} />}

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : isError ? (
        <p className="text-sm text-destructive">{t("Non riesco a caricare le fatture. Riprova tra poco.")}</p>
      ) : mesi.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{cerca ? t("Nessuna fattura importata con questa ricerca.") : t("Nessuna fattura importata.")}</CardContent></Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t("{n} documenti · totale al netto delle note di credito", { n: filtrate.length })} <span className="font-semibold tabular-nums text-foreground">{formatCurrency(totale)}</span>
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
            <p className="text-sm text-muted-foreground">{t("{n} collegati a commesse · {n2} da verificare. Incassi storici non certificati dall’XML.", { n: filtrate.filter(f => f.order_id).length, n2: filtrate.filter(f => !f.order_id).length })}</p>
            {companyId && <RecuperaClientiImportati key={companyId} companyId={companyId} invoiceIds={filtrate.map(f => f.id)} />}
          </div>
          {mesi.map((m, i) => (
            <details key={m.chiave} open={i < 3 || !!cerca} className="rounded-xl border bg-card">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="font-semibold">{m.etichetta}</span>
                <span className="text-xs text-muted-foreground">{t("{n} fatture", { n: m.fatture.length })}</span>
                <span className="ml-auto text-sm font-semibold tabular-nums">{formatCurrency(m.totale)}</span>
                <span className="w-full text-xs text-muted-foreground sm:w-auto">{t("Imponibile {imponibile} · IVA {iva}", { imponibile: formatCurrency(m.imponibile), iva: formatCurrency(m.iva) })}</span>
              </summary>
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Numero")}</TableHead>
                      <TableHead>{t("Cliente")}</TableHead>
                      <TableHead>{t("Descrizione")}</TableHead>
                      <TableHead>{t("Emissione / scadenza")}</TableHead>
                      <TableHead className="text-right">{t("Imponibile")}</TableHead>
                      <TableHead className="text-right">IVA</TableHead>
                      <TableHead className="text-right">{t("Totale")}</TableHead>
                      <TableHead className="text-right">{t("Incassato")}</TableHead>
                      <TableHead>{t("XML originale")}</TableHead>
                      <TableHead><span className="sr-only">{t("Dettagli")}</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {m.fatture.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs font-semibold text-orange-600">
                          <button type="button" onClick={() => apriDettaglio(f.id)} className="rounded underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("Apri fattura {invoice_number}", { invoice_number: String(f.invoice_number ?? "") })}>
                            {f.invoice_number}{isNotaCredito(f.document_type) ? ` ${t("· NC")}` : ""}
                          </button>
                        </TableCell>
                        <TableCell className="min-w-56 max-w-80 text-xs">
                          <div className="font-medium break-words">{f.client_company_name || "—"}</div>
                          <div className="mt-1 space-y-0.5 text-muted-foreground">
                            {f.client_fiscal_code && <div className="break-all">{t("CF: {client_fiscal_code}", { client_fiscal_code: String(f.client_fiscal_code ?? "") })}</div>}
                            {f.client_vat_number && <div>{t("P.IVA: {client_vat_number}", { client_vat_number: String(f.client_vat_number ?? "") })}</div>}
                            {!f.client_fiscal_code && !f.client_vat_number && <div>{t("CF / P.IVA non archiviati")}</div>}
                            {[f.client_address, [f.client_zip, f.client_city].filter(Boolean).join(" ")].filter(Boolean).length > 0 &&
                              <div className="break-words">{[f.client_address, [f.client_zip, f.client_city].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</div>}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-52 max-w-72 text-xs">
                          {f.invoice_lines?.[0]?.description ? <>
                            <p className="line-clamp-2 whitespace-pre-wrap break-words">{f.invoice_lines[0].description.slice(0, 200)}{f.invoice_lines[0].description.length > 200 ? "…" : ""}</p>
                            <button type="button" className="mt-1 rounded text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => apriDettaglio(f.id)} aria-label={t("Vedi tutte le righe della fattura {invoice_number}", { invoice_number: String(f.invoice_number ?? "") })}>{t("Vedi tutte le righe")}</button>
                          </> : <span className="text-muted-foreground">{t("Descrizione non archiviata")}</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          <div>{dataBreve(f.issue_date)}</div>
                          <div className="mt-1 text-muted-foreground">{f.due_date ? t("Scad. {due_date}", { due_date: String(dataBreve(f.due_date) ?? "") }) : t("Scadenza non archiviata")}</div>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{formatCurrency(importoConSegno(f.document_type, f.subtotal))}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{formatCurrency(importoConSegno(f.document_type, f.tax_amount))}</TableCell>
                        <TableCell className="text-right text-xs font-medium tabular-nums">{formatCurrency(importoConSegno(f.document_type, f.total))}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {senzaIncasso.has(f.id) ? (
                            <button
                              type="button"
                              onClick={() => setDaRiaprire({ id: f.id, numero: f.invoice_number })}
                              title={f.status === "paid" ? t("Segnata incassata senza un incasso registrato: clic per riportarla da incassare") : t("Segnata incassata in parte senza un incasso registrato: clic per riportarla da incassare")}
                              aria-label={t("Senza incasso registrato: riporta da incassare la fattura {invoice_number}", { invoice_number: String(f.invoice_number ?? "") })}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-300 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800 dark:hover:bg-amber-900"
                            >
                              {f.status === "paid" ? t("Pagata") : formatCurrency(Number(f.paid_amount ?? 0))} {t("· senza incasso")}
                            </button>
                          ) : f.status === "paid" && !isNotaCredito(f.document_type) && f.external_provider === "xml_import" ? (
                            <button
                              type="button"
                              onClick={() => setDaRiaprire({ id: f.id, numero: f.invoice_number })}
                              title={t("Incassata: clic per riportarla da incassare")}
                              aria-label={t("Riporta da incassare la fattura {invoice_number}", { invoice_number: String(f.invoice_number ?? "") })}
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800 dark:hover:bg-emerald-900"
                            >
                              <Check className="h-2.5 w-2.5" /> {t("Incassata")}
                            </button>
                          ) : aperte.get(f.id) ? (
                            <span className="inline-flex items-center justify-end gap-1">
                              {Number(f.paid_amount ?? 0) > 0 ? formatCurrency(Number(f.paid_amount)) : <span className="whitespace-nowrap text-amber-700 dark:text-amber-400">{t("Da incassare")}</span>}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title={t("Segna incassata")}
                                aria-label={t("Segna incassata la fattura {invoice_number}", { invoice_number: String(f.invoice_number ?? "") })}
                                onClick={() => setDaIncassare(aperte.get(f.id) ?? null)}
                              >
                                <CreditCard className="h-4 w-4" />
                              </Button>
                            </span>
                          ) : Number(f.paid_amount ?? 0) > 0 ? formatCurrency(Number(f.paid_amount)) : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {f.external_xml_url ? <Button variant="outline" size="sm" onClick={() => apriDettaglio(f.id, true)} aria-label={t("Visualizza XML della fattura {invoice_number}", { invoice_number: String(f.invoice_number ?? "") })}><FileCode className="mr-1.5 h-4 w-4" />XML</Button> :
                            <span className="text-xs text-muted-foreground">{t("Non archiviato")}</span>}
                        </TableCell>
                        <TableCell><Button variant="outline" size="sm" onClick={() => apriDettaglio(f.id)} aria-label={t("Dettagli della fattura {invoice_number}", { invoice_number: String(f.invoice_number ?? "") })}>{t("Dettagli")}</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          ))}
        </>
      )}
      {companyId && <SegnaPagataImportataDialog fattura={daIncassare} companyId={companyId} onClose={() => setDaIncassare(null)} />}
      <RiportaDaIncassareDialog fattura={daRiaprire} onClose={() => setDaRiaprire(null)} />
      {selezionata && companyId && <EmessaImportataDettaglio key={`${companyId}:${selezionata.id}:${selezionata.xml}`} id={selezionata.id} companyId={companyId} apriXml={selezionata.xml} onClose={() => setSelezionata(null)} />}
    </div>
  );
}
