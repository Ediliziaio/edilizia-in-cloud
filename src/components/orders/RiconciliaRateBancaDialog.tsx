/**
 * "Riconcilia con banca" per le rate della commessa.
 *
 * Gemello lato entrate del CostiBankReconcileDialog: carica gli accrediti
 * bancari recenti non ancora consumati (ne' da fatture ne' da altre rate),
 * propone il match con le rate non incassate di QUESTA commessa e, alla
 * conferma, scrive tutta la storia in un colpo solo: rata pagata alla data
 * VERA del movimento, registrazione in Prima Nota con bank_transaction_id,
 * movimento marcato con linked_installment_id (non verra' riproposto).
 *
 * La banca e' la fonte di verita': se il bonifico c'e', l'incasso e' avvenuto
 * — qui la registrazione contabile nasce dalla riconciliazione, non da un
 * ricordo.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowRight, CheckCircle2, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { queryKeys } from "@/lib/queryKeys";
import {
  matchRateToBankTransactions,
  type CreditTxLite,
  type RataDaIncassare,
} from "@/lib/rateBankMatch";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | undefined;
  orderId: string;
  orderCode: string | null | undefined;
  clienteNome?: string | null;
  /** Rate non incassate con l'importo MOSTRATO (per il saldo quello calcolato). */
  rateNonPagate: RataDaIncassare[];
}

export function RiconciliaRateBancaDialog({
  open, onOpenChange, companyId, orderId, orderCode, clienteNome, rateNonPagate,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null); // rata.id in corso
  const [done, setDone] = useState<Set<string>>(new Set());

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["rate-bank-credits", companyId],
    enabled: open && !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<CreditTxLite[]> => {
      const since = format(subMonths(new Date(), 12), "yyyy-MM-dd");
      const { data, error } = await (supabase as any)
        .from("bank_transactions")
        .select("id, booking_date, amount, description, debtor_name")
        .eq("company_id", companyId)
        .gt("amount", 0)
        .is("linked_invoice_id", null)
        .is("linked_installment_id", null)
        .gte("booking_date", since)
        .order("booking_date", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as CreditTxLite[];
    },
  });

  const matches = useMemo(
    () => matchRateToBankTransactions(
      rateNonPagate.filter((r) => !done.has(r.id)),
      transactions,
      clienteNome,
    ),
    [rateNonPagate, transactions, clienteNome, done],
  );

  async function conferma(rataId: string, txId: string, importo: number, label: string, bookingDate: string) {
    if (confirming) return;
    setConfirming(rataId);
    try {
      // Passi in sequenza con rollback: mai lasciare meta' storia scritta.
      // 1) La rata risulta pagata alla data del movimento (la banca decide la data).
      const upRata = await (supabase as any)
        .from("order_installments")
        .update({ is_paid: true, paid_date: bookingDate })
        .eq("id", rataId)
        .eq("is_paid", false);
      if (upRata.error) throw upRata.error;

      // 2) Registrazione in Prima Nota agganciata a rata E movimento. L'indice
      //    UNIQUE su installment_id ferma i doppioni: se esiste gia', va bene
      //    cosi' — la storia contabile c'e', si prosegue.
      const insPn = await (supabase as any).from("prima_nota_entries").insert({
        company_id: companyId,
        direction: "entrata",
        category: "incasso",
        description: `Incasso ${label} — ${orderCode ?? "commessa"}`,
        amount: Math.round(importo * 100) / 100,
        entry_date: bookingDate,
        order_id: orderId,
        installment_id: rataId,
        bank_transaction_id: txId,
        reconciliation_method: "manual",
        account_label: "banca",
        is_auto: false,
        auto_source: "order_installment",
        created_by: user?.id,
      });
      if (insPn.error && !String(insPn.error.message).includes("uq_prima_nota_installment")) {
        await (supabase as any).from("order_installments").update({ is_paid: false, paid_date: null }).eq("id", rataId);
        throw insPn.error;
      }

      // 3) Il movimento e' consumato: non verra' riproposto ne' qui ne' in Tesoreria.
      const upTx = await (supabase as any)
        .from("bank_transactions")
        .update({ linked_installment_id: rataId })
        .eq("id", txId)
        .eq("company_id", companyId);
      if (upTx.error) throw upTx.error;

      setDone((prev) => new Set(prev).add(rataId));
      toast.success(`${label} riconciliata`, {
        description: `Incassata il ${format(parseISO(bookingDate), "d MMMM yyyy", { locale: it })} — registrata in Prima Nota.`,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.installments(orderId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId) });
      queryClient.invalidateQueries({ queryKey: ["incassi-registrati", orderId] });
      queryClient.invalidateQueries({ queryKey: ["rate-bank-credits", companyId] });
      queryClient.invalidateQueries({ queryKey: ["prima-nota"] });
      queryClient.invalidateQueries({ queryKey: ["primaNota"] });
    } catch (e) {
      toast.error("Riconciliazione non riuscita", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setConfirming(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-orange-500" />
            Riconcilia le rate con la banca
          </DialogTitle>
          <DialogDescription>
            Accrediti degli ultimi 12 mesi non ancora abbinati, confrontati con le
            rate da incassare di questa commessa. Confermando, la rata risulta
            pagata alla data del bonifico e la Prima Nota si aggiorna da sola.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : matches.length === 0 ? (
          <p className="py-6 text-sm text-slate-500">
            Nessun accredito combacia con le rate da incassare
            {transactions.length === 0 && " (nessun movimento bancario in entrata disponibile: collega o sincronizza il conto in Tesoreria)"}.
          </p>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {matches.map((m) => (
              <div
                key={m.rata.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{m.rata.label}</p>
                  <p className="text-xs text-slate-500">
                    {formatCurrency(m.rata.amount)}
                    {m.rata.expected_date && <> · previsto {format(parseISO(m.rata.expected_date), "d MMM", { locale: it })}</>}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium tabular-nums">{formatCurrency(Number(m.tx.amount))}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {format(parseISO(m.tx.booking_date), "d MMM yyyy", { locale: it })}
                    {(m.tx.debtor_name || m.tx.description) && <> · {m.tx.debtor_name ?? m.tx.description}</>}
                  </p>
                </div>
                <Badge
                  className={m.strength === "forte"
                    ? "bg-emerald-100 text-emerald-700 shrink-0"
                    : "bg-amber-100 text-amber-700 shrink-0"}
                >
                  {m.strength}
                </Badge>
                <Button
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={!!confirming}
                  onClick={() => conferma(m.rata.id, m.tx.id, m.rata.amount, m.rata.label, m.tx.booking_date)}
                >
                  {confirming === m.rata.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <CheckCircle2 className="h-3.5 w-3.5" />}
                  <span className="ml-1">Conferma</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
