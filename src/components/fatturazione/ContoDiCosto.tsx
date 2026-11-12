/**
 * Il conto di costo di una fattura ricevuta, nella sua scheda (10/11/2026).
 *
 * Il programma non ha un piano dei conti: la «contropartita» di una fattura è la
 * categoria del costo. Prima si vedeva solo in Finanza → Costi, dopo la
 * contabilizzazione, e chi controllava la fattura non sapeva dove leggerla né
 * come cambiarla (Scavolo: M-Contract finita in «materiali» senza che nessuno
 * l'avesse scelto).
 *
 * - Già contabilizzata: si cambia la categoria del costo.
 * - Non ancora: si fissa sulla fattura, e `contabilizza_fattura_ricevuta` la
 *   usa al posto di «materiali».
 * - Se la fattura è già nella contabilità generale, la sua scrittura si storna e
 *   si rifà col conto nuovo (`contabilita_riregistra_documento`): prima restava
 *   sul conto vecchio e il bilancio non vedeva il cambio.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { CATEGORIE_DI_BASE } from "@/lib/fatturazione/contoPerRiga";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Quella che il database usa quando nessuno ha scelto (contabilizza_fattura_ricevuta). */
export const CATEGORIA_PREDEFINITA = "materiali";

// Le categorie di base stanno in lib/fatturazione/contoPerRiga (le usa anche il conto per riga).
export { CATEGORIE_DI_BASE };

export function ContoDiCosto({ companyId, fatturaId, costoId, attuale, onCambiato }: {
  companyId: string;
  fatturaId: string;
  costoId: string | null;
  attuale: string | null;
  onCambiato: () => void;
}) {
  const qc = useQueryClient();
  const { data: categorie = [] } = useQuery({
    queryKey: queryKeys.costCategories.list(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_categories").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ name: string }>;
    },
  });

  const cambia = useMutation({
    mutationFn: async (categoria: string) => {
      const { error } = costoId
        ? await supabase.from("company_costs").update({ category: categoria }).eq("id", costoId).eq("company_id", companyId)
        : await supabase.from("fatture_ricevute").update({ categoria_ai: categoria }).eq("id", fatturaId).eq("company_id", companyId);
      if (error) throw error;
      // La contabilità generale segue: niente da fare se la fattura non c'è ancora.
      const { data, error: errGiornale } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{
          data: { stornate?: number; esito?: { fatture_ricevute?: number; errori?: string[] } } | null;
          error: { message: string } | null;
        }>;
      }).rpc("contabilita_riregistra_documento", { p_company: companyId, p_documento: fatturaId, p_motivo: `Conto di costo cambiato in «${categoria}»` });
      const stornate = data?.stornate ?? 0;
      // Dal 20290210150000 storno e scrittura nuova sono tutto o niente: se la nuova non nasce
      // (mese chiuso, conto mancante) arriva un errore e la scrittura di prima resta. Il controllo
      // sull'esito resta per la versione precedente della funzione.
      const nonRifatta = stornate > 0 && (data?.esito?.fatture_ricevute ?? 0) === 0;
      return { stornate, nonRifatta, motivo: data?.esito?.errori?.[0] ?? null, errGiornale: errGiornale?.message ?? null };
    },
    onSuccess: ({ stornate, nonRifatta, motivo, errGiornale }, categoria) => {
      toast.success(costoId ? `Conto di costo cambiato in «${categoria}»` : `Conto di costo salvato: «${categoria}», si userà alla contabilizzazione`, {
        description: stornate > 0 && !nonRifatta ? "Anche la contabilità generale: la scrittura è stata stornata e rifatta col conto nuovo." : undefined,
      });
      if (nonRifatta) {
        toast.warning("Contabilità generale: scrittura stornata ma non rifatta", {
          description: `${motivo ? `${motivo}. ` : ""}Risolto il motivo, «Genera dai documenti» in Contabilità generale la registra di nuovo.`,
          duration: 12000,
        });
      } else if (errGiornale) {
        toast.warning("Conto salvato · contabilità generale da aggiornare", {
          description: /Accesso negato/.test(errGiornale)
            ? "Il conto è salvato sulla fattura. Se usate la contabilità generale, la sua scrittura la rifà chi ne ha il permesso: avvisalo."
            : errGiornale,
          duration: 12000,
        });
      }
      onCambiato();
      void qc.invalidateQueries({ queryKey: ["contabilita-generale", companyId] });
    },
    onError: (e) => toast.error("Conto di costo non cambiato", { description: e instanceof Error ? e.message : String(e) }),
  });

  // Il conto appena scelto si vede subito: prima restava quello vecchio finché la fattura non si
  // rileggeva, e sembrava che il cambio non fosse passato.
  const valore = (cambia.isSuccess ? cambia.variables : null) ?? attuale ?? CATEGORIA_PREDEFINITA;
  const proprie = categorie.map((c) => c.name).filter(Boolean);
  const nomi = Array.from(new Set([...(proprie.length > 0 ? proprie : CATEGORIE_DI_BASE), valore]));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={valore} onValueChange={(v) => v !== valore && cambia.mutate(v)} disabled={cambia.isPending}>
        <SelectTrigger className="h-7 w-auto min-w-[10rem] text-xs" aria-label="Conto di costo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {nomi.map((n) => (
            <SelectItem key={n} value={n}>{n}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!attuale ? <span className="text-xs text-muted-foreground">predefinito, nessuno l'ha scelto</span> : null}
    </div>
  );
}
