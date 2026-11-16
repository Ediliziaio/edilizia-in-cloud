/**
 * Contabilità → «Da verificare» (16/11/2026, docs/piano-punti-aperti-20261116.md §10).
 *
 * Una riga per ogni anomalia trovata da cdg_controllo_doppi (letta con cdg_da_verificare):
 * cosa è, quanto vale, cosa fare, e un pulsante per ogni documento coinvolto. Il gestionale non
 * corregge niente da solo: si apre il documento e si sistema a mano. Senza il permesso (42501) la
 * lista non c'è; senza anomalie non occupa spazio.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ClipboardCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { TITOLO_CONTROLLO } from "@/components/controllo-gestione/ui/ControlliDoppiCard";
import { etichettaApri, indirizzoDocumento, type AnomaliaDaVerificare } from "@/lib/contabilita/daVerificare";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * `variante="pillola"` (16/11/2026): un pulsante «Da verificare N» nella testata, con l'elenco in
 * una finestra. In cima alla Prima nota la fascia gialla spingeva giù i numeri e i movimenti.
 */
export function DaVerificareCard({ companyId, variante = "fascia" }: { companyId: string | undefined; variante?: "fascia" | "pillola" }) {
  const [aperto, setAperto] = useState(false);
  const q = useQuery({
    queryKey: ["contabilita-da-verificare", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("cdg_da_verificare", { p_company: companyId });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as AnomaliaDaVerificare[];
    },
  });
  const codice = (q.error as { code?: string } | null)?.code;
  if (q.isLoading || (q.isError && codice === "42501")) return null;
  if (q.isError) {
    return <p role="alert" className="rounded-lg border p-3 text-sm text-destructive">Controllo «Da verificare» non riuscito: {(q.error as Error).message}</p>;
  }
  const righe = q.data ?? [];
  if (!righe.length) return null;
  const elenco = (
      <ul className="divide-y rounded-lg border bg-card">
        {righe.map((r) => (
          <li key={r.chiave} className="space-y-1 px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm font-medium">{TITOLO_CONTROLLO[r.controllo] ?? r.controllo}</span>
              {r.importo != null && <span className="text-sm font-semibold tabular-nums">{formatCurrency(Number(r.importo))}</span>}
            </div>
            <p className="text-xs text-muted-foreground">{r.descrizione}</p>
            <p className="text-xs">{r.cosa_fare}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {r.documenti.map((d) => {
                const href = indirizzoDocumento(d);
                return href ? (
                  <Button key={`${d.tipo}-${d.id}`} asChild size="sm" variant="outline" className="h-7">
                    <Link to={href} title={d.titolo}><ExternalLink className="mr-1 h-3.5 w-3.5" />{etichettaApri(d)}</Link>
                  </Button>
                ) : null;
              })}
            </div>
          </li>
        ))}
      </ul>
  );

  if (variante === "pillola") {
    return (
      <>
        <button
          type="button"
          onClick={() => setAperto(true)}
          title="Dati che non tornano: aprili e sistemali a mano"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          Da verificare
          <span className="rounded-full bg-amber-200/70 px-1.5 text-xs tabular-nums dark:bg-amber-900/60">{righe.length}</span>
        </button>
        <Dialog open={aperto} onOpenChange={setAperto}>
          <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Da verificare ({righe.length})</DialogTitle>
              <DialogDescription>Dati che non tornano e che nessuna regola corregge da sola: apri il documento e sistemalo a mano.</DialogDescription>
            </DialogHeader>
            {elenco}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <section aria-labelledby="da-verificare" className="rounded-xl border border-amber-300 bg-amber-50/50 p-4 dark:bg-amber-950/20">
      <h2 id="da-verificare" className="flex items-center gap-2 text-sm font-semibold">
        <ClipboardCheck className="h-4 w-4 text-amber-600" />Da verificare ({righe.length})
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Dati che non tornano e che nessuna regola corregge da sola: apri il documento e sistemalo a mano.</p>
      <div className="mt-3">{elenco}</div>
    </section>
  );
}
