import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, MoreVertical, FileText, CreditCard, Loader2, RefreshCw, Link2, Eye } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  draft:     { label: "Bozza",       color: "bg-muted text-muted-foreground",       emoji: "📝" },
  issued:    { label: "Emessa",      color: "bg-blue-100 text-blue-800",            emoji: "📤" },
  sent:      { label: "Inviata SDI", color: "bg-orange-100 text-orange-800",        emoji: "📨" },
  delivered: { label: "Consegnata",  color: "bg-teal-100 text-teal-800",            emoji: "✅" },
  paid:      { label: "Pagata",      color: "bg-green-100 text-green-800",          emoji: "💰" },
  overdue:   { label: "Scaduta",     color: "bg-destructive/10 text-destructive",   emoji: "⏰" },
  cancelled: { label: "Annullata",   color: "bg-muted text-muted-foreground line-through", emoji: "❌" },
};

const PROVIDER_LABELS: Record<string, string> = {
  fattureincloud: "Fatture in Cloud",
  fattura24: "Fattura24",
  aruba: "Aruba",
  invoicetronic: "Invoicetronic",
};

export default function InvoicesList() {
  const { effectiveCompany } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Check if provider is connected
  const { data: integration } = useQuery({
    queryKey: ["billing_integration", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_integrations")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  const markPaidMutation = useMutation({
    mutationFn: async (inv: { id: string; total: number }) => {
      const { error } = await supabase.from("invoice_payments").insert({
        invoice_id: inv.id,
        company_id: companyId!,
        amount: inv.total,
        payment_date: new Date().toISOString().split("T")[0],
        payment_method: "bank_transfer",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fattura segnata come pagata");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const [syncing, setSyncing] = useState(false);
  const syncInvoices = async () => {
    if (!integration) {
      toast.error("Nessun provider connesso", { description: "Vai nelle impostazioni per connettere il tuo gestionale." });
      return;
    }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("billing-import", {
        body: { provider: integration.provider },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Sincronizzazione completata", {
        description: `${data?.imported || 0} fatture importate, ${data?.updated || 0} aggiornate`,
      });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e) {
      toast.error("Errore sincronizzazione", { description: String(e) });
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    let list = invoices;
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((i) =>
        (i.invoice_number || "").toLowerCase().includes(s) ||
        (i.client_company_name || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [invoices, statusFilter, search]);

  // KPIs
  const kpis = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const receivable = invoices
      .filter((i) => ["issued", "sent", "delivered", "overdue"].includes(i.status))
      .reduce((s, i) => s + Number(i.total) - Number(i.paid_amount), 0);
    const overdue = invoices.filter((i) => i.status === "overdue");
    const overdueAmount = overdue.reduce((s, i) => s + Number(i.total) - Number(i.paid_amount), 0);
    const issuedThisMonth = invoices.filter(
      (i) => i.issue_date?.startsWith(thisMonth) && i.document_type === "invoice" && i.status !== "cancelled"
    ).length;
    return { receivable, overdueCount: overdue.length, overdueAmount, issuedThisMonth };
  }, [invoices]);

  const fmtEur = (n: number) => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      {/* No provider banner */}
      {!isLoading && !integration && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link2 className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Connetti il tuo gestionale di fatturazione</p>
                <p className="text-sm text-muted-foreground">Collega Fatture in Cloud, Fattura24, Aruba o Invoicetronic per importare automaticamente le fatture.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate("/azienda/impostazioni")}>
              Configura
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Fatturazione</h1>
          {integration && (
            <Badge variant="outline" className="ml-2 text-xs">
              {PROVIDER_LABELS[integration.provider] || integration.provider}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {integration?.last_sync_at && (
            <span className="text-xs text-muted-foreground">
              Ultimo sync: {format(new Date(integration.last_sync_at), "dd/MM HH:mm", { locale: it })}
            </span>
          )}
          <Button onClick={syncInvoices} disabled={syncing || !integration}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sincronizza
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Da incassare</p>
            <p className="text-xl font-bold">{fmtEur(kpis.receivable)}</p>
          </CardContent>
        </Card>
        <Card className={kpis.overdueCount > 0 ? "border-destructive" : ""}>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Fatture scadute</p>
            <p className="text-xl font-bold text-destructive">{kpis.overdueCount} ({fmtEur(kpis.overdueAmount)})</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Emesse questo mese</p>
            <p className="text-xl font-bold">{kpis.issuedThisMonth}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Totale fatture</p>
            <p className="text-xl font-bold">{invoices.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">Tutte</TabsTrigger>
            <TabsTrigger value="draft">Bozze</TabsTrigger>
            <TabsTrigger value="issued">Emesse</TabsTrigger>
            <TabsTrigger value="sent">Inviate</TabsTrigger>
            <TabsTrigger value="paid">Pagate</TabsTrigger>
            <TabsTrigger value="overdue">Scadute</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cerca cliente o numero..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {invoices.length === 0
            ? integration
              ? "Nessuna fattura importata. Premi 'Sincronizza' per importare dal gestionale."
              : "Nessuna fattura. Connetti un gestionale per iniziare."
            : "Nessun risultato per i filtri selezionati."}
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Numero</th>
                <th className="text-left p-3 font-medium">Cliente</th>
                <th className="text-left p-3 font-medium">Data</th>
                <th className="text-left p-3 font-medium">Scadenza</th>
                <th className="text-right p-3 font-medium">Importo</th>
                <th className="text-left p-3 font-medium">Stato</th>
                <th className="text-left p-3 font-medium">Origine</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft;
                return (
                  <tr key={inv.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/azienda/fatturazione/${inv.id}`)}>
                    <td className="p-3 font-mono text-xs">{inv.invoice_number || "—"}</td>
                    <td className="p-3 font-medium">{inv.client_company_name}</td>
                    <td className="p-3 text-muted-foreground">{inv.issue_date ? format(new Date(inv.issue_date), "dd/MM/yy", { locale: it }) : "—"}</td>
                    <td className="p-3 text-muted-foreground">{inv.due_date ? format(new Date(inv.due_date), "dd/MM/yy", { locale: it }) : "—"}</td>
                    <td className="p-3 text-right font-medium">{fmtEur(Number(inv.total))}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className={cfg.color}>{cfg.emoji} {cfg.label}</Badge>
                    </td>
                    <td className="p-3">
                      {inv.external_provider ? (
                        <Badge variant="outline" className="text-xs">
                          {PROVIDER_LABELS[inv.external_provider] || inv.external_provider}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Locale</span>
                      )}
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/azienda/fatturazione/${inv.id}`)}>
                            <Eye className="h-4 w-4 mr-2" /> Visualizza
                          </DropdownMenuItem>
                          {!["paid", "cancelled"].includes(inv.status) && (
                            <DropdownMenuItem onClick={() => markPaidMutation.mutate({ id: inv.id, total: Number(inv.total) })}>
                              <CreditCard className="h-4 w-4 mr-2" /> Segna come pagata
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
