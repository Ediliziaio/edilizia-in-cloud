import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useDocumentiFiscali, useDeleteDocumento, useUpdateDocumento } from "@/hooks/useDocumentiFiscali";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { downloadNativePDF } from "@/lib/fatturazione/generatePDF";
import { generateFatturaPAXML } from "@/lib/fatturazione/generateXML";
import { creaNotaCredito } from "@/lib/fatturazione/noteCredito";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, FileText, MoreHorizontal, Search, X, Loader2, ChevronLeft, ChevronRight, Download, Eye, Pencil, Copy, CreditCard, Trash2, FileWarning } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";
import { it } from "date-fns/locale";
import type { DocumentoFiscale, TipoDocumento, StatoDocumento, AnagraficaAzienda } from "@/types/fatturazione";

const PER_PAGE = 25;

const TIPO_TABS: { label: string; value: TipoDocumento[] | null }[] = [
  { label: "Tutte", value: null },
  { label: "Fatture", value: ["fattura", "fattura_pa"] },
  { label: "Note credito", value: ["nota_credito"] },
  { label: "DDT", value: ["ddt"] },
  { label: "Preventivi", value: ["preventivo"] },
  { label: "Pro-forma", value: ["proforma"] },
];

const STATO_BADGE: Record<string, { label: string; className: string }> = {
  bozza: { label: "Bozza", className: "bg-muted text-muted-foreground" },
  emessa: { label: "Emessa", className: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300" },
  inviata_sdi: { label: "Inviata SDI", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  consegnata: { label: "Consegnata", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  accettata: { label: "Accettata", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  pagata: { label: "✓ Pagata", className: "bg-emerald-200 text-emerald-800 font-semibold dark:bg-emerald-800 dark:text-emerald-200" },
  parzialmente_pagata: { label: "Parz. pagata", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  scaduta: { label: "Scaduta", className: "bg-destructive/10 text-destructive" },
  rifiutata: { label: "✗ Rifiutata", className: "bg-destructive/10 text-destructive" },
  stornata: { label: "Stornata", className: "bg-muted text-muted-foreground line-through" },
  annullata: { label: "Annullata", className: "bg-destructive/10 text-destructive" },
};

const TIPO_LABELS: Record<string, string> = {
  fattura: "Fattura", fattura_pa: "Fattura PA", nota_credito: "NC", nota_debito: "ND",
  proforma: "Pro-forma", preventivo: "Preventivo", ddt: "DDT",
};

const DATE_PRESETS = [
  { label: "Questo mese", range: () => ({ da: format(startOfMonth(new Date()), "yyyy-MM-dd"), a: format(endOfMonth(new Date()), "yyyy-MM-dd") }) },
  { label: "Ultimo trimestre", range: () => ({ da: format(startOfMonth(subMonths(new Date(), 2)), "yyyy-MM-dd"), a: format(endOfMonth(new Date()), "yyyy-MM-dd") }) },
  { label: "Anno corrente", range: () => ({ da: format(startOfYear(new Date()), "yyyy-MM-dd"), a: format(endOfMonth(new Date()), "yyyy-MM-dd") }) },
];

const NC_ALLOWED = ["emessa", "consegnata", "inviata_sdi", "accettata", "pagata", "parzialmente_pagata"];

export default function DocumentiFiscaliList() {
  const navigate = useNavigate();
  const [tipoFilter, setTipoFilter] = useState<TipoDocumento[] | null>(null);
  const [statoFilter, setStatoFilter] = useState<StatoDocumento[]>([]);
  const [search, setSearch] = useState("");
  const [dataDa, setDataDa] = useState<string | undefined>();
  const [dataA, setDataA] = useState<string | undefined>();
  const [page, setPage] = useState(0);

  const { data: azienda } = useAnagraficaAzienda();
  const deleteMutation = useDeleteDocumento();
  const updateMutation = useUpdateDocumento();

  const filters = useMemo(() => ({
    tipo: tipoFilter ?? undefined,
    stato: statoFilter.length ? statoFilter : undefined,
    search: search || undefined,
    data_da: dataDa,
    data_a: dataA,
    page,
    perPage: PER_PAGE,
  }), [tipoFilter, statoFilter, search, dataDa, dataA, page]);

  const { data, isLoading } = useDocumentiFiscali(filters);

  // KPI — all docs (unfiltered) would be ideal, but we compute from current page data as approximation
  // For real KPIs we'd use separate aggregate queries; this is a reasonable starting point
  const docs = data?.documenti ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PER_PAGE);

  const hasFilters = tipoFilter || statoFilter.length > 0 || search || dataDa;

  const clearFilters = () => {
    setTipoFilter(null);
    setStatoFilter([]);
    setSearch("");
    setDataDa(undefined);
    setDataA(undefined);
    setPage(0);
  };

  const handleAction = async (action: string, doc: DocumentoFiscale) => {
    switch (action) {
      case "view":
        navigate(`/azienda/documenti/${doc.id}/dettaglio`);
        break;
      case "edit":
        navigate(`/azienda/documenti/${doc.id}`);
        break;
      case "duplicate":
        navigate(`/azienda/documenti/nuovo?tipo=${doc.tipo}`, { state: { prefilled: doc } });
        break;
      case "pdf":
        try { await downloadNativePDF(doc.id, doc.numero); toast.success("PDF scaricato"); } catch (e: any) { toast.error(e.message); }
        break;
      case "xml":
        try {
          const xml = generateFatturaPAXML(doc, azienda as AnagraficaAzienda);
          const blob = new Blob([xml], { type: "application/xml" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = `${doc.numero}.xml`; a.click();
          URL.revokeObjectURL(url);
          toast.success("XML scaricato");
        } catch (e: any) { toast.error(e.message); }
        break;
      case "nc":
        try {
          const prefilled = await creaNotaCredito(doc.id, "totale");
          navigate("/azienda/documenti/nuovo?tipo=nota_credito", { state: { prefilled } });
        } catch (e: any) { toast.error(e.message); }
        break;
      case "pagata":
        updateMutation.mutate({ id: doc.id, stato: "pagata", importo_pagato: doc.totale_da_pagare, pagato_at: new Date().toISOString() });
        break;
      case "delete":
        deleteMutation.mutate(doc.id);
        break;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fatturazione</h1>
          <p className="text-muted-foreground">Gestisci tutti i tuoi documenti fiscali.</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Nuovo documento
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=fattura")}>Fattura (TD01)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=nota_credito")}>Nota di Credito</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=proforma")}>Pro-Forma</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=preventivo")}>Preventivo</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=ddt")}>DDT</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=fattura_pa")}>Fattura PA</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Documenti totali</p><p className="text-lg font-semibold">{total}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">In questa pagina</p><p className="text-lg font-semibold">{docs.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Pagina</p><p className="text-lg font-semibold">{page + 1} / {Math.max(totalPages, 1)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Per pagina</p><p className="text-lg font-semibold">{PER_PAGE}</p></CardContent></Card>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Type tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {TIPO_TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => { setTipoFilter(tab.value); setPage(0); }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                JSON.stringify(tipoFilter) === JSON.stringify(tab.value)
                  ? "bg-background text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Date presets */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">{dataDa ? `${dataDa} → ${dataA}` : "Periodo"}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {DATE_PRESETS.map((p) => (
              <DropdownMenuItem key={p.label} onClick={() => { const r = p.range(); setDataDa(r.da); setDataA(r.a); setPage(0); }}>
                {p.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setDataDa(undefined); setDataA(undefined); setPage(0); }}>Tutto il periodo</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca numero, cliente..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-8"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-3 w-3" /> Azzera filtri
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium">Nessun documento trovato</p>
          <p className="text-sm text-muted-foreground mt-1">
            {hasFilters ? "Prova a modificare i filtri." : "Crea il tuo primo documento per iniziare."}
          </p>
          {!hasFilters && (
            <Button className="mt-4" onClick={() => navigate("/azienda/documenti/nuovo?tipo=fattura")}>
              <Plus className="h-4 w-4 mr-1" /> Crea la tua prima fattura
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Numero</TableHead>
                  <TableHead className="w-24">Tipo</TableHead>
                  <TableHead className="w-28">Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right w-28">Totale</TableHead>
                  <TableHead className="w-32">Stato</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => {
                  const stato = STATO_BADGE[doc.stato] ?? { label: doc.stato, className: "bg-muted" };
                  return (
                    <TableRow key={doc.id} className="cursor-pointer" onClick={() => navigate(`/azienda/documenti/${doc.id}/dettaglio`)}>
                      <TableCell className="font-mono text-sm">{doc.numero}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{TIPO_LABELS[doc.tipo] ?? doc.tipo}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doc.data_emissione}</TableCell>
                      <TableCell className="text-sm">{doc.cliente_snapshot?.ragione_sociale || "—"}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">€ {doc.totale_documento.toFixed(2)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${stato.className}`}>
                          {stato.label}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleAction("view", doc)}>
                              <Eye className="h-4 w-4 mr-2" /> Visualizza
                            </DropdownMenuItem>
                            {doc.stato === "bozza" && (
                              <DropdownMenuItem onClick={() => handleAction("edit", doc)}>
                                <Pencil className="h-4 w-4 mr-2" /> Modifica
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleAction("duplicate", doc)}>
                              <Copy className="h-4 w-4 mr-2" /> Duplica
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleAction("pdf", doc)}>
                              <Download className="h-4 w-4 mr-2" /> Scarica PDF
                            </DropdownMenuItem>
                            {!["ddt", "proforma", "preventivo"].includes(doc.tipo) && (
                              <DropdownMenuItem onClick={() => handleAction("xml", doc)}>
                                <FileText className="h-4 w-4 mr-2" /> Scarica XML
                              </DropdownMenuItem>
                            )}
                            {NC_ALLOWED.includes(doc.stato) && ["fattura", "fattura_pa"].includes(doc.tipo) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleAction("nc", doc)}>
                                  <FileWarning className="h-4 w-4 mr-2" /> Emetti NC
                                </DropdownMenuItem>
                              </>
                            )}
                            {["emessa", "inviata_sdi", "consegnata", "accettata", "parzialmente_pagata"].includes(doc.stato) && (
                              <DropdownMenuItem onClick={() => handleAction("pagata", doc)}>
                                <CreditCard className="h-4 w-4 mr-2" /> Segna pagata
                              </DropdownMenuItem>
                            )}
                            {doc.stato === "bozza" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => handleAction("delete", doc)}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Elimina
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {total} documenti trovati
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">Pagina {page + 1} di {Math.max(totalPages, 1)}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
