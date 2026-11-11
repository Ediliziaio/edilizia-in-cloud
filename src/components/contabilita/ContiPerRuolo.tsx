/**
 * I conti che una scrittura di fine anno usa, scelti dall'azienda una volta (11/11/2026,
 * docs/piano-assestamenti-fine-anno.md). Ogni ruolo (es. «07.02 Risconti attivi») diventa un conto
 * del piano dell'azienda con contabilita_assegna_ruolo; da lì in poi le scritture lo trovano da sole.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** I conti del piano standard hanno per codice il loro ruolo (05.01, 30.40…): fanno già da quello. */
const RUOLO_DAL_CODICE = /^\d{2}\.\d{2}$/;

export interface RuoloConto { ruolo: string; etichetta: string; natura: "attivo" | "passivo" | "costo" | "ricavo" }

/** I conti movimentabili dell'azienda, per scegliere ruoli e righe. Una query sola per tutta Fine anno. */
export function useContiMovimentabili(companyId: string, enabled = true) {
  return useQuery({
    queryKey: ["contabilita-generale", companyId, "conti-movimentabili"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("contabilita_conti")
        .select("id, codice, descrizione, natura, codice_standard").eq("company_id", companyId).eq("movimentabile", true).eq("attivo", true).order("codice");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function ContiPerRuolo({ companyId, ruoli, chiuso }: { companyId: string; ruoli: readonly RuoloConto[]; chiuso: boolean }) {
  const qc = useQueryClient();
  const conti = useContiMovimentabili(companyId, ruoli.length > 0);
  const assegna = useMutation({
    mutationFn: async ({ ruolo, conto }: { ruolo: string; conto: string }) => {
      const { error } = await supabase.rpc("contabilita_assegna_ruolo", { p_company: companyId, p_ruolo: ruolo, p_conto: conto });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Conto assegnato"); void qc.invalidateQueries({ queryKey: ["contabilita-generale", companyId] }); },
    onError: (e) => toast.error("Conto non assegnato", { description: e instanceof Error ? e.message : String(e) }),
  });
  if (ruoli.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">Indica quali conti del tuo piano usare (una volta sola):</p>
      {ruoli.map((r) => (
        <div key={r.ruolo} className="grid items-center gap-2 sm:grid-cols-2">
          <span className="text-xs">{r.etichetta}</span>
          <Select disabled={chiuso || assegna.isPending} onValueChange={(conto) => assegna.mutate({ ruolo: r.ruolo, conto })}>
            <SelectTrigger aria-label={`Conto per: ${r.etichetta}`} className="h-8 bg-background text-xs"><SelectValue placeholder="Scegli il conto…" /></SelectTrigger>
            <SelectContent>
              {/* Un conto che fa già da un altro ruolo non si offre: perderebbe il suo (le fatture, l'IVA…). */}
              {(conti.data ?? []).filter((c) => c.natura === r.natura && !c.codice_standard && !RUOLO_DAL_CODICE.test(c.codice)).map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">{c.codice} {c.descrizione}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      <p className="text-xs">Se il conto non c'è, crealo in Piano dei conti (sotto il suo mastro) e torna qui.</p>
    </div>
  );
}
