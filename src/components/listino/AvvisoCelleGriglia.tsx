/**
 * Nella scheda di un prodotto a griglia «acquisto + ricarico»: quante celle
 * hanno un prezzo di vendita che non corrisponde più a costo, sconti e
 * ricarico salvati, con il pulsante per aggiornarle (05/10/2026).
 *
 * Il preventivatore serramenti usa il prezzo salvato nella cella; «Salva
 * parametri» non lo riscrive, e così una griglia poteva restare per mesi coi
 * prezzi calcolati sui parametri di prima. Non si aggiorna da solo: cambiare
 * i prezzi di un listino è una scelta, qui la si rende visibile.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { celleDaRicalcolare, type CellaPrezzo, type ParametriPrezzo } from "@/lib/listino/celleGriglia";

type FamigliaGriglia = ParametriPrezzo & {
  id: string;
  modalita_prezzo_base?: string | null;
  prezzo_base_mode?: string | null;
};

export function AvvisoCelleGriglia({
  family,
  parametriDaSalvare,
}: {
  family: FamigliaGriglia;
  /** Parametri cambiati e non ancora salvati: prima si salvano, poi si aggiornano le celle. */
  parametriDaSalvare: boolean;
}) {
  const qc = useQueryClient();
  const attivo = family.modalita_prezzo_base === "griglia" && family.prezzo_base_mode === "acquisto_markup";
  const [inCorso, setInCorso] = useState(false);

  const { data: celle = [] } = useQuery({
    // Chiave propria sotto quella della griglia: le invalidazioni della griglia la aggiornano.
    queryKey: [...queryKeys.articleFamilies.grid(family.id), "prezzi-celle"],
    enabled: attivo,
    staleTime: 30_000,
    queryFn: async (): Promise<CellaPrezzo[]> => {
      const { data, error } = await supabase
        .from("listino_griglia")
        .select("id, prezzo_vendita, prezzo_acquisto, supplier_product_line_id")
        .eq("family_id", family.id);
      if (error) throw error;
      return (data ?? []) as CellaPrezzo[];
    },
  });

  const daAggiornare = useMemo(() => (attivo ? celleDaRicalcolare(celle, family) : []), [attivo, celle, family]);
  if (!attivo || daAggiornare.length === 0) return null;

  // Lo scarto più grande, in percentuale del prezzo di oggi: «fino al 32% in più».
  const scarto = daAggiornare.reduce((max, c) => {
    const pct = c.attuale > 0 ? ((c.attuale - c.nuovo) / c.attuale) * 100 : 0;
    return Math.abs(pct) > Math.abs(max) ? pct : max;
  }, 0);
  const n = daAggiornare.length;

  const aggiorna = async () => {
    setInCorso(true);
    try {
      for (let i = 0; i < daAggiornare.length; i += 50) {
        const lotto = daAggiornare.slice(i, i + 50);
        const esiti = await Promise.all(
          lotto.map((c) => supabase.from("listino_griglia").update({ prezzo_vendita: c.nuovo }).eq("id", c.id)),
        );
        const errore = esiti.find((e) => e.error)?.error;
        if (errore) throw errore;
      }
      await qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.grid(family.id) });
      toast.success(n === 1 ? "Prezzo della cella aggiornato" : `Prezzi di ${n} celle aggiornati`);
    } catch (e) {
      toast.error("Aggiornamento non riuscito", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center">
      <AlertTriangle className="h-4 w-4 shrink-0 max-sm:hidden" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {n === 1 ? "1 cella ha" : `${n} celle hanno`} un prezzo di vendita diverso da costo, sconti e ricarico salvati
        </p>
        <p className="text-xs max-sm:hidden">
          Il preventivo usa il prezzo scritto nella cella: oggi fino al{" "}
          {Math.abs(scarto).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%{" "}
          {scarto > 0 ? "in più" : "in meno"} di quello dei parametri.
          {parametriDaSalvare ? " Salva prima i parametri." : ""}
        </p>
      </div>
      <Button size="sm" variant="outline" className="shrink-0 bg-background" onClick={aggiorna} disabled={inCorso || parametriDaSalvare}>
        {inCorso && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
        Aggiorna i prezzi
      </Button>
    </div>
  );
}
