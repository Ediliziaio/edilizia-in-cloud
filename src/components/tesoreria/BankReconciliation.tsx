import { useEffect, useState, useMemo, useCallback } from "react";
import { formatDateIt } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Search, Zap, Link2, Unlink, CheckCircle2, ArrowRight, Loader2, FileText, Banknote, Download, FileSpreadsheet, Siren, ShieldCheck, X } from "lucide-react";
import { logger } from "@/utils/logger";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  fmtEur,
  computeMatchScore,
  computePaymentReversal,
  detectReconAnomalies,
} from "@/lib/finance/reconciliationAnalysis";
import type { MatchSuggestion, ReconSeverity } from "@/lib/finance/reconciliationAnalysis";
import { escapeCSV, neutralizeXlsxCell } from "@/lib/csvExport";

interface Props {
  companyId: string;
  refreshKey?: number;
}

const RECON_SEVERITY_CLS: Record<ReconSeverity, string> = {
  critical: "border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-200",
  warning: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
  info: "border-sky-300 bg-sky-50 text-sky-900 dark:bg-sky-950/30 dark:text-sky-200",
};

export default function BankReconciliation({ companyId, refreshKey = 0 }: Props) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [reconciliations, setReconciliations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTx, setSearchTx] = useState("");
  const [searchInv, setSearchInv] = useState("");
  const [activeInsightId, setActiveInsightId] = useState<string | null>(null);

  // Match dialog
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [matchNote, setMatchNote] = useState("");
  const [matching, setMatching] = useState(false);
  const [autoMatching, setAutoMatching] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  // Unlink dialog
  const [unlinkTarget, setUnlinkTarget] = useState<any>(null);
  const [unlinking, setUnlinking] = useState(false);

  const loadData = useCallback(async () => {
    if (!companyId) {
      setTransactions([]);
      setInvoices([]);
      setReconciliations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [txRes, invRes, recRes] = await Promise.all([
        supabase
          .from("bank_transactions")
          .select("*, bank_accounts(display_name, account_name)")
          .eq("company_id", companyId)
          .is("linked_invoice_id", null)
          .eq("transaction_type", "credit")
          .order("booking_date", { ascending: false })
          .limit(200),
        supabase
          .from("invoices")
          .select("id, invoice_number, client_company_name, total, paid_amount, status, due_date, bank_iban, issue_date, external_provider, external_id")
          .eq("company_id", companyId)
          .in("status", ["issued", "sent", "delivered", "overdue"])
          .order("due_date", { ascending: true })
          .limit(200),
        supabase
          .from("bank_reconciliations")
          .select("*, bank_transactions:transaction_id(id, booking_date, amount, description, creditor_name, debtor_name), invoices:invoice_id(id, invoice_number, client_company_name, total)")
          .eq("company_id", companyId)
          .is("unmatched_at", null)
          .order("matched_at", { ascending: false })
          .limit(100),
      ]);
      if (txRes.error) throw txRes.error;
      if (invRes.error) throw invRes.error;
      if (recRes.error) throw recRes.error;
      setTransactions(txRes.data || []);
      setInvoices(invRes.data || []);
      setReconciliations(recRes.data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[BankReconciliation] Errore caricamento dati:', msg);
      toast.error('Errore nel caricamento dei dati bancari. Riprova.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadData(); }, [loadData, refreshKey]);

  // KPIs
  const kpis = useMemo(() => {
    const unreconciledAmount = transactions.reduce((s, t) => s + Math.abs(t.amount), 0);
    const unpaidAmount = invoices.reduce((s, i) => s + (Number(i.total || 0) - Number(i.paid_amount || 0)), 0);
    const reconciledAmount = reconciliations.reduce((s, r) => s + Number(r.matched_amount || 0), 0);
    return {
      unreconciledCount: transactions.length,
      unreconciledAmount,
      unpaidCount: invoices.length,
      unpaidAmount,
      reconciledCount: reconciliations.length,
      reconciledAmount,
    };
  }, [transactions, invoices, reconciliations]);

  // Anomalie e segnali (sola lettura) sui dati bancari correnti
  const anomalies = useMemo(
    () => detectReconAnomalies(transactions, invoices),
    [transactions, invoices],
  );

  // Anomalia selezionata come filtro — derivata dai dati correnti, così si
  // azzera da sola quando gli elementi coinvolti spariscono dopo una riconciliazione.
  const activeInsight = useMemo(
    () => anomalies.find((a) => a.id === activeInsightId) ?? null,
    [anomalies, activeInsightId],
  );

  // Open match dialog
  function openMatch(tx: any) {
    setSelectedTx(tx);
    setMatchNote("");
    const matches = invoices
      .map((inv) => computeMatchScore(tx, inv))
      .filter(Boolean) as MatchSuggestion[];
    matches.sort((a, b) => b.score - a.score);
    setSuggestions(matches);
  }

  // Fix 5: Sequential reconciliation — execute operations in order, stop on failure
  async function confirmMatch(tx: any, inv: any, matchType: "manual" | "auto") {
    if (matching) return;
    setMatching(true);
    try {
      const matchedAmount = Math.abs(tx.amount);
      const fullyPaid = (Number(inv.paid_amount || 0) + matchedAmount) >= Number(inv.total || 0);

      // Step 1: link transaction
      const linkRes = await supabase.from("bank_transactions").update({ linked_invoice_id: inv.id }).eq("id", tx.id).eq("company_id", companyId);
      if (linkRes.error) throw linkRes.error;

      // Step 2: create reconciliation record (recupera l'id per legare il pagamento)
      const recRes = await supabase.from("bank_reconciliations").insert({
        company_id: companyId,
        transaction_id: tx.id,
        invoice_id: inv.id,
        matched_amount: matchedAmount,
        match_type: matchType,
        matched_by: user?.id,
        notes: matchNote || null,
      } as any).select("id").single();
      if (recRes.error || !recRes.data) {
        await supabase.from("bank_transactions").update({ linked_invoice_id: null }).eq("id", tx.id).eq("company_id", companyId);
        throw recRes.error || new Error("reconciliation insert nullo");
      }
      const recId = recRes.data.id;

      // Step 3: registra il pagamento nel LEDGER (come l'auto-match) → il trigger
      // ricalcola paid_amount e status. Niente più scrittura diretta di paid_amount
      // (che bypassava lo storico e poteva essere sovrascritta dal trigger).
      const payRes = await supabase.from("invoice_payments").insert({
        invoice_id: inv.id,
        company_id: companyId,
        amount: matchedAmount,
        payment_date: new Date().toLocaleDateString("en-CA"),
        payment_method: "bonifico",
        reference: `recon:${recId}`,
        notes: `Riconciliazione bancaria (${matchType})`,
      } as any);
      if (payRes.error) {
        await supabase.from("bank_reconciliations").delete().eq("id", recId);
        await supabase.from("bank_transactions").update({ linked_invoice_id: null }).eq("id", tx.id).eq("company_id", companyId);
        throw payRes.error;
      }

      // Step 4: write-back verso il gestionale esterno (best-effort) se saldata.
      let wb: "ok" | "scope" | "error" | null = null;
      if (inv.external_provider === "fattureincloud" && fullyPaid) {
        try {
          const { data: pr, error: pErr } = await supabase.functions.invoke("billing-payment-push", { body: { invoice_id: inv.id } });
          wb = pErr ? "error" : pr?.error === "scope" ? "scope" : pr?.ok ? "ok" : "error";
        } catch { wb = "error"; }
      }

      toast.success(
        `Riconciliata con fattura ${inv.invoice_number}` +
        (wb === "ok" ? " · aggiornata su Fatture in Cloud" : wb === "scope" ? " · FIC: manca il permesso di scrittura" : "")
      );
      setSelectedTx(null);
      await loadData();
    } catch (e: any) {
      console.error('[BankReconciliation] Errore durante la riconciliazione:', e.message);
      toast.error('Errore durante la riconciliazione. Riprova o contatta il supporto.');
    } finally {
      setMatching(false);
    }
  }

  // Auto-match server-side (edge bank-auto-reconcile): incassi→fatture e
  // uscite→scadenze, con scoring importo/IBAN/nome. Auto solo score≥80; i match
  // a media confidenza diventano proposte AI da confermare in chat.
  async function runAutoMatch() {
    if (autoMatching) return;
    setAutoMatching(true);
    try {
      const { data, error } = await supabase.functions.invoke("bank-auto-reconcile", { body: { company_id: companyId } });
      if (error || data?.success === false) throw new Error(data?.error || error?.message || "Errore");
      const inc = data?.auto_matched ?? 0;
      const cost = data?.costs_matched ?? 0;
      const prop = data?.proposals_created ?? 0;
      toast.success(`Riconciliati ${inc} incassi e ${cost} pagamenti${prop ? ` · ${prop} da confermare in chat` : ""}`);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore auto-match");
    } finally {
      setAutoMatching(false);
    }
  }

  // Fix 10: Sequential unlink with rollback
  async function handleUnlink() {
    if (!unlinkTarget) return;
    setUnlinking(true);
    try {
      const rec = unlinkTarget;
      const txId = typeof rec.bank_transactions === "object" ? rec.bank_transactions?.id : rec.transaction_id;
      const invId = typeof rec.invoices === "object" ? rec.invoices?.id : rec.invoice_id;

      // Get current invoice to recompute paid_amount
      const { data: inv, error: invFetchErr } = await supabase.from("invoices").select("paid_amount, total, status").eq("id", invId).single();
      if (invFetchErr) {
        console.error('[BankReconciliation] Errore recupero fattura per scollegamento:', invFetchErr.message);
        toast.error('Impossibile recuperare i dati della fattura. Riprova.');
        setUnlinking(false);
        return;
      }
      const { newPaidAmount: newPaid, newStatus: reversedStatus } = computePaymentReversal(
        inv ?? {},
        rec.matched_amount,
      );

      // Step 1: unlink transaction
      const unlinkRes = await supabase.from("bank_transactions").update({ linked_invoice_id: null }).eq("id", txId);
      if (unlinkRes.error) throw unlinkRes.error;

      // Step 2: mark reconciliation as unmatched
      const recRes = await supabase.from("bank_reconciliations").update({ unmatched_at: new Date().toISOString() }).eq("id", rec.id);
      if (recRes.error) {
        await supabase.from("bank_transactions").update({ linked_invoice_id: invId }).eq("id", txId);
        throw recRes.error;
      }

      // Step 3: storna il pagamento dal LEDGER → il trigger ricalcola paid_amount + status.
      const delRes = await supabase
        .from("invoice_payments").delete()
        .eq("invoice_id", invId).eq("reference", `recon:${rec.id}`).select("id");
      if (delRes.error) {
        await supabase.from("bank_transactions").update({ linked_invoice_id: invId }).eq("id", txId);
        await supabase.from("bank_reconciliations").update({ unmatched_at: null }).eq("id", rec.id);
        throw delRes.error;
      }
      // Legacy: riconciliazioni create prima del ledger (scrittura diretta di paid_amount)
      // → nessuna riga ledger da stornare, applico lo storno diretto come prima.
      if (!delRes.data || delRes.data.length === 0) {
        const invRes = await supabase.from("invoices").update({ paid_amount: newPaid, status: reversedStatus }).eq("id", invId);
        if (invRes.error) {
          await supabase.from("bank_transactions").update({ linked_invoice_id: invId }).eq("id", txId);
          await supabase.from("bank_reconciliations").update({ unmatched_at: null }).eq("id", rec.id);
          throw invRes.error;
        }
      }

      toast.success("Riconciliazione rimossa");
      setUnlinkTarget(null);
      loadData();
    } catch (e: any) {
      console.error('[BankReconciliation] Errore durante lo scollegamento della riconciliazione:', e.message);
      toast.error('Errore durante lo scollegamento. Le modifiche sono state annullate. Riprova.');
    }
    setUnlinking(false);
  }

  // Filtered lists
  const filteredTx = useMemo(() => {
    let list = transactions;
    if (activeInsight?.target === "tx") {
      const ids = new Set(activeInsight.ids);
      list = list.filter((t) => ids.has(t.id));
    }
    if (searchTx) {
      const q = searchTx.toLowerCase();
      list = list.filter((t) =>
        (t.description || "").toLowerCase().includes(q) ||
        (t.creditor_name || "").toLowerCase().includes(q) ||
        (t.debtor_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, searchTx, activeInsight]);

  const filteredInv = useMemo(() => {
    let list = invoices;
    if (activeInsight?.target === "inv") {
      const ids = new Set(activeInsight.ids);
      list = list.filter((i) => ids.has(i.id));
    }
    if (searchInv) {
      const q = searchInv.toLowerCase();
      list = list.filter((i) =>
        (i.invoice_number || "").toLowerCase().includes(q) ||
        (i.client_company_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [invoices, searchInv, activeInsight]);

  // #2 — miglior candidato per ogni transazione, per il suggerimento inline 1-click.
  const bestMatchByTx = useMemo(() => {
    const map = new Map<string, MatchSuggestion>();
    for (const tx of filteredTx) {
      let best: MatchSuggestion | null = null;
      for (const inv of invoices) {
        const m = computeMatchScore(tx, inv);
        if (m && (!best || m.score > best.score)) best = m;
      }
      if (best) map.set(tx.id, best);
    }
    return map;
  }, [filteredTx, invoices]);

  // Export reconciliations
  async function exportReconciliations(fmt: "csv" | "xlsx") {
    setExporting(true);
    try {
      const { data, error } = await supabase
        .from("bank_reconciliations")
        .select("*, bank_transactions:transaction_id(booking_date, amount, description, creditor_name, debtor_name), invoices:invoice_id(invoice_number, client_company_name, total)")
        .eq("company_id", companyId)
        .order("matched_at", { ascending: false })
        .limit(10000);
      if (error) throw error;

      const rows = (data || []).map((rec: any) => ({
        "Data riconciliazione": rec.matched_at ? format(new Date(rec.matched_at), "dd/MM/yyyy HH:mm") : "",
        "Tipo": rec.match_type === "auto" ? "Auto" : "Manuale",
        "Descrizione transazione": rec.bank_transactions?.description || "",
        "Data transazione": rec.bank_transactions?.booking_date || "",
        "Importo riconciliato": Number(rec.matched_amount || 0),
        "N° Fattura": rec.invoices?.invoice_number || "",
        "Cliente": rec.invoices?.client_company_name || "",
        "Totale fattura": Number(rec.invoices?.total || 0),
        "Note": rec.notes || "",
        "Stato": rec.unmatched_at ? `Scollegata (${format(new Date(rec.unmatched_at), "dd/MM/yyyy")})` : "Attiva",
      }));

      if (rows.length === 0) {
        toast.info("Nessuna riconciliazione da esportare");
        return;
      }

      const colWidths = [22, 10, 35, 14, 18, 16, 25, 14, 25, 16];

      if (fmt === "xlsx") {
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Riconciliazioni");
        if (rows.length > 0) {
          const safeRows = rows.map((row) => {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(row)) out[k] = neutralizeXlsxCell(v);
            return out;
          });
          ws.columns = Object.keys(rows[0]).map((key, i) => ({ header: key, key, width: colWidths[i] ?? 14 }));
          ws.addRows(safeRows);
        }
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `riconciliazioni-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const headers = Object.keys(rows[0] ?? {});
        const csvRows = [
          headers.map((h) => escapeCSV(h)).join(";"),
          ...rows.map((row) =>
            headers.map((h) => escapeCSV(row[h as keyof typeof row])).join(";"),
          ),
        ];
        const csv = csvRows.join("\n");
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `riconciliazioni-${format(new Date(), "yyyy-MM-dd")}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      toast.success(`Report esportato in ${fmt.toUpperCase()}`);
    } catch (e: any) {
      toast.error("Errore esportazione: " + e.message);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Banknote className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Da riconciliare</p>
                <p className="text-xl font-bold">{kpis.unreconciledCount}</p>
                <p className="text-xs text-muted-foreground">{fmtEur(kpis.unreconciledAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fatture non pagate</p>
                <p className="text-xl font-bold">{kpis.unpaidCount}</p>
                <p className="text-xs text-muted-foreground">{fmtEur(kpis.unpaidAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Riconciliate</p>
                <p className="text-xl font-bold">{kpis.reconciledCount}</p>
                <p className="text-xs text-muted-foreground">{fmtEur(kpis.reconciledAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Anomalie e segnali (sola lettura) */}
      {anomalies.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Siren className="h-4 w-4 text-amber-600" /> Anomalie e segnali
              <Badge variant="outline" className="ml-1">{anomalies.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {anomalies.map((a) => {
              const Icon = a.icon;
              const active = activeInsightId === a.id;
              return (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => setActiveInsightId((cur) => (cur === a.id ? null : a.id))}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full gap-2 rounded-lg border p-3 text-left transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    RECON_SEVERITY_CLS[a.severity],
                    active && "ring-2 ring-current",
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{a.title}</div>
                    <div className="mt-0.5 text-xs opacity-80">{a.detail}</div>
                    <div className="mt-1 text-[10px] font-medium uppercase tracking-wide opacity-70">
                      {active
                        ? "Filtro attivo · clicca per azzerare"
                        : a.target === "tx"
                          ? "Clicca per filtrare le transazioni"
                          : "Clicca per filtrare le fatture"}
                    </div>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      ) : (transactions.length > 0 || invoices.length > 0) ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-sm text-emerald-800 dark:text-emerald-200">
          <ShieldCheck className="h-4 w-4 shrink-0" /> Nessuna anomalia rilevata nei dati bancari correnti.
        </div>
      ) : null}

      {/* Filtro anomalia attivo */}
      {activeInsight && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Filtro anomalia attivo:</span>
          <Badge variant="secondary" className="gap-1.5">
            {activeInsight.title}
            <button
              type="button"
              onClick={() => setActiveInsightId(null)}
              className="rounded-sm hover:bg-foreground/10"
              aria-label="Azzera filtro anomalia"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
          <span className="text-muted-foreground">
            {activeInsight.target === "tx"
              ? `${filteredTx.length} transazioni mostrate`
              : `${filteredInv.length} fatture mostrate`}
          </span>
        </div>
      )}

      {/* Auto-match button */}
      <div className="flex justify-end">
        <Button onClick={runAutoMatch} disabled={autoMatching || transactions.length === 0} size="sm">
          {autoMatching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
          Auto-match
        </Button>
      </div>

      {/* Split view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Unreconciled Transactions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="h-4 w-4" /> Transazioni da riconciliare
            </CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca transazione..."
                value={searchTx}
                onChange={(e) => setSearchTx(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-y-auto space-y-2">
            {filteredTx.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {transactions.length === 0 ? "Nessuna transazione da riconciliare" : "Nessun risultato con i filtri attivi"}
              </p>
            ) : (
              filteredTx.map((tx) => (
                <div
                  key={tx.id}
                  onClick={() => openMatch(tx)}
                  className="border rounded-lg p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{tx.description || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {tx.creditor_name || tx.debtor_name || "—"} · {formatDateIt(tx.booking_date)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tx.bank_accounts?.display_name || tx.bank_accounts?.account_name || ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-green-600 whitespace-nowrap ml-2">
                      +{fmtEur(Math.abs(tx.amount))}
                    </p>
                  </div>
                  {(() => {
                    const best = bestMatchByTx.get(tx.id);
                    if (!best || best.score < 60) return null;
                    const inv = best.invoice;
                    const label = inv.invoice_number ? `Fatt. ${inv.invoice_number}` : (inv.client_company_name || "fattura");
                    return (
                      <div
                        className="mt-2 flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-2 py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-xs text-muted-foreground truncate">
                          → <span className="font-medium text-foreground">{label}</span> · {best.score}%
                          <span className="hidden sm:inline"> · {best.reasons[0]}</span>
                        </span>
                        <Button
                          size="sm"
                          className="h-6 text-xs px-2 shrink-0"
                          disabled={matching}
                          onClick={(e) => { e.stopPropagation(); confirmMatch(tx, inv, "manual"); }}
                        >
                          Collega
                        </Button>
                      </div>
                    );
                  })()}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Right: Unpaid Invoices */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Fatture da incassare
            </CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca fattura..."
                value={searchInv}
                onChange={(e) => setSearchInv(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-y-auto space-y-2">
            {filteredInv.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {invoices.length === 0 ? "Nessuna fattura non pagata" : "Nessun risultato con i filtri attivi"}
              </p>
            ) : (
              filteredInv.map((inv) => {
                const remaining = Number(inv.total || 0) - Number(inv.paid_amount || 0);
                return (
                  <div key={inv.id} className="border rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium flex items-center gap-1.5">
                          {inv.invoice_number || "—"}
                          <Badge variant="outline" className="text-[9px] shrink-0 font-normal text-muted-foreground" title={inv.external_provider ? "Importata da gestionale esterno" : "Fattura nativa SDI"}>
                            {inv.external_provider ? "FIC" : "SDI"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{inv.client_company_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          Scad. {formatDateIt(inv.due_date)}
                        </p>
                      </div>
                      <div className="text-right ml-2">
                        <p className="text-sm font-semibold">{fmtEur(remaining)}</p>
                        <p className="text-[10px] text-muted-foreground">di {fmtEur(Number(inv.total || 0))}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent reconciliations */}
      {reconciliations.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Riconciliazioni recenti
            </CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2" disabled={exporting}>
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  <span className="hidden sm:inline">Esporta</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportReconciliations("csv")}>
                  <FileText className="h-4 w-4 mr-2" /> Esporta CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportReconciliations("xlsx")}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Esporta Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {reconciliations.map((rec) => {
                const tx = rec.bank_transactions as any;
                const inv = rec.invoices as any;
                return (
                  <div key={rec.id} className="flex items-center gap-3 border rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium truncate">{tx?.description || "Transazione"}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium">{inv?.invoice_number || "Fattura"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fmtEur(Number(rec.matched_amount))} ·{" "}
                        <Badge variant="outline" className="text-[10px] px-1">
                          {rec.match_type === "auto" ? "Auto" : "Manuale"}
                        </Badge>
                        {rec.notes && ` · ${rec.notes}`}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setUnlinkTarget(rec)}>
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Match Dialog */}
      <Dialog open={!!selectedTx} onOpenChange={() => setSelectedTx(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Riconcilia transazione</DialogTitle>
            <DialogDescription>
              Seleziona la fattura da collegare a questa transazione.
            </DialogDescription>
          </DialogHeader>
          {selectedTx && (
            <div className="space-y-4">
              <div className="bg-accent/30 rounded-lg p-3 text-sm">
                <p className="font-medium">{selectedTx.description || "—"}</p>
                <p className="text-muted-foreground text-xs">
                  {selectedTx.creditor_name || selectedTx.debtor_name || ""} · {formatDateIt(selectedTx.booking_date)}
                </p>
                <p className="font-bold text-green-600 mt-1">+{fmtEur(Math.abs(selectedTx.amount))}</p>
              </div>

              {suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nessun suggerimento trovato. Seleziona manualmente dalla lista.</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {suggestions.map((s) => (
                    <div
                      key={s.invoice.id}
                      className={`border rounded-lg p-3 transition-colors ${matching ? "cursor-not-allowed opacity-60" : "hover:bg-accent/50 cursor-pointer"}`}
                      onClick={() => confirmMatch(selectedTx, s.invoice, "manual")}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-sm font-medium flex items-center gap-1.5">
                            {s.invoice.invoice_number} — {s.invoice.client_company_name}
                            <Badge variant="outline" className="text-[9px] shrink-0 font-normal text-muted-foreground">
                              {s.invoice.external_provider ? "FIC" : "SDI"}
                            </Badge>
                          </div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {s.reasons.map((r, i) => (
                              <Badge key={i} variant="outline" className="text-[10px]">{r}</Badge>
                            ))}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{fmtEur(Number(s.invoice.total) - Number(s.invoice.paid_amount || 0))}</p>
                          <Badge className={`text-[10px] ${s.score >= 80 ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                            {s.score}%
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Manual pick from all invoices */}
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Tutte le fatture non pagate ({invoices.length})</summary>
                <div className="mt-2 space-y-1 max-h-[200px] overflow-y-auto">
                  {invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className={`border rounded p-2 text-xs ${matching ? "cursor-not-allowed opacity-60" : "hover:bg-accent/50 cursor-pointer"}`}
                      onClick={() => confirmMatch(selectedTx, inv, "manual")}
                    >
                      <span className="font-medium">{inv.invoice_number}</span> — {inv.client_company_name} — {fmtEur(Number(inv.total) - Number(inv.paid_amount || 0))}
                    </div>
                  ))}
                </div>
              </details>

              <div>
                <Label className="text-xs">Nota (opzionale)</Label>
                <Textarea value={matchNote} onChange={(e) => setMatchNote(e.target.value)} rows={2} className="text-sm" />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Unlink confirmation */}
      <Dialog open={!!unlinkTarget} onOpenChange={() => setUnlinkTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rimuovi riconciliazione</DialogTitle>
            <DialogDescription>Vuoi scollegare questa transazione dalla fattura?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlinkTarget(null)}>Annulla</Button>
            <Button variant="destructive" onClick={handleUnlink} disabled={unlinking}>
              {unlinking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Unlink className="h-4 w-4 mr-2" />}
              Scollega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
