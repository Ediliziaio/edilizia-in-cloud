/**
 * Incasso rata → Prima Nota, in un tap.
 *
 * Quando una rata della commessa e' segnata "pagata" i soldi sono entrati
 * davvero, ma la Prima Nota non lo sapeva: bisognava riaprire la contabilita'
 * e ricopiare importo, data e commessa a mano. Qui la registrazione nasce
 * dalla rata gia' compilata; resta un gesto ESPLICITO (niente scritture
 * contabili silenziose: l'incasso potrebbe gia' arrivare dalla fattura o
 * dall'import banca) e idempotente — l'indice UNIQUE su installment_id fa si'
 * che il doppio tap non possa raddoppiare l'incasso.
 */
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookCheck, BookPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import type { Installment } from "@/lib/orderUtils";

const chiaveIncassi = (orderId: string | undefined) => ["incassi-registrati", orderId];

/**
 * Le registrazioni Prima Nota gia' nate dalle rate di questa commessa,
 * in UNA query per tutta la card (non una per riga).
 */
export function useIncassiRegistrati(orderId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: chiaveIncassi(orderId),
    enabled: enabled && !!orderId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("prima_nota_entries")
        .select("id, installment_id")
        .eq("order_id", orderId)
        .not("installment_id", "is", null);
      if (error) throw error;
      const mappa: Record<string, string> = {};
      for (const r of (data ?? []) as Array<{ id: string; installment_id: string }>) {
        mappa[r.installment_id] = r.id;
      }
      return mappa;
    },
    staleTime: 30_000,
  });
}

interface Props {
  inst: Installment;
  /** Importo mostrato sulla riga (per il saldo e' calcolato, non inst.amount). */
  amount: number;
  orderId: string;
  orderCode: string | null | undefined;
  /** id della registrazione gia' esistente per questa rata, se c'e'. */
  entryId: string | undefined;
}

export function RegistraIncassoPrimaNota({ inst, amount, orderId, orderCode, entryId }: Props) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();

  const registra = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("prima_nota_entries").insert({
        company_id: effectiveCompany!.id,
        direction: "entrata",
        category: "incasso",
        description: `Incasso ${inst.label} — ${orderCode ?? "commessa"}`,
        amount: Math.round(amount * 100) / 100,
        // La data dell'incasso e' quella in cui la rata risulta pagata, non
        // quella del tap: chi registra a fine settimana non sposta la cassa.
        entry_date: inst.paid_date ?? new Date().toLocaleDateString("en-CA"),
        order_id: orderId,
        installment_id: inst.id,
        account_label: "banca",
        is_auto: false,
        auto_source: "order_installment",
        created_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chiaveIncassi(orderId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.primaNota.all });
      // Il grafico 6 mesi della Prima Nota usa un prefisso diverso dalle liste.
      queryClient.invalidateQueries({ queryKey: ["primaNota"] });
      toast.success("Incasso registrato in Prima Nota", {
        description: `${inst.label} — la trovi tra le entrate della commessa.`,
      });
    },
    onError: (e) => {
      // 23505 = l'indice UNIQUE ha fermato un doppione (doppio tap, seconda
      // finestra): non e' un errore per l'utente, la registrazione c'e' gia'.
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("uq_prima_nota_installment") || msg.includes("23505")) {
        queryClient.invalidateQueries({ queryKey: chiaveIncassi(orderId) });
        toast.info("Questa rata era gia' registrata in Prima Nota");
      } else {
        toast.error("Registrazione non riuscita", { description: msg });
      }
    },
  });

  if (entryId) {
    return (
      <Link
        to="/azienda/prima-nota"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
        title="Registrata in Prima Nota: apri la contabilità"
      >
        <BookCheck className="h-3 w-3" />
        In Prima Nota
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={registra.isPending}
      onClick={() => registra.mutate()}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
      title="Crea la registrazione d'incasso in Prima Nota con importo e data di questa rata"
    >
      {registra.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookPlus className="h-3 w-3" />}
      Registra in Prima Nota
    </button>
  );
}
