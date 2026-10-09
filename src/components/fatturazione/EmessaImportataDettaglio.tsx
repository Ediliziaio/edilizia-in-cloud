import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileCode, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { leggiOriginaleEmessa, scaricaFileOriginale } from "@/lib/fatturazione/originaleEmessaImportata";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const dataIt = (s: string | null) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const campo = (v: string | null | undefined) => v?.trim() || "Non disponibile nei dati archiviati";
const numero = (v: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 8 }).format(v);
const MAX_ANTEPRIMA_XML = 200_000;

function Campo({ label, value }: { label: string; value?: string | null }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{campo(value)}</dd></div>;
}

/** La fattura storica non è un nuovo documento fiscale: nessuna scrittura, rigenerazione o invio SDI. */
export function EmessaImportataDettaglio({ id, companyId, onClose, apriXml = false }: { id: string; companyId: string; onClose: () => void; apriXml?: boolean }) {
  const [mostraXml, setMostraXml] = useState(apriXml);
  const detail = useQuery({
    queryKey: ["emessa-importata-dettaglio", companyId, id],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices")
        .select("*, invoice_lines(*)").eq("id", id).eq("company_id", companyId).is("deleted_at", null)
        .not("external_provider", "is", null).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Fattura non trovata o non accessibile in questa azienda.");
      return data;
    },
  });
  const fattura = detail.data;
  const originale = useQuery({
    queryKey: ["emessa-importata-originale", companyId, id, fattura?.external_xml_url],
    enabled: mostraXml && !!fattura?.external_xml_url,
    retry: false,
    gcTime: 0,
    queryFn: () => leggiOriginaleEmessa(fattura!.external_xml_url!, companyId),
  });
  const righe = [...(fattura?.invoice_lines ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-5xl">
      <DialogHeader>
        <DialogTitle>{fattura?.document_type === "credit_note" || fattura?.document_type === "TD04" ? "Nota di credito" : "Fattura"} {fattura?.invoice_number ?? "importata"}</DialogTitle>
        <DialogDescription>Documento emesso dal gestionale esterno. Consultazione in sola lettura: non modifica fatturato, incassi o invii allo SDI.</DialogDescription>
      </DialogHeader>
      {detail.isPending ? <Skeleton className="h-48" /> : detail.isError ?
        <div role="alert" className="text-sm text-destructive">Non riesco a caricare i dettagli. <Button variant="link" onClick={() => void detail.refetch()}>Riprova</Button></div>
        : fattura && <div className="space-y-6 min-w-0">
          <div className="flex flex-wrap gap-4 rounded-lg bg-muted/50 p-3 text-sm">
            <span>Emessa il <strong>{dataIt(fattura.issue_date)}</strong></span>
            <span>Totale documento <strong>{formatCurrency(Number(fattura.total ?? 0))}</strong></span>
            <span>Origine: {fattura.external_provider === "xml_import" ? "Importazione XML" : fattura.external_provider || "Gestionale esterno"}</span>
          </div>
          <section aria-label="Cliente della fattura">
            <h2 className="mb-3 font-semibold">Cliente</h2>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo label="Intestatario" value={fattura.client_company_name} />
              <Campo label="Codice fiscale" value={fattura.client_fiscal_code} />
              <Campo label="Partita IVA" value={fattura.client_vat_number} />
              <Campo label="Indirizzo" value={fattura.client_address} />
              <Campo label="CAP e città" value={[fattura.client_zip, fattura.client_city].filter(Boolean).join(" ")} />
              <Campo label="Nazione" value={fattura.client_country} />
              <Campo label="PEC" value={fattura.client_pec} />
              <Campo label="Codice destinatario SDI" value={fattura.client_sdi_code} />
              <Campo label="Email" value={fattura.client_email} />
            </dl>
          </section>
          <section aria-label="Righe della fattura">
            <h2 className="mb-3 font-semibold">Descrizioni e righe · {righe.length}</h2>
            {righe.length === 0 ? <p className="text-sm text-muted-foreground">Il gestionale ha importato solo il riepilogo, senza dettaglio righe. Consulta l’XML originale, se disponibile.</p> :
              <div className="overflow-x-auto rounded-lg border">
                <Table><TableHeader><TableRow>
                  <TableHead>Descrizione</TableHead><TableHead className="text-right">Quantità</TableHead>
                  <TableHead className="text-right">Prezzo unitario</TableHead><TableHead className="text-right">IVA / natura</TableHead>
                  <TableHead className="text-right">Imponibile riga</TableHead>
                </TableRow></TableHeader><TableBody>{righe.map(r => <TableRow key={r.id}>
                  <TableCell className="min-w-60 whitespace-pre-wrap break-words text-sm">{r.description}{r.product_code && <span className="block text-xs text-muted-foreground">Codice: {r.product_code}</span>}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{numero(r.quantity)} {r.unit}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{numero(r.unit_price)} €{Number(r.discount_percent) > 0 && <span className="block text-xs">Sconto {numero(Number(r.discount_percent))}%</span>}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">{numero(r.tax_rate)}%{r.tax_nature && <span className="block text-xs">{r.tax_nature}</span>}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(r.line_net)}</TableCell>
                </TableRow>)}</TableBody></Table>
              </div>}
            <div className="mt-3 flex flex-wrap justify-end gap-x-6 gap-y-2 text-sm">
              <span>Imponibile {formatCurrency(Number(fattura.subtotal ?? 0))}</span>
              <span>IVA {formatCurrency(Number(fattura.tax_amount ?? 0))}</span>
              <strong>Totale {formatCurrency(Number(fattura.total ?? 0))}</strong>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Totali archiviati del documento, non ricalcolati dalle righe: possono includere bollo, ritenute e arrotondamenti.</p>
          </section>
          <section aria-label="Pagamento della fattura">
            <h2 className="mb-3 font-semibold">Pagamento</h2>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo label="Scadenza" value={fattura.due_date ? dataIt(fattura.due_date) : null} />
              <Campo label="Modalità" value={fattura.payment_method} />
              <Campo label="IBAN indicato in fattura" value={fattura.bank_iban} />
              <Campo label="Condizioni" value={fattura.payment_terms} />
              <Campo label="Incassato registrato" value={formatCurrency(Number(fattura.paid_amount ?? 0))} />
            </dl>
          </section>
          {fattura.notes && <section><h2 className="mb-2 font-semibold">Note importazione</h2><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{fattura.notes}</p></section>}
          <section aria-label="XML della fattura" className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">XML e file originale</h2>
              {fattura.external_xml_url && <Button variant="outline" size="sm" onClick={() => setMostraXml(v => !v)}>
                <FileCode className="mr-2 h-4 w-4" />{mostraXml ? "Nascondi XML" : "Visualizza XML"}
              </Button>}
            </div>
            {!fattura.external_xml_url ? <p className="text-sm text-muted-foreground">L’importazione precedente ha conservato i dati, ma non il file XML. Non viene ricostruito né presentato come originale. Per aggiungerlo, ricarica lo stesso XML dal portale Aruba nella pagina «Fatture ricevute → Importa XML»: il sistema riconosce anche le emesse, senza duplicarle.</p> :
              <p className="text-xs text-muted-foreground">Il contenuto è mostrato come testo, senza eseguire fogli di stile o contenuti dell’XML.</p>}
            {mostraXml && originale.isPending && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Caricamento del file originale…</p>}
            {mostraXml && originale.isError && <div role="alert" className="text-sm text-destructive">{originale.error instanceof Error ? originale.error.message : "File non disponibile."} <Button variant="link" onClick={() => void originale.refetch()}>Riprova</Button></div>}
            {mostraXml && originale.data && <>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => scaricaFileOriginale(originale.data!.file, originale.data!.nome)}><Download className="mr-2 h-4 w-4" />{originale.data.firmato ? "Scarica originale P7M" : "Scarica XML originale"}</Button>
                {originale.data.xmlEstratto && <Button variant="outline" size="sm" onClick={() => scaricaFileOriginale(originale.data!.xmlEstratto!, originale.data!.nome.replace(/\.p7m$/i, ""))}>Scarica XML estratto</Button>}
              </div>
              {originale.data.xml.length > MAX_ANTEPRIMA_XML && <p className="text-xs text-muted-foreground">Anteprima limitata per non rallentare il dispositivo. Il download contiene l’intero file, inclusi gli allegati.</p>}
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs" tabIndex={0} aria-label="Contenuto XML originale">{originale.data.xml.slice(0, MAX_ANTEPRIMA_XML)}</pre>
            </>}
          </section>
        </div>}
    </DialogContent>
  </Dialog>;
}
