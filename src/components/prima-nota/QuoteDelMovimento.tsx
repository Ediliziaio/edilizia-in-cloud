/**
 * Le quote di un movimento diviso (23/11/2026): nel dettaglio di una riga della Prima Nota si
 * vedono tutte le altre righe dello stesso bonifico o RiBa, con fattura, commessa e importo.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface RigaQuota {
  id: string;
  description: string;
  category: string;
  amount: number;
  direction: "entrata" | "uscita";
  orders: { order_code: string } | null;
}

export function etichettaQuota(gruppo: { descrizione: string; importo: number } | null | undefined) {
  return gruppo ? `Quota di «${gruppo.descrizione}» · ${formatCurrency(Number(gruppo.importo))}` : null;
}

export function QuoteDelMovimento({ gruppo, correnteId, onApri, apribile = () => true }: {
  gruppo: { id: string; descrizione: string; importo: number };
  correnteId: string;
  onApri: (id: string) => void;
  /** Si apre solo una quota che l'elenco ha in pagina (i filtri possono nasconderla). */
  apribile?: (id: string) => boolean;
}) {
  const righe = useQuery({
    queryKey: ["prima-nota-quote-gruppo", gruppo.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("prima_nota_entries")
        .select("id, description, category, amount, direction, orders(order_code)")
        .eq("gruppo_id" as never, gruppo.id as never)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as RigaQuota[];
    },
  });
  const somma = (righe.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  return (
    <section aria-label="Quote del movimento" className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">Movimento diviso: {gruppo.descrizione}</p>
        <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(Number(gruppo.importo))}</span>
      </div>
      {righe.isPending && <p className="text-xs text-muted-foreground">Carico le quote…</p>}
      {righe.isError && <p className="text-xs text-destructive">Quote non caricate.</p>}
      {righe.data && (
        <ul className="divide-y rounded-md border">
          {righe.data.map(r => (
            <li key={r.id}>
              <button type="button" disabled={r.id === correnteId || !apribile(r.id)} onClick={() => onApri(r.id)}
                title={r.id !== correnteId && !apribile(r.id) ? "Fuori dai filtri o dalla pagina dell'elenco" : undefined}
                className={cn("flex w-full items-center gap-2 px-3 py-2 text-left", r.id === correnteId ? "bg-primary/5" : "hover:bg-muted/50")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.description}</span>
                  {r.orders?.order_code && <span className="block text-xs text-muted-foreground">Commessa {r.orders.order_code}</span>}
                </span>
                {r.id === correnteId && <span className="shrink-0 text-xs text-muted-foreground">questa</span>}
                <span className="shrink-0 tabular-nums">{formatCurrency(Number(r.amount))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {righe.data && Math.abs(somma - Number(gruppo.importo)) > 0.005 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Le quote attive fanno {formatCurrency(somma)}: una quota è stata tolta o stornata dopo la registrazione.
        </p>
      )}
    </section>
  );
}
