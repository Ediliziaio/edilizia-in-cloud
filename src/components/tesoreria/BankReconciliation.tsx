import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Search, Zap, Link2, Unlink, CheckCircle2, ArrowRight, Loader2, FileText, Banknote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const fmtEur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

interface Props {
  companyId: string;
}

interface MatchSuggestion {
  invoice: any;
  score: number;
  reasons: string[];
}

// Fuzzy name matching
function fuzzyMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = normalize(a);
  const nb = normalize(b);
  return na.includes(nb) || nb.includes(na);
}

function computeMatchScore(tx: any, inv: any): MatchSuggestion | null {
  let score = 0;
  const reasons: string[] = [];
  const txAmount = Math.abs(tx.amount);
  const invTotal = Number(inv.total || 0) - Number(inv.paid_amount || 0);

  // Amount match (within 1% or €5)
  const diff = Math.abs(txAmount - invTotal);
  const tolerance = Math.max(invTotal * 0.01, 5);
  if (diff === 0) {
    score += 50;
    reasons.push("Importo esatto");
  } else if (diff <= tolerance) {
    score += 35;
    reasons.push(`Importo simile (diff. ${fmtEur(diff)})`);
  }

  // IBAN match
  if (tx.creditor_iban && inv.bank_iban) {
    const txIban = tx.creditor_iban.replace(/\s/g, "").toUpperCase();
    const invIban = inv.bank_iban.replace(/\s/g, "").toUpperCase();
    if (txIban === invIban) {
      score += 30;
      reasons.push("IBAN corrispondente");
    }
  }
  if (tx.debtor_iban && inv.bank_iban) {
    const txIban = tx.debtor_iban.replace(/\s/g, "").toUpperCase();
    const invIban = inv.bank_iban.replace(/\s/g, "").toUpperCase();
    if (txIban === invIban) {
      score += 30;
      reasons.push("IBAN corrispondente");
    }
  }

  // Name match
  const txName = tx.creditor_name || tx.debtor_name || tx.description || "";
  const invName = inv.client_company_name || "";
  if (fuzzyMatch(txName, invName)) {
    score += 20;
    reasons.push("Nome cliente simile");
  }

  if (score < 50) return null;
  return { invoice: inv, score, reasons };
}

