import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { createTimeoutSignal, withClientTimeout } from "@/lib/query-timeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, RefreshCw, ExternalLink, FileText, Search, Eye, CheckCircle2, AlertTriangle, Clock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { puoReinviare, isInvioInCorso, faseSdi, type FaseSdi } from "@/lib/fatturazione/sdiCassetto";
import { FaseSdiBadge } from "@/components/fatturazione/FaseSdiBadge";

import { useIsMobile } from "@/hooks/use-mobile";
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

// I filtri seguono le fasi di faseSdi (lib/fatturazione/sdiCassetto.ts), le
// stesse dell'elenco documenti e dell'editor (24/09/2026).
const FILTRI_FASE: Record<string, FaseSdi[]> = {
  in_elaborazione: ["in_elaborazione", "invio_in_corso"],
  inviate: ["inviata", "accettata"],
  scartate: ["scartata"],
  rifiutate: ["rifiutata_ente"],
  manuali: ["manuale"],
};

type CassettoSDIProps = {
  embedded?: boolean;
};

export default function CassettoSDI({ embedded = false }: CassettoSDIProps = {}) {
  const isMobile = useIsMobile();
  void embedded;
  const companyId = useEffectiveCompanyId();
  const currentYear = new Date().getFullYear();
  const [anno, setAnno] = useState(currentYear);
  const [searchQuery, setSearchQuery] = useState("");
  const [statoFilter, setStatoFilter] = useState("all");
  const [xmlPreviewOpen, setXmlPreviewOpen] = useState(false);
  const [xmlPreviewContent, setXmlPreviewContent] = useState<{ numero: string; xml: string } | null>(null);
  const navigate = useNavigate();

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
          .select("id, numero, tipo, data_emissione, cliente_snapshot, totale_documento, totale_da_pagare, stato, trasmissione, sdi_id_trasmissione, sdi_stato, sdi_notifica_tipo, sdi_errori, sdi_file_xml_url, sdi_ricevuta_url, sdi_data_consegna")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .or(`anno.eq.${anno},and(anno.is.null,data_emissione.gte.${anno}-01-01,data_emissione.lte.${anno}-12-31)`)
          // Il cassetto raccoglie ciò che è andato allo SDI. Filtrare per `stato`
          // faceva sparire le fatture trasmesse e poi incassate (lo stato diventa
          // "pagata"): si guarda l'id di trasmissione, che non cambia più.
          .or(
            "sdi_id_trasmissione.not.is.null,sdi_stato.not.is.null," +
              "stato.in.(in_invio,inviata_sdi,consegnata,accettata,rifiutata)",
          )
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
    const fasi = documenti.map((d) => faseSdi(d)?.fase);
    const consegnate = fasi.filter((f) => f === "inviata" || f === "accettata").length;
    const scartate = fasi.filter((f) => f === "scartata" || f === "rifiutata_ente").length;
    const inAttesa = fasi.filter((f) => f === "in_elaborazione" || f === "invio_in_corso").length;
    return { trasmesse, consegnate, scartate, inAttesa };
  }, [documenti]);

  const filtered = useMemo(() => {
    let result = documenti;
    if (statoFilter !== "all") {
      const fasi = FILTRI_FASE[statoFilter] ?? [];
      result = result.filter((d) => {
        const f = faseSdi(d)?.fase;
        return !!f && fasi.includes(f);
      });
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
                <SelectItem value="in_elaborazione">In elaborazione</SelectItem>
                <SelectItem value="inviate">Inviate</SelectItem>
                <SelectItem value="scartate">Scartate</SelectItem>
                <SelectItem value="rifiutate">Rifiutate dall'ente</SelectItem>
                <SelectItem value="manuali">XML da caricare</SelectItem>
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
                      <TableCell><FaseSdiBadge doc={doc} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{doc.sdi_notifica_tipo || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {doc.sdi_file_xml_url && (
                            <>
                              <Button
                                variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7"
                                title="Visualizza XML" aria-label="Visualizza XML"
                                onClick={() => handlePreviewXml(doc.sdi_file_xml_url, doc.numero)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {/* «Visualizza XML» qui sopra resta: si può leggere
                                  il documento anche da telefono, solo non scaricarlo. */}
                              {!isMobile && (
                                <Button
                                  variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7"
                                  title="Scarica XML" aria-label="Scarica XML"
                                  onClick={() => handleDownloadXml(doc.sdi_file_xml_url)}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                          {!isMobile && doc.sdi_ricevuta_url && (
                            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" title="Scarica ricevuta" aria-label="Scarica ricevuta" onClick={() => handleDownloadXml(doc.sdi_ricevuta_url)}>
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {isInvioInCorso(doc) ? (
                            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" title="Invio in corso" aria-label="Invio in corso" disabled>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            </Button>
                          ) : puoReinviare(doc) ? (
                            // Rimandare lo stesso XML riporterebbe lo stesso scarto: si
                            // corregge nell'editor, che poi la rimanda (24/09/2026).
                            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" title="Correggi e rimanda" aria-label="Correggi e rimanda" onClick={() => navigate(`/azienda/documenti/${doc.id}`)}>
                              <Pencil className="h-3.5 w-3.5" />
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
          {/* La lettura dell'XML resta, lo scarico no. */}
          {!isMobile && (
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
