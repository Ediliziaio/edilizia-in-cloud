import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePaymentGateStore } from "@/store/paymentGateStore";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { createTimeoutSignal, withClientTimeout } from "@/lib/query-timeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, RefreshCw, ExternalLink, FileText, Search, Eye, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { puoReinviare, isInvioInCorso } from "@/lib/fatturazione/sdiCassetto";

const SDI_QUERY_TIMEOUT_MS = 12_000;

/** Indenta XML grezzo per visualizzazione leggibile */
function formatXml(xml: string): string {
  try {
    let formatted = "";
    let indent = 0;
    const lines = xml.replace(/>\s*</g, ">\n<").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("</")) {
        indent = Math.max(0, indent - 1);
      }
      formatted += "  ".repeat(indent) + trimmed + "\n";
      if (!trimmed.startsWith("</") && !trimmed.endsWith("/>") && !trimmed.startsWith("<?") && trimmed.includes("<") && !trimmed.includes("</")) {
        indent++;
      }
    }
    return formatted.trim();
  } catch {
    return xml;
  }
}

const SDI_STATO_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  AT: { label: "Trasmessa", variant: "default" },
  RC: { label: "Consegnata", variant: "secondary" },
  NS: { label: "Scartata", variant: "destructive" },
  MC: { label: "Mancata consegna", variant: "outline" },
  EC: { label: "Esito committente", variant: "default" },
  DT: { label: "Decorrenza termini", variant: "secondary" },
};