export default function BankReconciliation({ companyId }: Props) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [reconciliations, setReconciliations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTx, setSearchTx] = useState("");
  const [searchInv, setSearchInv] = useState("");

  // Match dialog
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [matchNote, setMatchNote] = useState("");
  const [matching, setMatching] = useState(false);
  const [autoMatching, setAutoMatching] = useState(false);

  // Unlink dialog
  const [unlinkTarget, setUnlinkTarget] = useState<any>(null);
  const [unlinking, setUnlinking] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
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
        .select("id, invoice_number, client_company_name, total, paid_amount, status, due_date, bank_iban, issue_date")
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
    setTransactions(txRes.data || []);
    setInvoices(invRes.data || []);
    setReconciliations(recRes.data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { if (companyId) loadData(); }, [companyId, loadData]);

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

  // Confirm match
  async function confirmMatch(tx: any, inv: any, matchType: "manual" | "auto") {
    setMatching(true);
    try {
      const matchedAmount = Math.abs(tx.amount);
      const newPaidAmount = Number(inv.paid_amount || 0) + matchedAmount;
      const newStatus = newPaidAmount >= Number(inv.total || 0) ? "paid" : inv.status;

      const [linkRes, recRes, invRes] = await Promise.all([
        supabase.from("bank_transactions").update({ linked_invoice_id: inv.id }).eq("id", tx.id),
        supabase.from("bank_reconciliations").insert({
          company_id: companyId,
          transaction_id: tx.id,
          invoice_id: inv.id,
          matched_amount: matchedAmount,
          match_type: matchType,
          matched_by: user?.id,
          notes: matchNote || null,
        } as any),
        supabase.from("invoices").update({ paid_amount: newPaidAmount, status: newStatus }).eq("id", inv.id),
      ]);

      if (linkRes.error) throw linkRes.error;
      if (recRes.error) throw recRes.error;
      if (invRes.error) throw invRes.error;

      toast.success(`Riconciliata transazione con fattura ${inv.invoice_number}`);
      setSelectedTx(null);
      loadData();
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    }
    setMatching(false);
  }

  // Auto-match
  async function runAutoMatch() {
    setAutoMatching(true);
    let matched = 0;
    for (const tx of transactions) {
      const best = invoices
        .map((inv) => computeMatchScore(tx, inv))
        .filter((m): m is MatchSuggestion => m !== null && m.score >= 80)
        .sort((a, b) => b.score - a.score)[0];
      if (best) {
        await confirmMatch(tx, best.invoice, "auto");
        matched++;
      }
    }
    toast.success(`Auto-match completato: ${matched} riconciliazioni`);
    setAutoMatching(false);
    loadData();
  }

  // Unlink
  async function handleUnlink() {
    if (!unlinkTarget) return;
    setUnlinking(true);
    try {
      const rec = unlinkTarget;
      const txId = typeof rec.bank_transactions === "object" ? rec.bank_transactions?.id : rec.transaction_id;
      const invId = typeof rec.invoices === "object" ? rec.invoices?.id : rec.invoice_id;

      // Get current invoice to recompute paid_amount
      const { data: inv } = await supabase.from("invoices").select("paid_amount, total, status").eq("id", invId).single();
      const newPaid = Math.max(0, Number(inv?.paid_amount || 0) - Number(rec.matched_amount || 0));
      const wasFullyPaid = inv?.status === "paid";

      await Promise.all([
        supabase.from("bank_transactions").update({ linked_invoice_id: null }).eq("id", txId),
        supabase.from("bank_reconciliations").update({ unmatched_at: new Date().toISOString() }).eq("id", rec.id),
        supabase.from("invoices").update({
          paid_amount: newPaid,
          status: wasFullyPaid ? "delivered" : inv?.status,
        }).eq("id", invId),
      ]);

      toast.success("Riconciliazione rimossa");
      setUnlinkTarget(null);
      loadData();
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    }
    setUnlinking(false);
  }

  // Filtered lists
  const filteredTx = useMemo(() => {
    if (!searchTx) return transactions;
    const q = searchTx.toLowerCase();
    return transactions.filter((t) =>
      (t.description || "").toLowerCase().includes(q) ||
      (t.creditor_name || "").toLowerCase().includes(q) ||
      (t.debtor_name || "").toLowerCase().includes(q)
    );
  }, [transactions, searchTx]);

  const filteredInv = useMemo(() => {
    if (!searchInv) return invoices;
    const q = searchInv.toLowerCase();
    return invoices.filter((i) =>
      (i.invoice_number || "").toLowerCase().includes(q) ||
      (i.client_company_name || "").toLowerCase().includes(q)
    );
  }, [invoices, searchInv]);

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
              <p className="text-sm text-muted-foreground text-center py-8">Nessuna transazione da riconciliare</p>
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
                        {tx.creditor_name || tx.debtor_name || "—"} · {tx.booking_date || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tx.bank_accounts?.display_name || tx.bank_accounts?.account_name || ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-green-600 whitespace-nowrap ml-2">
                      +{fmtEur(Math.abs(tx.amount))}
                    </p>
                  </div>
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
              <p className="text-sm text-muted-foreground text-center py-8">Nessuna fattura non pagata</p>
            ) : (
              filteredInv.map((inv) => {
                const remaining = Number(inv.total || 0) - Number(inv.paid_amount || 0);
                return (
                  <div key={inv.id} className="border rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{inv.invoice_number || "—"}</p>
                        <p className="text-xs text-muted-foreground truncate">{inv.client_company_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          Scad. {inv.due_date || "—"}
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
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Riconciliazioni recenti
            </CardTitle>
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
                      <p className="text-xs text-muted-foreground">
                        {fmtEur(Number(rec.matched_amount))} ·{" "}
                        <Badge variant="outline" className="text-[10px] px-1">
                          {rec.match_type === "auto" ? "Auto" : "Manuale"}
                        </Badge>
                        {rec.notes && ` · ${rec.notes}`}
                      </p>
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
                  {selectedTx.creditor_name || selectedTx.debtor_name || ""} · {selectedTx.booking_date}
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
                      className="border rounded-lg p-3 hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => confirmMatch(selectedTx, s.invoice, "manual")}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium">{s.invoice.invoice_number} — {s.invoice.client_company_name}</p>
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
                      className="border rounded p-2 hover:bg-accent/50 cursor-pointer text-xs"
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
