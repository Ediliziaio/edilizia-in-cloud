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
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Quella che il database usa quando nessuno ha scelto (contabilizza_fattura_ricevuta). */
export const CATEGORIA_PREDEFINITA = "materiali";

/**
 * Le categorie di base, per l'azienda che non ne ha create di sue: senza, il menu
 * mostrava solo «materiali» e non si poteva cambiare niente. Sono i nomi della
 * classificazione automatica delle fatture, così restano gli stessi.
 */
export const CATEGORIE_DI_BASE = [
  "materiali", "materiali_edili", "subappalti", "consulenze_professionali", "noli_attrezzature",
  "carburanti", "trasporti", "utenze", "manutenzioni", "assicurazioni", "affitti", "servizi_generali",
  "provvigioni", "personale", "tasse_imposte", "spese_bancarie", "altro",
];

export function ContoDiCosto({ companyId, fatturaId, costoId, attuale, onCambiato }: {
  companyId: string;
  fatturaId: string;
  costoId: string | null;
  attuale: string | null;
  onCambiato: () => void;
}) {
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
    },
    onSuccess: () => {
      toast.success(costoId ? "Conto di costo cambiato" : "Conto di costo fissato: si userà alla contabilizzazione");
      onCambiato();
    },
    onError: (e) => toast.error("Conto di costo non cambiato", { description: e instanceof Error ? e.message : String(e) }),
  });

  const valore = attuale || CATEGORIA_PREDEFINITA;
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
