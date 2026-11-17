/**
 * Le rese di cantiere dell'azienda (17/11/2026): quanto fa una squadra in un giorno, lavorazione per
 * lavorazione. Il gestionale parte da una tabella media (shared/piano-cantiere/resePartenza.ts); qui
 * l'azienda scrive la sua, che vale per tutte le voci di quella lavorazione nei tempi della commessa
 * («Pianifica»), in «Calcola come finire» e nel cronoprogramma del computo.
 *
 * Si scrive come si parla in cantiere: «m² al giorno con la squadra». Si salva in ore-persona per
 * unità (rese_azienda, via piano_cantiere_salva_resa): ore = squadra × ore utili ÷ quantità al giorno.
 * Vuoto = torna la resa di partenza. Si salva quando si esce dal campo.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IPOTESI_PREDEFINITE } from "../../../shared/piano-cantiere/calcolo.ts";
import { tabellaPartenza, UNITA_A_PAROLE, type ResaPartenza } from "../../../shared/piano-cantiere/resePartenza.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const ORE_UTILI = IPOTESI_PREDEFINITE.oreGiorno * (IPOTESI_PREDEFINITE.resaPct / 100);
const MESTIERI: Record<string, string> = {
  cantiere: "Cantiere", demolizioni: "Rimozioni e demolizioni", facciata: "Facciate e cappotto", copertura: "Coperture e lattonerie",
  serramentista: "Serramenti e schermature", finiture: "Finiture interne", termoidraulico: "Impianti termici", elettricista: "Impianti elettrici e fotovoltaico",
};
const alGiorno = (orePerUnita: number, squadra: number) => (orePerUnita > 0 ? (squadra * ORE_UTILI) / orePerUnita : 0);
const numero = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: n < 10 ? 1 : 0 });

export function ReseCantiere({ companyId, puoModificare }: { companyId: string; puoModificare: boolean }) {
  const qc = useQueryClient();
  const tabella = useMemo(() => tabellaPartenza(), []);
  const rese = useQuery({
    queryKey: ["rese-cantiere", companyId],
    queryFn: async () => {
      const { data, error } = await db.rpc("piano_cantiere_contesto", { p_company_id: companyId });
      if (error) throw error;
      const righe = ((data as { rese?: { chiave: string; ore_per_unita: number }[] } | null)?.rese ?? []);
      return new Map(righe.filter((r) => r.chiave.startsWith("partenza:")).map((r) => [r.chiave, Number(r.ore_per_unita)]));
    },
  });
  const [bozze, setBozze] = useState<Record<string, string>>({});
  const salva = useMutation({
    mutationFn: async ({ r, alGiornoScritto }: { r: ResaPartenza; alGiornoScritto: number | null }) => {
      const ore = alGiornoScritto ? Math.round((r.squadra * ORE_UTILI / alGiornoScritto) * 10000) / 10000 : null;
      const { error } = await db.rpc("piano_cantiere_salva_resa", {
        p_company_id: companyId, p_chiave: r.chiave, p_descrizione: r.nome, p_ore_per_unita: ore, p_unita: r.unita,
      });
      if (error) throw error;
    },
    onSuccess: (_d, { r, alGiornoScritto }) => {
      toast.success(alGiornoScritto ? `${r.nome}: ${numero(alGiornoScritto)} ${UNITA_A_PAROLE[r.unita]} al giorno` : `${r.nome}: torna la resa di partenza`);
      void qc.invalidateQueries({ queryKey: ["rese-cantiere", companyId] });
      void qc.invalidateQueries({ queryKey: ["piano-cantiere"] });
    },
    onError: (e) => toast.error("Resa non salvata", { description: e instanceof Error ? e.message : String(e) }),
  });

  if (rese.isLoading) return <p className="px-4 py-3 text-sm text-muted-foreground">Carico le rese…</p>;
  if (rese.isError) return <p className="px-4 py-3 text-sm text-muted-foreground">Le rese le vede chi vede i costi.</p>;
  const mie = rese.data ?? new Map<string, number>();
  const gruppi = [...new Set(tabella.map((r) => r.mestiere))];

  const conferma = (r: ResaPartenza, testo: string) => {
    const n = Number(testo.trim().replace(",", "."));
    const attuale = mie.get(r.chiave);
    if (testo.trim() === "") { if (attuale) salva.mutate({ r, alGiornoScritto: null }); return; }
    if (!(n > 0)) { toast.error("Scrivi un numero maggiore di zero"); return; }
    if (attuale && Math.abs(alGiorno(attuale, r.squadra) - n) < 0.05) return;
    salva.mutate({ r, alGiornoScritto: n });
  };

  return (
    <div className="divide-y text-sm">
      <p className="px-4 py-2 text-xs text-muted-foreground">
        Quanto fa la squadra in un giorno di {numero(ORE_UTILI)} ore utili. Scrivi la tua resa dove la conosci: vale per i tempi di tutte le commesse.
        Vuoto = la resa di partenza del gestionale.
      </p>
      {gruppi.map((g) => (
        <section key={g} aria-label={MESTIERI[g] ?? g}>
          <h4 className="bg-muted/40 px-4 py-1.5 text-xs font-semibold text-muted-foreground">{MESTIERI[g] ?? g}</h4>
          <ul className="divide-y">
            {tabella.filter((r) => r.mestiere === g).map((r) => {
              const mia = mie.get(r.chiave);
              const valore = bozze[r.chiave] ?? (mia ? numero(alGiorno(mia, r.squadra)) : "");
              return (
                <li key={r.chiave} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      Squadra di {r.squadra} · partenza {numero(alGiorno(r.ore, r.squadra))} {UNITA_A_PAROLE[r.unita]} al giorno
                    </span>
                  </span>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Input inputMode="decimal" className="h-8 w-24 text-right" disabled={!puoModificare || salva.isPending}
                      placeholder={numero(alGiorno(r.ore, r.squadra))} value={valore} aria-label={`${r.nome}: ${UNITA_A_PAROLE[r.unita]} al giorno della tua squadra`}
                      onChange={(e) => setBozze((b) => ({ ...b, [r.chiave]: e.target.value }))}
                      onBlur={(e) => { conferma(r, e.target.value); setBozze((b) => { const c = { ...b }; delete c[r.chiave]; return c; }); }} />
                    {UNITA_A_PAROLE[r.unita]}/giorno
                  </label>
                  {mia && puoModificare ? (
                    <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" disabled={salva.isPending}
                      onClick={() => salva.mutate({ r, alGiornoScritto: null })} aria-label={`${r.nome}: torna alla resa di partenza`}>
                      {salva.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                    </Button>
                  ) : <span className="w-8" />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
