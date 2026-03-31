import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { queryKeys } from "@/lib/queryKeys";
import { QUOTE_STATUS_CONFIG, type QuoteStatus } from "@/lib/quoteStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Copy,
  Trash2,
  FileSignature,
  Loader2,
  FileText,
  Download,
  TrendingUp,
  Clock,
  Target,
} from "lucide-react";
import * as XLSX from "xlsx";

export default function Preventivi() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("tutti");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deleteQuote, setDeleteQuote] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 50;

  // Debounce ricerca: aspetta 300ms prima di filtrare, resetta la pagina
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(0);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const { data: quotesPage = { data: [], total: 0 }, isLoading } = useQuery({
    queryKey: [...queryKeys.quotes.list(companyId), currentPage, statusFilter],
    enabled: !!companyId,
    queryFn: async () => {
      let query = supabase
        .from("quotes")
        .select("id, quote_number, client_name, title, status, total, created_at", { count: "exact" })
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (statusFilter !== "tutti") {
        query = query.eq("status", statusFilter as any);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data || [], total: count || 0 };
    },
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const quotes = quotesPage.data;
  const totalQuotes = quotesPage.total;
  const totalPages = Math.ceil(totalQuotes / PAGE_SIZE);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      toast.success("Preventivo eliminato");
      setDeleteQuote(null);
    },
    onError: () => toast.error("Errore eliminazione"),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (quote: any) => {
      // 1. Carica righe originali
      const { data: originalItems, error: itemsErr } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", quote.id)
        .order("sort_order");
      if (itemsErr) throw itemsErr;

      // 2. Carica allegati originali
      const { data: originalAttachments } = await supabase
        .from("quote_pdf_attachments")
        .select("material_id, sort_order")
        .eq("quote_id", quote.id);

      // 3. Genera nuovo numero
      const { data: numData } = await supabase.rpc("generate_quote_number", {
        p_company_id: companyId!,
      });

      // 4. Inserisci testata (escludi campi univoci)
      const {
        id, created_at, updated_at, quote_number,
        signature_token, sent_at, viewed_at, signed_at,
        signed_by_name, signed_by_ip, refused_at, refused_reason,
        pdf_storage_path, pdf_generated_at, expires_at, created_by,
        ...rest
      } = quote;

      const { data: newQuote, error: quoteErr } = await supabase
        .from("quotes")
        .insert({
          ...rest,
          quote_number: numData || `OFF-${new Date().getFullYear()}-DUP`,
          status: "bozza",
          created_by: user?.id,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (quoteErr) throw quoteErr;

      // 5. Copia righe
      if (originalItems && originalItems.length > 0) {
        const { error: newItemsErr } = await supabase.from("quote_items").insert(
          originalItems.map(({ id: _id, created_at: _ca, updated_at: _ua, ...item }: any) => ({
            ...item,
            quote_id: newQuote.id,
          }))
        );
        if (newItemsErr) throw newItemsErr;
      }

      // 6. Copia allegati PDF
      if (originalAttachments && originalAttachments.length > 0) {
        await supabase.from("quote_pdf_attachments").insert(
          originalAttachments.map((a: any) => ({ ...a, quote_id: newQuote.id }))
        );
      }

      return newQuote.id;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      toast.success("Preventivo duplicato con tutte le righe");
      navigate(`/azienda/marketing/preventivi/${newId}`);
    },
    onError: (err: any) => toast.error("Errore duplicazione: " + (err.message || "errore")),
  });

  // Reset to page 0 when status filter changes
  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(0);
  };

  const filtered = quotes.filter((q: any) => {
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      return (
        q.quote_number?.toLowerCase().includes(s) ||
        q.client_name?.toLowerCase().includes(s) ||
        q.title?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  // KPIs — query separata senza paginazione né filtro status
  const { data: kpiData } = useQuery({
    queryKey: ["quotes-kpi", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("status, total, sent_at, signed_at, expires_at, created_at")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data || [];
    },
    staleTime: 3 * 60 * 1000,
  });
  const kpiRows = kpiData || [];
  const bozze = kpiRows.filter((q: any) => q.status === "bozza").length;
  const inviate = kpiRows.filter((q: any) => q.status === "inviata").length;
  const accettate = kpiRows.filter((q: any) => q.status === "accettata").length;
  const rifiutate = kpiRows.filter((q: any) => q.status === "rifiutata").length;
  const valoreTotale = kpiRows
    .filter((q: any) => q.status === "accettata")
    .reduce((sum: number, q: any) => sum + (q.total || 0), 0);

  // KPI avanzati
  const pipeline = kpiRows
    .filter((q: any) => q.status === "inviata")
    .reduce((sum: number, q: any) => sum + (q.total || 0), 0);

  const decisioni = accettate + rifiutate;
  const tassoConversione = decisioni > 0 ? Math.round((accettate / decisioni) * 100) : null;

  const conRisposta = kpiRows.filter(
    (q: any) => q.status === "accettata" && q.sent_at && q.signed_at
  );
  const tempoMedioMs = conRisposta.length > 0
    ? conRisposta.reduce((sum: number, q: any) => {
        return sum + (new Date(q.signed_at).getTime() - new Date(q.sent_at).getTime());
      }, 0) / conRisposta.length
    : null;
  const tempoMedioGiorni = tempoMedioMs !== null
    ? Math.round(tempoMedioMs / (1000 * 60 * 60 * 24))
    : null;

  const nonBozze = kpiRows.filter((q: any) => q.status !== "bozza");
  const valoremedioOfferta = nonBozze.length > 0
    ? nonBozze.reduce((s: number, q: any) => s + (q.total || 0), 0) / nonBozze.length
    : 0;

  // Export Excel
  const handleExportExcel = () => {
    const exportRows = filtered.map((q: any) => {
      const sc = QUOTE_STATUS_CONFIG[q.status as QuoteStatus] || QUOTE_STATUS_CONFIG.bozza;
      return {
        Numero: q.quote_number || "",
        Cliente: q.client_name || "",
        Titolo: q.title || "",
        Stato: sc.label,
        "Totale (€)": q.total || 0,
        Data: q.created_at ? format(new Date(q.created_at), "dd/MM/yyyy", { locale: it }) : "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    // Auto-fit columns
    const colWidths = Object.keys(exportRows[0] || {}).map((k) => ({
      wch: Math.max(k.length, ...exportRows.map((r: any) => String(r[k] ?? "").length)) + 2,
    }));
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Preventivi");
    XLSX.writeFile(wb, `preventivi_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Preventivi</h1>
          <p className="text-muted-foreground">Gestisci le offerte commerciali</p>
        </div>
        <div className="flex gap-2">
          {filtered.length > 0 && (
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" />
              Esporta Excel
            </Button>
          )}
          <Button onClick={() => navigate("/azienda/marketing/preventivi/nuovo")}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Preventivo
          </Button>
        </div>
      </div>

      {/* KPI strip — base */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Bozze</p>
            <p className="text-2xl font-bold">{bozze}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Inviate</p>
            <p className="text-2xl font-bold">{inviate}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Accettate</p>
            <p className="text-2xl font-bold">{accettate}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Valore Accettate</p>
            <p className="text-2xl font-bold">{formatCurrency(valoreTotale)}</p>
          </CardContent>
        </Card>
      </div>

      {/* KPI avanzati */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-[#1E3A5F]" />
              <p className="text-sm text-muted-foreground">Tasso conversione</p>
            </div>
            <p className="text-2xl font-bold">
              {tassoConversione !== null ? `${tassoConversione}%` : "—"}
            </p>
            {decisioni > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {accettate} / {decisioni} con risposta
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-[#1E3A5F]" />
              <p className="text-sm text-muted-foreground">Pipeline attiva</p>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(pipeline)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {inviate} offert{inviate === 1 ? "a" : "e"} in attesa
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-[#1E3A5F]" />
              <p className="text-sm text-muted-foreground">Valore medio offerta</p>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(valoremedioOfferta)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              su {nonBozze.length} offert{nonBozze.length === 1 ? "a" : "e"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-[#1E3A5F]" />
              <p className="text-sm text-muted-foreground">Tempo medio firma</p>
            </div>
            <p className="text-2xl font-bold">
              {tempoMedioGiorni !== null ? `${tempoMedioGiorni}gg` : "—"}
            </p>
            {conRisposta.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                su {conRisposta.length} firmat{conRisposta.length === 1 ? "a" : "e"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per numero, cliente, titolo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={handleStatusFilter}>
          <TabsList>
            <TabsTrigger value="tutti">Tutti</TabsTrigger>
            <TabsTrigger value="bozza">Bozze</TabsTrigger>
            <TabsTrigger value="inviata">Inviate</TabsTrigger>
            <TabsTrigger value="accettata">Accettate</TabsTrigger>
            <TabsTrigger value="rifiutata">Rifiutate</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileSignature className="h-16 w-16 mx-auto mb-4 text-muted-foreground/40" />
          <h3 className="text-lg font-medium mb-1">Nessun preventivo</h3>
          <p className="text-muted-foreground mb-4">Crea il tuo primo preventivo</p>
          <Button onClick={() => navigate("/azienda/marketing/preventivi/nuovo")}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Preventivo
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numero</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Titolo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Totale</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((q: any) => {
                const sc = QUOTE_STATUS_CONFIG[q.status as QuoteStatus] || QUOTE_STATUS_CONFIG.bozza;
                return (
                  <TableRow
                    key={q.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/azienda/marketing/preventivi/${q.id}`)}
                  >
                    <TableCell className="font-mono text-sm">{q.quote_number}</TableCell>
                    <TableCell>{q.client_name || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{q.title || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={sc.variant}>{sc.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(q.total || 0)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(q.created_at), "dd MMM yyyy", { locale: it })}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/azienda/marketing/preventivi/${q.id}`);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Apri
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateMutation.mutate(q);
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Duplica
                          </DropdownMenuItem>
                          {q.status === "bozza" && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteQuote(q);
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Elimina
                            </DropdownMenuItem>
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
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, totalQuotes)} di {totalQuotes}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Successiva
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteQuote} onOpenChange={(o) => !o && setDeleteQuote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina preventivo</AlertDialogTitle>
            <AlertDialogDescription>
              Eliminare il preventivo {deleteQuote?.quote_number}? L'azione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteQuote && deleteMutation.mutate(deleteQuote.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Eliminazione...</>
              ) : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
