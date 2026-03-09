import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Download, Search, X, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const formatEur = (val: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(val);

const CATEGORIES = [
  { value: "Stipendi", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
  { value: "Fornitori", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  { value: "Affitti", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  { value: "Tasse & Tributi", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  { value: "Bancario", color: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200" },
  { value: "Clienti", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { value: "Utenze", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  { value: "Servizi", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { value: "Assicurazioni", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { value: "Ristorazione", color: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200" },
  { value: "Trasferte", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200" },
  { value: "Entrata", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  { value: "Altro", color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
  { value: "Non categorizzata", color: "border border-border text-muted-foreground" },
];

const PAGE_SIZE = 50;

interface Props {
  companyId: string;
}

export default function TransactionsFeed({ companyId }: Props) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [invoiceMap, setInvoiceMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Detail sheet
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [editCategory, setEditCategory] = useState("");
  const [editNote, setEditNote] = useState("");

  useEffect(() => {
    if (companyId) {
      loadAccounts();
      loadTransactions();
    }
  }, [companyId, page, search, accountFilter, typeFilter, categoryFilter, dateFrom, dateTo]);

  async function loadAccounts() {
    const { data } = await supabase
      .from("bank_accounts")
      .select("id, display_name, account_name, iban")
      .eq("company_id", companyId)
      .eq("is_active", true);
    setAccounts(data || []);
  }

  async function loadTransactions() {
    setLoading(true);
    let query = supabase
      .from("bank_transactions")
      .select("*, bank_accounts(display_name, account_name)", { count: "exact" })
      .eq("company_id", companyId)
      .order("booking_date", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (search) {
      query = query.or(`description.ilike.%${search}%,creditor_name.ilike.%${search}%,debtor_name.ilike.%${search}%`);
    }
    if (accountFilter !== "all") query = query.eq("account_id", accountFilter);
    if (typeFilter !== "all") query = query.eq("transaction_type", typeFilter);
    if (categoryFilter !== "all") query = query.eq("category", categoryFilter);
    if (dateFrom) query = query.gte("booking_date", dateFrom);
    if (dateTo) query = query.lte("booking_date", dateTo);

    const { data, count } = await query;
    setTransactions(data || []);
    setTotalCount(count || 0);

    // Load linked invoices
    const linkedIds = (data || []).map((t: any) => t.linked_invoice_id).filter(Boolean);
    if (linkedIds.length > 0) {
      const { data: invData } = await supabase
        .from("invoices")
        .select("id, invoice_number, client_company_name")
        .in("id", linkedIds);
      const map: Record<string, any> = {};
      (invData || []).forEach((inv: any) => { map[inv.id] = inv; });
      setInvoiceMap(map);
    } else {
      setInvoiceMap({});
    }

    setLoading(false);
  }

  function resetFilters() {
    setSearch(""); setAccountFilter("all"); setTypeFilter("all");
    setCategoryFilter("all"); setDateFrom(""); setDateTo("");
    setPage(0);
  }

  async function saveDetail() {
    if (!selectedTx) return;
    const { error } = await supabase
      .from("bank_transactions")
      .update({ category: editCategory, note: editNote })
      .eq("id", selectedTx.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Aggiornato");
      setTransactions((prev) =>
        prev.map((t) => (t.id === selectedTx.id ? { ...t, category: editCategory, note: editNote } : t))
      );
      setSelectedTx(null);
    }
  }

  function exportCSV() {
    const headers = ["Data", "Descrizione", "Conto", "Categoria", "Tipo", "Importo", "Valuta", "Note"];
    const rows = transactions.map((tx) => [
      tx.booking_date || "",
      `"${(tx.description || "").replace(/"/g, '""')}"`,
      tx.bank_accounts?.display_name || tx.bank_accounts?.account_name || "",
      tx.category || "",
      tx.transaction_type === "credit" ? "Entrata" : "Uscita",
      tx.amount,
      tx.currency,
      `"${(tx.note || "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transazioni_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Summary
  const summary = useMemo(() => {
    const income = transactions.filter((t) => t.transaction_type === "credit").reduce((s, t) => s + t.amount, 0);
    const expenses = transactions.filter((t) => t.transaction_type === "debit").reduce((s, t) => s + Math.abs(t.amount), 0);
    return { count: totalCount, income, expenses, net: income - expenses };
  }, [transactions, totalCount]);

  const getCategoryBadge = (cat: string | null) => {
    const found = CATEGORIES.find((c) => c.value === cat);
    return found ? found.color : "border border-border text-muted-foreground";
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca descrizione, nome..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <Select value={accountFilter} onValueChange={(v) => { setAccountFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tutti i conti" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i conti</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.display_name || a.account_name || a.iban}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="credit">Entrate</SelectItem>
                <SelectItem value="debit">Uscite</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.value}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="w-[150px]" />
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="w-[150px]" />
            <Button variant="ghost" size="sm" onClick={resetFilters}><X className="h-4 w-4 mr-1" /> Reset</Button>
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> CSV</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : transactions.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Nessuna transazione trovata</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Data</th>
                  <th className="text-left p-3 font-medium">Descrizione</th>
                  <th className="text-left p-3 font-medium">Conto</th>
                  <th className="text-left p-3 font-medium">Categoria</th>
                  <th className="text-left p-3 font-medium">Tipo</th>
                  <th className="text-right p-3 font-medium">Importo</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-t hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => {
                      setSelectedTx(tx);
                      setEditCategory(tx.category || "Non categorizzata");
                      setEditNote(tx.note || "");
                    }}
                  >
                    <td className="p-3 whitespace-nowrap">{tx.booking_date || "—"}</td>
                    <td className="p-3">
                      <p className="truncate max-w-[300px]">{tx.description || "—"}</p>
                      {(tx.creditor_name || tx.debtor_name) && (
                        <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {tx.creditor_name || tx.debtor_name}
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {tx.bank_accounts?.display_name || tx.bank_accounts?.account_name || "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <Badge className={getCategoryBadge(tx.category)} variant="secondary">
                          {tx.category || "—"}
                        </Badge>
                        {tx.linked_invoice_id && invoiceMap[tx.linked_invoice_id] && (
                          <Badge variant="outline" className="text-[10px] gap-1 w-fit">
                            <Link2 className="h-3 w-3" />
                            {invoiceMap[tx.linked_invoice_id].invoice_number}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      {tx.transaction_type === "credit" ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" variant="secondary">
                          <TrendingUp className="h-3 w-3 mr-1" /> Entrata
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" variant="secondary">
                          <TrendingDown className="h-3 w-3 mr-1" /> Uscita
                        </Badge>
                      )}
                    </td>
                    <td className={`p-3 text-right font-semibold ${tx.transaction_type === "credit" ? "text-green-600" : "text-red-600"}`}>
                      {tx.transaction_type === "credit" ? "+" : ""}{formatEur(tx.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {page + 1} di {totalPages} · {totalCount} transazioni
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="text-sm text-muted-foreground text-center py-2">
        Risultati: {summary.count} transazioni · Entrate: {formatEur(summary.income)} · Uscite: {formatEur(summary.expenses)} · Netto: {formatEur(summary.net)}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedTx} onOpenChange={() => setSelectedTx(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Dettaglio Transazione</SheetTitle>
          </SheetHeader>
          {selectedTx && (
            <div className="space-y-4 mt-6">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><Label className="text-muted-foreground">Data Booking</Label><p>{selectedTx.booking_date || "—"}</p></div>
                <div><Label className="text-muted-foreground">Data Valuta</Label><p>{selectedTx.value_date || "—"}</p></div>
                <div><Label className="text-muted-foreground">Importo</Label>
                  <p className={`font-bold ${selectedTx.transaction_type === "credit" ? "text-green-600" : "text-red-600"}`}>
                    {formatEur(selectedTx.amount)}
                  </p>
                </div>
                <div><Label className="text-muted-foreground">Stato</Label><p>{selectedTx.status}</p></div>
                <div className="col-span-2"><Label className="text-muted-foreground">Descrizione</Label><p>{selectedTx.description || "—"}</p></div>
                <div><Label className="text-muted-foreground">Creditore</Label><p>{selectedTx.creditor_name || "—"}</p></div>
                <div><Label className="text-muted-foreground">Debitore</Label><p>{selectedTx.debtor_name || "—"}</p></div>
                <div><Label className="text-muted-foreground">IBAN Creditore</Label><p className="text-xs font-mono">{selectedTx.creditor_iban || "—"}</p></div>
                <div><Label className="text-muted-foreground">IBAN Debitore</Label><p className="text-xs font-mono">{selectedTx.debtor_iban || "—"}</p></div>
                <div className="col-span-2"><Label className="text-muted-foreground">Riferimento</Label><p>{selectedTx.reference || "—"}</p></div>
              </div>

              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nota</Label>
                <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={3} />
              </div>

              <Button onClick={saveDetail} className="w-full">Salva Modifiche</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
