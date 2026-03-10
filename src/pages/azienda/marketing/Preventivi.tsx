import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { queryKeys } from "@/lib/queryKeys";
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
} from "lucide-react";

type QuoteStatus = "bozza" | "inviata" | "accettata" | "rifiutata" | "scaduta";

const statusConfig: Record<QuoteStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  bozza: { label: "Bozza", variant: "secondary" },
  inviata: { label: "Inviata", variant: "default" },
  accettata: { label: "Accettata", variant: "default" },
  rifiutata: { label: "Rifiutata", variant: "destructive" },
  scaduta: { label: "Scaduta", variant: "outline" },
};

export default function Preventivi() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("tutti");
  const [search, setSearch] = useState("");
  const [deleteQuote, setDeleteQuote] = useState<any | null>(null);

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: queryKeys.quotes.list(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, client_name, title, status, total, created_at")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

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
      const { data: numData } = await supabase.rpc("generate_quote_number", {
        p_company_id: companyId!,
      });
      const { id, created_at, updated_at, quote_number, signature_token, sent_at, viewed_at, signed_at, signed_by_name, signed_by_ip, refused_at, refused_reason, pdf_storage_path, pdf_generated_at, expires_at, created_by, ...rest } = quote;
      const { error } = await supabase.from("quotes").insert({
        ...rest,
        quote_number: numData || `OFF-${new Date().getFullYear()}-DUP`,
        status: "bozza",
        created_by: user?.id,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast.success("Preventivo duplicato");
    },
    onError: () => toast.error("Errore duplicazione"),
  });

  const filtered = quotes.filter((q: any) => {
    if (statusFilter !== "tutti" && q.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        q.quote_number?.toLowerCase().includes(s) ||
        q.client_name?.toLowerCase().includes(s) ||
        q.title?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  // KPIs
  const bozze = quotes.filter((q: any) => q.status === "bozza").length;
  const inviate = quotes.filter((q: any) => q.status === "inviata").length;
  const accettate = quotes.filter((q: any) => q.status === "accettata").length;
  const valoreTotale = quotes
    .filter((q: any) => q.status === "accettata")
    .reduce((sum: number, q: any) => sum + (q.total || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Preventivi</h1>
          <p className="text-muted-foreground">Gestisci le offerte commerciali</p>
        </div>
        <Button onClick={() => navigate("/azienda/marketing/preventivi/nuovo")}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Preventivo
        </Button>
      </div>

      {/* KPI strip */}
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
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
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
                const sc = statusConfig[q.status as QuoteStatus] || statusConfig.bozza;
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
