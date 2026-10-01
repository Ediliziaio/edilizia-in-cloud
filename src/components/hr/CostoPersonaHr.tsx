/**
 * Costo della persona per le commesse, nel Personale (26/09/2026, Florin: «il
 * costo dell'operaio non lo devo vedere in Manodopera ma nel Personale, perché
 * lì hanno accesso tutti»). Lo legge e lo scrive solo chi vede il Personale.
 *
 * Non è un <form>: sta dentro il modulo della scheda, che ha il suo «Salva».
 */
import { useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { messaggioErroreOperai, useCostoPersona, useSalvaCostoPersona } from "@/hooks/useOperai";
import { formatCurrency } from "@/lib/formatters";

const testo = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

export function CostoPersonaHr({ profiloId }: { profiloId: string }) {
  const { data, isLoading, error } = useCostoPersona(profiloId);
  const salva = useSalvaCostoPersona(profiloId);
  const [v, setV] = useState({ costo_orario: "", stipendio_lordo: "", ore_mese: "", contributi_percento: "" });

  useEffect(() => {
    if (!data) return;
    setV({
      costo_orario: testo(data.costo_orario_scritto),
      stipendio_lordo: testo(data.stipendio_lordo),
      ore_mese: testo(data.ore_mese),
      contributi_percento: testo(data.contributi_percento),
    });
  }, [data]);

  // Chi non vede il Personale non riceve il dato: niente riquadro.
  if (error) return null;

  const campo = (k: keyof typeof v) => ({
    id: `costo-${k}`,
    value: v[k],
    inputMode: "decimal" as const,
    onChange: (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value })),
  });

  const conferma = () =>
    salva.mutate(v, {
      onSuccess: () => toast.success("Costo aggiornato"),
      onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito a salvare il costo. Riprova tra qualche secondo.")),
    });

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Wallet className="h-4 w-4 text-orange-600" aria-hidden="true" />Costo per le commesse
          </h4>
          <p className="text-xs text-muted-foreground">Lo vede solo chi ha accesso al Personale. Serve a dare un costo alle ore sulle commesse.</p>
        </div>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <p className="shrink-0 text-right">
            <span className="block text-lg font-bold tabular-nums text-slate-900">{data?.costo_orario ? formatCurrency(data.costo_orario) : "—"}</span>
            <span className="block text-[11px] text-muted-foreground">{data?.costo_orario ? "all'ora" : "da scrivere"}</span>
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1"><Label htmlFor="costo-stipendio_lordo">Lordo al mese (€)</Label><Input {...campo("stipendio_lordo")} placeholder="Es. 2.100" /></div>
        <div className="space-y-1"><Label htmlFor="costo-ore_mese">Ore al mese</Label><Input {...campo("ore_mese")} placeholder="Es. 168" /></div>
        <div className="space-y-1"><Label htmlFor="costo-contributi_percento">Contributi (%)</Label><Input {...campo("contributi_percento")} placeholder="28" /></div>
        <div className="space-y-1"><Label htmlFor="costo-costo_orario">Oppure costo orario (€)</Label><Input {...campo("costo_orario")} placeholder="Es. 24,50" /></div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Se scrivi il costo orario vale quello; altrimenti lo calcoliamo da lordo, contributi e ore.</p>
        <Button type="button" size="sm" variant="outline" onClick={conferma} disabled={salva.isPending || isLoading} className="shrink-0 gap-1.5">
          {salva.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}Salva il costo
        </Button>
      </div>
    </div>
  );
}
