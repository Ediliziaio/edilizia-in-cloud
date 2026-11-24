/**
 * Le quote di un movimento diviso (23/11/2026): nel dettaglio di una riga della Prima Nota si
 * vedono tutte le altre righe dello stesso bonifico o RiBa, con fattura, commessa e importo.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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

export function QuoteDelMovimento({ gruppo, correnteId, onApri, apribile = () => true, puoAnnullare = false, onAnnullato }: {
  gruppo: { id: string; descrizione: string; importo: number };
  correnteId: string;
  onApri: (id: string) => void;
  /** Si apre solo una quota che l'elenco ha in pagina (i filtri possono nasconderla). */
  apribile?: (id: string) => boolean;
  /** Annullare tutto il movimento: solo l'amministratore (lo ricontrolla il database). */
  puoAnnullare?: boolean;
  onAnnullato?: () => void;
}) {
  const t = useT();
  const cache = useQueryClient();
  const [chiediMotivo, setChiediMotivo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const annulla = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("prima_nota_annulla_gruppo" as never, { p_gruppo: gruppo.id, p_motivo: motivo.trim() } as never);
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: n => {
      toast.success(t("Movimento annullato: {n} quote tolte", { n }), { description: t("Fatture, costi e cedolini tornano come prima; il movimento di banca, se c'era, torna libero.") });
      refreshFinancialQueries(cache);
      void cache.invalidateQueries({ queryKey: ["prima-nota"] });
      void cache.invalidateQueries({ queryKey: ["prima-nota-documenti-aperti"] });
      onAnnullato?.();
    },
    onError: (e: Error) => toast.error(t("Movimento non annullato"), { description: e.message, duration: 12000 }),
  });
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
    <section aria-label={t("Quote del movimento")} className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">{t("Movimento diviso: {descrizione}", { descrizione: gruppo.descrizione ?? "" })}</p>
        <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(Number(gruppo.importo))}</span>
      </div>
      {righe.isPending && <p className="text-xs text-muted-foreground">{t("Carico le quote…")}</p>}
      {righe.isError && <p className="text-xs text-destructive">{t("Quote non caricate.")}</p>}
      {righe.data && (
        <ul className="divide-y rounded-md border">
          {righe.data.map(r => (
            <li key={r.id}>
              <button type="button" disabled={r.id === correnteId || !apribile(r.id)} onClick={() => onApri(r.id)}
                title={r.id !== correnteId && !apribile(r.id) ? t("Fuori dai filtri o dalla pagina dell'elenco") : undefined}
                className={cn("flex w-full items-center gap-2 px-3 py-2 text-left", r.id === correnteId ? "bg-primary/5" : "hover:bg-muted/50")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.description}</span>
                  {r.orders?.order_code && <span className="block text-xs text-muted-foreground">{t("Commessa {codice}", { codice: r.orders.order_code })}</span>}
                </span>
                {r.id === correnteId && <span className="shrink-0 text-xs text-muted-foreground">{t("questa")}</span>}
                <span className="shrink-0 tabular-nums">{formatCurrency(Number(r.amount))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {righe.data && Math.abs(somma - Number(gruppo.importo)) > 0.005 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t("Le quote attive fanno {somma}: una quota è stata tolta o stornata dopo la registrazione.", { somma: formatCurrency(somma) })}</p>
      )}
      {puoAnnullare && !chiediMotivo && (
        <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => setChiediMotivo(true)}>
          {t("Annulla tutto il movimento")}
        </Button>
      )}
      {puoAnnullare && chiediMotivo && (
        <div className="space-y-2 rounded-md border border-destructive/40 p-2">
          <p className="text-xs">{t("Si tolgono tutte le quote: fatture e costi tornano da pagare o incassare, i cedolini tornano da pagare e il movimento di banca, se c'era, torna libero.")}</p>
          <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={t("Perché lo annulli")} aria-label={t("Motivo dell'annullamento")} />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={!motivo.trim() || annulla.isPending} onClick={() => annulla.mutate()}>
              {annulla.isPending ? t("Annullo…") : t("Annulla le quote")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={annulla.isPending} onClick={() => setChiediMotivo(false)}>{t("Lascia stare")}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
