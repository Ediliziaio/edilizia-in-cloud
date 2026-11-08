// Dopo una perizia di variante approvata: i materiali che cambiano (prima → dopo)
// e le voci nuove senza materiali. Li conferma o scarta chi valida la distinta;
// gli altri li vedono e sanno che gli acquisti aspettano. Vedi la migrazione
// 20281222190000_variante_aggiorna_materiali.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GitCompareArrows, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { chiaviMateriali } from "@/hooks/useMaterialiPerFase";
import { chiaveVariazioni, useVariazioniVariante } from "@/hooks/useVariazioniVariante";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const numero = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("it-IT", { maximumFractionDigits: 2 });

export function VariazioniVariante({ orderId, puoDecidere }: { orderId: string; puoDecidere: boolean }) {
  const qc = useQueryClient();
  const { data: variazioni = [] } = useVariazioniVariante(orderId);
  const decidi = useMutation({
    mutationFn: async (p: { ids: string[] | null; applica: boolean }) => {
      const { error } = await db.rpc("materiali_variazioni_decidi", { p_order: orderId, p_ids: p.ids, p_applica: p.applica });
      if (error) throw error;
      return p;
    },
    onSuccess: (p) => {
      toast.success(p.applica ? "Quantità aggiornate: gli acquisti vedono il nuovo fabbisogno" : "Variazione scartata: la quantità resta quella di prima");
      qc.invalidateQueries({ queryKey: chiaveVariazioni(orderId) });
      qc.invalidateQueries({ queryKey: chiaviMateriali.commessa(orderId) });
      qc.invalidateQueries({ queryKey: ["order-items", orderId] });
      qc.invalidateQueries({ queryKey: ["acquisti-da-fare"] });
    },
    onError: (e: unknown) => toast.error("Non riesco a salvare", { description: e instanceof Error ? e.message : String(e) }),
  });

  if (variazioni.length === 0) return null;
  const cambiano = variazioni.filter((v) => v.tipo === "cambia");
  const nuove = variazioni.filter((v) => v.tipo === "nuova_voce");

  return (
    <section aria-labelledby="variazioni-variante-titolo" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm dark:border-amber-700 dark:bg-amber-950/40">
      <div className="flex flex-wrap items-center gap-2">
        <GitCompareArrows className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden />
        <h3 id="variazioni-variante-titolo" className="font-semibold">Variante approvata: materiali da rivedere</h3>
        {puoDecidere && cambiano.length > 1 && (
          <Button size="sm" className="ml-auto h-7 px-2 text-xs" disabled={decidi.isPending}
            onClick={() => decidi.mutate({ ids: cambiano.map((v) => v.id), applica: true })}>
            {decidi.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}Applica tutte
          </Button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {puoDecidere
          ? "Le quantità nuove vengono dal computo della variante. Applicale per aggiornare il fabbisogno; quello già ordinato resta, e se avanza lo vedi come eccedenza."
          : "Il tecnico deve confermare le quantità nuove: finché non lo fa, gli acquisti vedono quelle di prima."}
      </p>
      <ul className="mt-2 divide-y rounded-md border bg-background">
        {cambiano.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate">{v.descrizione}</span>
            <span className="tabular-nums text-muted-foreground">
              {numero(v.quantita_prima)} → <strong className="text-foreground">{numero(v.quantita_dopo)}</strong> {v.unita_misura ?? ""}
            </span>
            {puoDecidere && (
              <span className="flex gap-1">
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={decidi.isPending} onClick={() => decidi.mutate({ ids: [v.id], applica: true })}>Applica</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={decidi.isPending} onClick={() => decidi.mutate({ ids: [v.id], applica: false })}>Scarta</Button>
              </span>
            )}
          </li>
        ))}
        {nuove.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate">Voce nuova: {v.descrizione}</span>
            <span className="tabular-nums text-muted-foreground">{numero(v.quantita_dopo)} {v.unita_misura ?? ""} · materiali da generare</span>
            {puoDecidere && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={decidi.isPending} onClick={() => decidi.mutate({ ids: [v.id], applica: true })}>Fatto</Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
