// Quanto costa un'ora di questo mezzo: le spese degli ultimi 12 mesi divise per le ore.
// Non è una spesa: serve a dare a ogni cantiere la sua quota. Solo chi ha il permesso costi.
import { useEffect, useState, type ReactElement } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";

// Funzioni nuove, non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Dettaglio {
  noleggio: boolean; rata?: number; assicurazione?: number; manutenzioni?: number; carburante?: number; altro?: number; totale?: number;
  ore_lavorate?: number; ore_previste?: number | null; ore_usate?: number; calcolato?: number | null; manuale?: number | null; effettivo?: number | null;
}

const VOCI: Array<[keyof Dettaglio, string]> = [["carburante", "Gasolio e carburante"], ["rata", "Rate e canoni"], ["assicurazione", "Assicurazione e bollo"], ["manutenzioni", "Manutenzioni"], ["altro", "Altre spese"]];
const numero = (v: string): number | null => { const t = v.trim().replace(",", "."); return t === "" ? null : Number(t); };

export function MezzoCostoOrario({ mezzoId, puoModificare }: { mezzoId: string; puoModificare: boolean }): ReactElement | null {
  const qc = useQueryClient();
  const chiave = ["mezzo-costo-orario", mezzoId];
  const { data, isLoading, isError } = useQuery({
    queryKey: chiave,
    retry: false,
    queryFn: async (): Promise<Dettaglio> => {
      const { data: d, error } = await db.rpc("mezzo_costo_orario_leggi", { p_mezzo: mezzoId });
      if (error) throw error;
      return d as Dettaglio;
    },
  });
  const [manuale, setManuale] = useState("");
  const [previste, setPreviste] = useState("");
  useEffect(() => {
    setManuale(data?.manuale != null ? String(data.manuale).replace(".", ",") : "");
    setPreviste(data?.ore_previste != null ? String(data.ore_previste) : "");
  }, [data?.manuale, data?.ore_previste]);
  const salva = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("mezzo_costo_orario_salva", { p_mezzo: mezzoId, p_manuale: numero(manuale), p_ore_previste: numero(previste) });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Costo orario salvato"); void qc.invalidateQueries({ queryKey: chiave }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isLoading || isError || !data) return null;
  if (data.noleggio) {
    return <p className="mb-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Mezzo a noleggio: il costo arriva dalla fattura, non ha un costo orario interno.</p>;
  }
  const valido = [numero(manuale), numero(previste)].every((n) => n === null || (Number.isFinite(n) && n >= 0)) && numero(previste) !== 0;
  return (
    <section aria-label="Costo orario del mezzo" className="mb-3 rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Costo orario</h3>
        <p className="text-lg font-bold tabular-nums">{data.effettivo != null ? `${formatCurrency(Number(data.effettivo))}/h` : "Da completare"}</p>
      </div>
      <ul className="mt-2 divide-y">
        {VOCI.filter(([k]) => Number(data[k] ?? 0) !== 0).map(([k, nome]) => (
          <li key={k} className="flex justify-between py-1"><span className="text-muted-foreground">{nome}</span><span className="tabular-nums">{formatCurrency(Number(data[k]))}</span></li>
        ))}
        <li className="flex justify-between py-1 font-medium"><span>Spese degli ultimi 12 mesi</span><span className="tabular-nums">{formatCurrency(Number(data.totale ?? 0))}</span></li>
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">
        Diviso {Number(data.ore_usate ?? 0).toLocaleString("it-IT")} ore
        {Number(data.ore_lavorate ?? 0) < Number(data.ore_usate ?? 0) ? ` previste (dai rapportini ne risultano ${Number(data.ore_lavorate ?? 0).toLocaleString("it-IT")})` : " lavorate"}.
        {" "}Il gasolio viene dalle fatture collegate con la targa. L’acquisto del mezzo non è contato.
      </p>
      {puoModificare && (
        <div className="mt-3 grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <div className="grid gap-1"><Label htmlFor="mezzo-manuale" className="text-xs">Costo orario scritto a mano</Label><Input id="mezzo-manuale" className="h-9" inputMode="decimal" placeholder={data.calcolato != null ? `Calcolato: ${String(data.calcolato).replace(".", ",")}` : "€/h"} value={manuale} onChange={(e) => setManuale(e.target.value)} /></div>
          <div className="grid gap-1"><Label htmlFor="mezzo-previste" className="text-xs">Ore previste all’anno</Label><Input id="mezzo-previste" className="h-9" inputMode="numeric" placeholder="800" value={previste} onChange={(e) => setPreviste(e.target.value)} /></div>
          <Button size="sm" className="h-9" disabled={!valido || salva.isPending} onClick={() => salva.mutate()}>{salva.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Salva</Button>
        </div>
      )}
    </section>
  );
}
