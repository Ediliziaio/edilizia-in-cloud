import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, RefreshCw, ExternalLink, FileText, Search } from "lucide-react";
import { toast } from "sonner";

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

export default function CassettoSDI() {
  const companyId = useEffectiveCompanyId();
  const currentYear = new Date().getFullYear();
  const [anno, setAnno] = useState(String(currentYear));
  const [searchQuery, setSearchQuery] = useState("");
  const [statoFilter, setStatoFilter] = useState("all");

  const { data: documenti = [], isLoading } = useQuery({
    queryKey: ["cassetto-sdi", companyId, anno],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documenti_fiscali" as never)
        .select("id, numero, tipo, data_emissione, cliente_snapshot, totale_documento, totale_da_pagare, stato, sdi_id_trasmissione, sdi_stato, sdi_notifica_tipo, sdi_file_xml_url, sdi_ricevuta_url, sdi_data_consegna")
        .eq("company_id", companyId!)
        .eq("anno", parseInt(anno))
        .in("stato", ["inviata_sdi", "consegnata", "accettata", "rifiutata"])
        .order("data_emissione", { ascending: false });

      if (error) throw error;
      return data as any[];
    },
  });

  const kpi = useMemo(() => {
    const trasmesse = documenti.length;
    const consegnate = documenti.filter(d => d.sdi_stato === "RC" || d.stato === "consegnata").length;
    const scartate = documenti.filter(d => d.sdi_stato === "NS" || d.stato === "rifiutata").length;
    const inAttesa = documenti.filter(d => d.sdi_stato === "AT" || d.stato === "inviata_sdi").length;
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
        const detail = error.context ? await (error.context as any).json?.().catch((): null => null) : null;
        throw new Error(detail?.error || error.message);
      }
      toast.success("Documento reinviato a SDI");
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cassetto SDI</h1>
          <p className="text-sm text-muted-foreground">Monitoraggio trasmissioni al Sistema di Interscambio</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={anno} onValueChange={setAnno}>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Trasmesse</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.trasmesse}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Consegnate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{kpi.consegnate}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scartate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{kpi.scartate}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In attesa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{kpi.inAttesa}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
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
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownloadXml(doc.sdi_file_xml_url)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {doc.sdi_ricevuta_url && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownloadXml(doc.sdi_ricevuta_url)}>
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(doc.sdi_stato === "NS" || doc.stato === "rifiutata") && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleReinvia(doc.id)}>
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
    </div>
  );
}
