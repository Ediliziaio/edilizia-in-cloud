// ============================================================================
// CostiBankReconcileDialog — "Riconcilia con banca" per i costi non pagati
// ============================================================================
// Prende i costi scaduti/non pagati, carica gli addebiti bancari recenti
// (bank_transactions, già sincronizzati da Tesoreria/Enable Banking) e
// propone i match via matchCostsToBankTransactions. Conferma singola o in
// blocco (solo match forti): la scrittura passa dal callback onPayCost del
// manager → mutation esistenti (con Prima Nota automatica).
// ============================================================================

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowRight, CheckCircle2, Landmark, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import type { UnifiedCost } from "@/lib/costsUtils";
import { matchCostsToBankTransactions, type BankTxLite, type CostBankMatch } from "@/lib/costiBankMatch";

export function CostiBankReconcileDialog({
  open,
  onOpenChange,
  companyId,
  unpaidCosts,
  onPayCost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | undefined;
  unpaidCosts: UnifiedCost[];
  /** Segna pagato il costo alla data del movimento (dispatch per origine nel manager). */
  onPayCost: (cost: UnifiedCost, date: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState<string | null>(null); // cost.id in corso
  const [bulkRunning, setBulkRunning] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["costi-bank-debits", companyId],
    enabled: open && !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<BankTxLite[]> => {
      const since = format(subMonths(new Date(), 12), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("id, booking_date, amount, description, creditor_name")
        .eq("company_id", companyId!)
        .lt("amount", 0)
        .gte("booking_date", since)
        .order("booking_date", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as BankTxLite[];
    },
  });

  const matches = useMemo(
    () => matchCostsToBankTransactions(unpaidCosts, transactions).filter((m) => !done.has(m.cost.id)),
    [unpaidCosts, transactions, done],
  );
  const strong = matches.filter((m) => m.strength === "forte");

  async function confirmOne(m: CostBankMatch) {
    setConfirming(m.cost.id);
    try {
      await onPayCost(m.cost, m.tx.booking_date);
      setDone((prev) => new Set(prev).add(m.cost.id));
    } finally {
      setConfirming(null);
    }
  }

  async function confirmAllStrong() {
    setBulkRunning(true);
    try {
      // Sequenziale: ogni conferma scrive anche Prima Nota; niente raffiche parallele
      for (const m of strong) {
        // eslint-disable-next-line no-await-in-loop
        await confirmOne(m);
      }
    } finally {
      setBulkRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[85vh] !flex !flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-orange-500" />
            Riconcilia con banca
          </DialogTitle>
          <DialogDescription>
            Confronto tra i costi non pagati e gli addebiti bancari degli ultimi 12 mesi.
            Confermando, il costo viene segnato pagato alla data del movimento (con registrazione in Prima Nota).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nessun movimento bancario disponibile.
              <br />Collega o sincronizza il conto in <span className="font-medium">Finanza → Tesoreria</span>.
            </div>
          ) : matches.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {done.size > 0
                ? `Tutto riconciliato: ${done.size} cost${done.size === 1 ? "o chiuso" : "i chiusi"}.`
                : "Nessun match plausibile tra costi aperti e addebiti bancari."}
            </div>
          ) : (
            <div className="space-y-2 py-1">
              {matches.map((m) => (
                <div
                  key={m.cost.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center"
                >
                  {/* Costo */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{m.cost.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        m.cost.supplierName,
                        `scad. ${format(parseISO(m.cost.due_date), "d MMM yyyy", { locale: it })}`,
                        formatCurrency(Number(m.cost.amount)),
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                  {/* Movimento */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-700">{m.tx.description || m.tx.creditor_name || "Addebito"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(m.tx.booking_date), "d MMM yyyy", { locale: it })} ·{" "}
                      <span className="font-medium tabular-nums text-rose-600">{formatCurrency(Math.abs(Number(m.tx.amount)))}</span>
                      {" "}({m.amountKind})
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        m.strength === "forte"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-amber-300 bg-amber-50 text-amber-700",
                      )}
                    >
                      {m.strength === "forte" ? "Match forte" : "Possibile"}
                    </Badge>
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={confirming !== null || bulkRunning}
                      onClick={() => confirmOne(m)}
                    >
                      {confirming === m.cost.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Segna pagato
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t pt-3 sm:justify-between">
          <p className="text-xs text-muted-foreground self-center">
            {matches.length} proposte · {strong.length} match fort{strong.length === 1 ? "e" : "i"}
            {done.size > 0 ? ` · ${done.size} già chius${done.size === 1 ? "o" : "i"}` : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
            <Button
              disabled={strong.length === 0 || bulkRunning || confirming !== null}
              onClick={confirmAllStrong}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {bulkRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Conferma {strong.length} match fort{strong.length === 1 ? "e" : "i"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
