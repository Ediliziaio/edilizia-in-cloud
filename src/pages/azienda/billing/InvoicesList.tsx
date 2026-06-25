import { useState, useMemo, Fragment } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, MoreVertical, FileText, CreditCard, Loader2, RefreshCw, Link2, Eye, BarChart3, Download, Cloud, FileCode } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import BillingReports from "./BillingReports";

/**
 * Stato "effettivo" per il badge: una fattura non pagata/annullata con scadenza
 * passata viene mostrata come Scaduta — coerente coi KPI e con la UX di Fatture
 * in Cloud — anche se il gestionale d'origine la riporta ancora come "Emessa".
 */
function effectiveStatus(inv: { status: string; due_date?: string | null; paid_amount?: number | null; total?: number | null }): string {
  if (["paid", "cancelled", "draft"].includes(inv.status)) return inv.status;
  const residuo = Number(inv.total ?? 0) - Number(inv.paid_amount ?? 0);
  if (inv.due_date && new Date(inv.due_date) < new Date() && residuo > 0.005) return "overdue";
  return inv.status;
}

/** Iniziali del cliente per l'avatar (max 2 lettere). */
function clienteInitials(name?: string | null): string {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * Importo + chiarezza incasso (UX Fatture in Cloud): mostra il totale e una
 * riga di stato pagamento — "Saldata" (verde), "Residuo €X" (ambra, acconto
 * parziale) — o "Nota di credito" (storno, in rosso col segno meno).
 */
function ImportoInfo({ inv }: { inv: { total?: number | null; paid_amount?: number | null; status: string; document_type?: string | null } }) {
  const total = Number(inv.total || 0);
  const paid = Number(inv.paid_amount || 0);
  const isCredit = inv.document_type === "credit_note";
  const fullyPaid = !isCredit && (inv.status === "paid" || (paid > 0 && total - paid <= 0.005));
  const partial = !isCredit && !fullyPaid && paid > 0.005;
  return (
    <>
      <div className={`font-medium ${isCredit ? "text-rose-600" : ""}`}>
        {isCredit ? "−" : ""}{formatCurrency(total)}
      </div>
      {isCredit ? (
        <div className="text-[10px] text-muted-foreground">Nota di credito</div>
      ) : fullyPaid ? (
        <div className="text-[10px] font-medium text-green-600">Saldata</div>
      ) : partial ? (
        <div className="text-[10px] font-medium text-amber-600">Residuo {formatCurrency(total - paid)}</div>
      ) : null}
    </>
  );
}

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
  const [yearFilter, setYearFilter] = useState("all");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        // ⚠️ Selezionare SOLO colonne esistenti: PostgREST ritorna 400 sull'INTERA query
        // se anche una sola colonna non esiste (NON undefined) → la lista resta vuota.
        // Nomi reali verificati a schema: tax_amount (non vat_amount), document_type (non
        // invoice_type), external_provider (non provider), external_xml_url (non xml_url).
        // currency/customer_id NON esistono → rimosse.
        .select("id, company_id, invoice_number, document_type, status, issue_date, due_date, total, subtotal, tax_amount, order_id, notes, external_id, pdf_url, external_xml_url, created_at, updated_at, client_company_name, paid_amount, external_provider")
        .eq("company_id", companyId!)
        .order("issue_date", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    // Con cache PWA persistente i dati vecchi venivano serviti senza refetch:
    // forziamo il refetch a ogni apertura pagina così le fatture importate dal
    // gestionale (o dal cron) compaiono subito.
    refetchOnMount: "always",
  });

  // Check if provider is connected
  const { data: integration } = useQuery({
    queryKey: ["billing_integration", companyId],
    queryFn: async () => {
      // select chirurgico — la UI usa last_sync_at + provider (badge intestazione e
      // invoke billing-import: senza, provider arrivava undefined alla function)
      const { data } = await supabase
        .from("billing_integrations")
        .select("id, last_sync_at, provider")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
    refetchOnMount: "always",
  });

  const markPaidMutation = useMutation({
    mutationFn: async (inv: { id: string; total: number }) => {
      // Salda il RESIDUO (totale − già incassato): evita di sovra-pagare il
      // ledger se esistono acconti. paid_amount e status='paid' sono ricalcolati
      // dai trigger su invoice_payments → NON aggiornarli a mano (doppia scrittura).
      const { data: cur } = await supabase
        .from("invoices").select("paid_amount").eq("id", inv.id).maybeSingle();
      const residuo = Math.round((inv.total - Number(cur?.paid_amount ?? 0)) * 100) / 100;
      if (residuo <= 0) return; // già saldata
      const { error } = await supabase.from("invoice_payments").insert({
        invoice_id: inv.id,
        company_id: companyId!,
        amount: residuo,
        payment_date: new Date().toLocaleDateString("en-CA"),
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
        body: { provider: integration.provider, company_id: companyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const rec = data?.received;
      const recTxt = rec && (rec.imported || rec.updated) ? ` · ${(rec.imported || 0) + (rec.updated || 0)} ricevute` : "";
      toast.success("Sincronizzazione completata", {
        description: `${data?.imported || 0} importate, ${data?.updated || 0} aggiornate${data?.failed ? `, ${data.failed} fallite` : ""}${recTxt}`,
      });
      // Aggiorna SIA la lista fatture SIA l'integrazione (ultimo sync). Senza il
      // secondo invalidate l'header restava su un orario di sync vecchio e, con la
      // cache PWA persistente, la pagina sembrava "non sincronizzata". refetchType
      // 'all' forza il refetch anche se i dati sono ancora nello staleTime.
      await queryClient.invalidateQueries({ queryKey: ["invoices"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["billing_integration"], refetchType: "all" });
    } catch (e) {
      toast.error("Errore sincronizzazione", { description: String(e) });
    } finally {
      setSyncing(false);
    }
  };

  // Anni disponibili (dalle date fattura) per il filtro, decrescenti.
  const years = useMemo(() => {
    const set = new Set<string>();
    for (const i of invoices) if (i.issue_date) set.add(i.issue_date.slice(0, 4));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [invoices]);

  const filtered = useMemo(() => {
    let list = invoices;
    if (yearFilter !== "all") list = list.filter((i) => i.issue_date?.startsWith(yearFilter));
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((i) =>
        (i.invoice_number || "").toLowerCase().includes(s) ||
        (i.client_company_name || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [invoices, yearFilter, statusFilter, search]);

  // Raggruppamento per MESE (decrescente), con totale e conteggio per mese.
  // Le fatture sono già ordinate per data desc dalla query.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const inv of filtered) {
      const key = inv.issue_date ? inv.issue_date.slice(0, 7) : "0000-00"; // YYYY-MM
      const arr = map.get(key);
      if (arr) arr.push(inv); else map.set(key, [inv]);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows]) => {
        const label = key === "0000-00"
          ? "Senza data"
          : format(new Date(`${key}-01T00:00:00`), "MMMM yyyy", { locale: it });
        const total = rows.reduce((s, i) => s + Number(i.total || 0), 0);
        return { key, label: label.charAt(0).toUpperCase() + label.slice(1), rows, total };
      });
  }, [filtered]);

  // KPIs
  const kpis = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    // Le note di credito sono storni, NON crediti da incassare: escluse dai KPI €.
    const billable = invoices.filter((i) => i.document_type !== "credit_note");
    const receivable = billable
      .filter((i) => ["issued", "sent", "delivered", "overdue"].includes(i.status))
      .reduce((s, i) => s + Number(i.total) - Number(i.paid_amount), 0);
    const overdue = billable.filter((i) => {
      if (["paid", "cancelled"].includes(i.status)) return false;
      return i.due_date && new Date(i.due_date) < now;
    });
    const overdueAmount = overdue.reduce((s, i) => s + Number(i.total) - Number(i.paid_amount), 0);
    const issuedThisMonth = invoices.filter(
      (i) => i.issue_date?.startsWith(thisMonth) && i.document_type === "invoice" && i.status !== "cancelled"
    ).length;
    return { receivable, overdueCount: overdue.length, overdueAmount, issuedThisMonth };
  }, [invoices]);

  const fmtEur = (n: number) => formatCurrency(n);

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

      {/* Header — in colonna su mobile: con provider connesso la riga superava i 375px */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

      {/* Top-level view tabs */}
      <Tabs defaultValue="fatture" className="w-full">
        <TabsList>
          <TabsTrigger value="fatture" className="gap-1.5">
            <FileText className="h-4 w-4" /> Fatture
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fatture" className="space-y-6 mt-4">
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
            {years.length > 0 && (
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                aria-label="Filtra per anno"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="all">Tutti gli anni</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}
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
            <>
            {/* Mobile card list — raggruppata per mese */}
            <div className="sm:hidden space-y-4">
              {grouped.map((g) => (
                <div key={g.key} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-muted/60 border-b">
                    <span className="text-sm font-semibold">{g.label}</span>
                    <span className="text-xs text-muted-foreground">{g.rows.length} fatt. · {formatCurrency(g.total)}</span>
                  </div>
                  <div className="divide-y">
                    {g.rows.map((inv) => {
                      const cfg = STATUS_CONFIG[effectiveStatus(inv)] || STATUS_CONFIG.draft;
                      return (
                        <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted cursor-pointer" onClick={() => navigate(`/azienda/fatturazione/${inv.id}`)}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs">{inv.invoice_number || "—"}</span>
                              <Badge variant="secondary" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                              {inv.external_provider && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                  <Cloud className="h-2.5 w-2.5" />{PROVIDER_LABELS[inv.external_provider] || inv.external_provider}
                                </span>
                              )}
                            </div>
                            <p className="font-medium text-sm mt-0.5 truncate">{inv.client_company_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {inv.issue_date ? format(new Date(inv.issue_date), "dd/MM/yy", { locale: it }) : "—"}
                              {inv.due_date ? ` · scad. ${format(new Date(inv.due_date), "dd/MM/yy", { locale: it })}` : ""}
                            </p>
                          </div>
                          <div className="text-right shrink-0 text-sm">
                            <ImportoInfo inv={inv} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table — intestazioni di mese con subtotale */}
            <div className="hidden sm:block rounded-lg border overflow-x-auto">
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
                  {grouped.map((g) => (
                    <Fragment key={g.key}>
                      <tr className="bg-muted/40 border-b">
                        <td colSpan={4} className="px-3 py-2 font-semibold text-sm">{g.label}</td>
                        <td className="px-3 py-2 text-right font-semibold text-sm">{fmtEur(g.total)}</td>
                        <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground">{g.rows.length} fatture</td>
                      </tr>
                      {g.rows.map((inv) => {
                        const cfg = STATUS_CONFIG[effectiveStatus(inv)] || STATUS_CONFIG.draft;
                        return (
                          <tr key={inv.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/azienda/fatturazione/${inv.id}`)}>
                            <td className="p-3 font-mono text-xs">{inv.invoice_number || "—"}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                                  {clienteInitials(inv.client_company_name)}
                                </span>
                                <span className="font-medium">{inv.client_company_name || "—"}</span>
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground">{inv.issue_date ? format(new Date(inv.issue_date), "dd/MM/yy", { locale: it }) : "—"}</td>
                            <td className="p-3 text-muted-foreground">{inv.due_date ? format(new Date(inv.due_date), "dd/MM/yy", { locale: it }) : "—"}</td>
                            <td className="p-3 text-right"><ImportoInfo inv={inv} /></td>
                            <td className="p-3">
                              <Badge variant="secondary" className={cfg.color}>{cfg.emoji} {cfg.label}</Badge>
                            </td>
                            <td className="p-3">
                              {inv.external_provider ? (
                                <Badge variant="outline" className="text-xs gap-1 font-normal">
                                  <Cloud className="h-3 w-3 text-muted-foreground" />
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
                                  {inv.pdf_url && (
                                    <DropdownMenuItem onClick={() => window.open(inv.pdf_url!, "_blank", "noopener")}>
                                      <Download className="h-4 w-4 mr-2" /> Scarica PDF
                                    </DropdownMenuItem>
                                  )}
                                  {inv.external_xml_url && (
                                    <DropdownMenuItem onClick={() => window.open(inv.external_xml_url!, "_blank", "noopener")}>
                                      <FileCode className="h-4 w-4 mr-2" /> XML (SDI)
                                    </DropdownMenuItem>
                                  )}
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
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="report" className="mt-4">
          <BillingReports embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