function SdiStatoBadge({ stato }: { stato: string | null }) {
  if (!stato) return <Badge variant="outline">—</Badge>;
  const config = SDI_STATO_CONFIG[stato] || { label: stato, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

type CassettoSDIProps = {
  embedded?: boolean;
};

export default function CassettoSDI({ embedded = false }: CassettoSDIProps = {}) {
  void embedded;
  const companyId = useEffectiveCompanyId();
  const currentYear = new Date().getFullYear();
  const [anno, setAnno] = useState(currentYear);
  const [searchQuery, setSearchQuery] = useState("");
  const [statoFilter, setStatoFilter] = useState("all");
  const [xmlPreviewOpen, setXmlPreviewOpen] = useState(false);
  const [xmlPreviewContent, setXmlPreviewContent] = useState<{ numero: string; xml: string } | null>(null);

  const { data: documenti = [], isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["cassetto-sdi", companyId, anno],
    enabled: !!companyId,
    queryFn: async () => {
      const timeout = createTimeoutSignal(SDI_QUERY_TIMEOUT_MS);
      // Filtro anno: usa .eq("anno") come primario + fallback su data_emissione per
      // documenti in cui anno non è stato popolato correttamente all'insert (P1-05)
      try {
        const query = supabase
          .from("documenti_fiscali" as never)
          .select("id, numero, tipo, data_emissione, cliente_snapshot, totale_documento, totale_da_pagare, stato, sdi_id_trasmissione, sdi_stato, sdi_notifica_tipo, sdi_file_xml_url, sdi_ricevuta_url, sdi_data_consegna")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .or(`anno.eq.${anno},and(anno.is.null,data_emissione.gte.${anno}-01-01,data_emissione.lte.${anno}-12-31)`)
          .in("stato", ["in_invio", "inviata_sdi", "consegnata", "accettata", "rifiutata"])
          .order("data_emissione", { ascending: false })
          .abortSignal(timeout.signal);

        const { data, error } = await withClientTimeout(query, "Cassetto SDI", SDI_QUERY_TIMEOUT_MS);

        if (error) throw error;
        return data as any[];
      } finally {
        timeout.dispose();
      }
    },
    retry: 0,
  });

  const kpi = useMemo(() => {
    const trasmesse = documenti.length;
    const consegnate = documenti.filter(d => d.sdi_stato === "RC" || d.stato === "consegnata").length;
    const scartate = documenti.filter(d => d.sdi_stato === "NS" || d.stato === "rifiutata").length;
    const inAttesa = documenti.filter(d => d.sdi_stato === "AT" || d.stato === "inviata_sdi" || d.stato === "in_invio").length;
    return { trasmesse, consegnate, scartate, inAttesa };
  }, [documenti]);

  const filtered = useMemo(() => {
    let result = documenti;
    if (statoFilter !== "all") {
      result = result.filter(d => d.sdi_stato === statoFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.numero?.toLowerCase().includes(q) ||
        d.cliente_snapshot?.ragione_sociale?.toLowerCase().includes(q) ||
        d.sdi_id_trasmissione?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [documenti, statoFilter, searchQuery]);

  const handleReinvia = async (docId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("invia-sdi", {
        body: { documento_id: docId },
      });
      if (error) {
        // 402 = gate "carta obbligatoria": apri il dialog "Aggiungi carta".
        // (invoke diretto → non passa dal MutationCache globale di App.tsx.)
        if ((error as { context?: { status?: number } })?.context?.status === 402) {
          usePaymentGateStore.getState().show();
          return;
        }
        const detail = error.context ? await (error.context as any).json?.().catch((): null => null) : null;
        throw new Error(detail?.error || error.message);
      }
      toast.success("Documento reinviato a SDI");
      void refetch();
    } catch (e: any) {
      toast.error(e.message || "Errore nel reinvio");
    }
  };

  const handleDownloadXml = async (xmlUrl: string | null) => {
    if (!xmlUrl) return;
    try {
      const { data } = await supabase.storage.from("fatture-xml").download(xmlUrl);
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        a.download = xmlUrl.split("/").pop() || "fattura.xml";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      toast.error("Errore nel download XML");
    }
  };

  const handlePreviewXml = async (xmlUrl: string | null, numero: string) => {
    if (!xmlUrl) return;
    try {
      const { data } = await supabase.storage.from("fatture-xml").download(xmlUrl);
      if (data) {
        const text = await data.text();
        setXmlPreviewContent({ numero, xml: formatXml(text) });
        setXmlPreviewOpen(true);
      }
    } catch {
      toast.error("Errore nel caricamento XML");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Cassetto SDI</h1>
              <p className="mt-0.5 text-sm text-slate-500">Monitoraggio trasmissioni, ricevute e scarti dal Sistema di Interscambio.</p>
            </div>
          </div>
        <div className="flex items-center gap-3">
          <Select value={String(anno)} onValueChange={(v) => setAnno(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OperationalKpiCard icon={FileText} label="Trasmesse" value={kpi.trasmesse} hint="documenti inviati" tone="blue" />
        <OperationalKpiCard icon={CheckCircle2} label="Consegnate" value={kpi.consegnate} hint="ricevute RC" tone="green" />
        <OperationalKpiCard icon={AlertTriangle} label="Scartate" value={kpi.scartate} hint="da correggere" tone={kpi.scartate > 0 ? "red" : "green"} />
        <OperationalKpiCard icon={Clock} label="In attesa" value={kpi.inAttesa} hint="in lavorazione SDI" tone="amber" />
      </div>

      {/* Filters */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-2.5">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per numero, cliente, ID SDI..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statoFilter} onValueChange={setStatoFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Stato SDI" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="AT">Trasmessa</SelectItem>
                <SelectItem value="RC">Consegnata</SelectItem>
                <SelectItem value="NS">Scartata</SelectItem>
                <SelectItem value="MC">Mancata consegna</SelectItem>
                <SelectItem value="EC">Esito committente</SelectItem>
                <SelectItem value="DT">Decorrenza termini</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numero</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead>ID Trasmissione</TableHead>
                  <TableHead>Stato SDI</TableHead>
                  <TableHead>Notifica</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Caricamento...</TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <AlertTriangle className="h-6 w-6 text-amber-500" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">Errore nel caricamento del Cassetto SDI</p>
                          <p className="text-xs text-muted-foreground">Riprova senza ricaricare tutta la pagina.</p>
                        </div>
                        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
                          {isFetching ? (
                            <>
                              <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              Riprovo...
                            </>
                          ) : "Riprova"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nessun documento trasmesso</TableCell>
                  </TableRow>
                ) : (
                  filtered.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-mono font-medium">{doc.numero}</TableCell>
                      <TableCell>{formatDateShort(doc.data_emissione)}</TableCell>
                      <TableCell>{doc.cliente_snapshot?.ragione_sociale || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(doc.totale_documento)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{doc.sdi_id_trasmissione || "—"}</TableCell>
                      <TableCell><SdiStatoBadge stato={doc.sdi_stato} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{doc.sdi_notifica_tipo || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {doc.sdi_file_xml_url && (
                            <>
                              <Button
                                variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7"
                                title="Visualizza XML"
                                onClick={() => handlePreviewXml(doc.sdi_file_xml_url, doc.numero)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7"
                                title="Scarica XML"
                                onClick={() => handleDownloadXml(doc.sdi_file_xml_url)}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {doc.sdi_ricevuta_url && (
                            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" title="Scarica ricevuta" onClick={() => handleDownloadXml(doc.sdi_ricevuta_url)}>
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {isInvioInCorso(doc) ? (
                            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" title="Invio in corso" disabled>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            </Button>
                          ) : puoReinviare(doc) ? (
                            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" title="Reinvia" onClick={() => handleReinvia(doc.id)}>
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* AdE Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Portali Agenzia delle Entrate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <a href="https://ivaservizi.agenziaentrate.gov.it/portale/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Fatture e Corrispettivi
          </a>
          <a href="https://cassettofiscale.agenziaentrate.gov.it/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Cassetto Fiscale
          </a>
          <p className="text-xs text-muted-foreground mt-2">Accesso con SPID, CIE o CNS</p>
        </CardContent>
      </Card>

      {/* GAP-10: Modale anteprima XML formattata */}
      <Dialog open={xmlPreviewOpen} onOpenChange={setXmlPreviewOpen}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              XML Fattura Elettronica — {xmlPreviewContent?.numero}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 rounded border bg-muted/30">
            <pre className="p-4 text-xs font-mono whitespace-pre text-foreground leading-relaxed">
              {xmlPreviewContent?.xml || ""}
            </pre>
          </ScrollArea>
          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!xmlPreviewContent) return;
                const blob = new Blob([xmlPreviewContent.xml], { type: "application/xml" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${xmlPreviewContent.numero}.xml`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Scarica XML
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
