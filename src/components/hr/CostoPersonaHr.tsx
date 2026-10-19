/**
 * Costo della persona per le commesse, nel Personale (26/09/2026, Florin: «il
 * costo dell'operaio non lo devo vedere in Manodopera ma nel Personale, perché
 * lì hanno accesso tutti»). Lo legge e lo scrive solo chi vede il Personale.
 *
 * Non è un <form>: sta dentro il modulo della scheda, che ha il suo «Salva».
 */
import { useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { messaggioErroreOperai, useCostoPersona, useSalvaCostoPersona } from "@/hooks/useOperai";
import { formatCurrency } from "@/lib/formatters";
import { usePermissions } from "@/hooks/usePermissions";
import { FullLaborCostCalculator } from "@/components/hr/FullLaborCostCalculator";
import { HrLaborReconciliation } from "@/components/hr/HrLaborReconciliation";
import type { HrCostSaveDraft } from "@/lib/personale/laborCostPlan";
import { ETICHETTA_PROFILO, type ProfiloCosto } from "@/lib/costoPersonale";

const testo = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

export function CostoPersonaHr({ profiloId }: { profiloId: string }) {
  const { data, isLoading, error } = useCostoPersona(profiloId);
  const salva = useSalvaCostoPersona(profiloId);
  const permissions = usePermissions();
  const tipo = (data?.tipo && data.tipo in ETICHETTA_PROFILO ? data.tipo : null) as ProfiloCosto | null;
  const server = {
    costo_orario: testo(data?.costo_orario_scritto), stipendio_lordo: testo(data?.stipendio_lordo),
    ore_mese: testo(data?.ore_mese), contributi_percento: testo(data?.contributi_percento),
  };
  const [edit, setEdit] = useState<{ values: typeof server; baseline: typeof server } | null>(null);
  const v = edit?.values ?? server;
  const dirty = !!edit && JSON.stringify(edit.values) !== JSON.stringify(edit.baseline);
  const remoteChange = !!edit && JSON.stringify(server) !== JSON.stringify(edit.baseline);
  const canEdit = permissions.canViewPersone && !permissions.solaLettura && !permissions.isLoading;
  const change = (key: keyof typeof server, value: string) => setEdit(old => ({ baseline: old?.baseline ?? server, values: { ...(old?.values ?? server), [key]: value } }));

  // Chi non vede il Personale non riceve il dato: niente riquadro.
  if (!permissions.canViewPersone || permissions.isLoading) return null;
  if (error) return <p role="alert" className="text-sm text-destructive">Costo della persona non disponibile. Chiudi e riapri la scheda per riprovare.</p>;

  const campo = (k: keyof typeof v) => ({
    id: `costo-${k}`,
    value: v[k],
    inputMode: "decimal" as const,
    disabled: !canEdit || salva.isPending || isLoading,
    onChange: (e: { target: { value: string } }) => change(k, e.target.value),
  });

  const conferma = () => {
    if (!canEdit || remoteChange || salva.isPending || !edit) return;
    const patch: HrCostSaveDraft = {};
    for (const key of Object.keys(v) as (keyof typeof v)[]) if (v[key] !== edit.baseline[key]) patch[key] = v[key];
    if (!Object.keys(patch).length) { setEdit(null); return; }
    salva.mutate(patch, {
      onSuccess: () => { setEdit(null); toast.success("Costo aggiornato per i prossimi rapportini"); },
      onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito a salvare il costo. Riprova tra qualche secondo.")),
    });
  };

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
        <div className="space-y-1"><Label htmlFor="costo-ore_mese">Ore al mese</Label><Input {...campo("ore_mese")} placeholder="Es. 173" /></div>
        <div className="space-y-1"><Label htmlFor="costo-contributi_percento">INPS ditta (%)</Label><Input {...campo("contributi_percento")} placeholder={data?.inps_del_tipo != null ? testo(data.inps_del_tipo) : ""} /></div>
        <div className="space-y-1"><Label htmlFor="costo-costo_orario">Oppure costo orario (€)</Label><Input {...campo("costo_orario")} placeholder="Es. 24,50" /></div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Se scrivi il costo orario vale quello. Altrimenti lo calcoliamo da lordo e ore, con mensilità,
          INAIL, Cassa Edile e TFR {tipo ? `dell’${ETICHETTA_PROFILO[tipo].toLowerCase()}` : "del tipo di dipendente"}; l’INPS vuoto vale quello del tipo.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={conferma} disabled={!canEdit || !dirty || remoteChange || salva.isPending || isLoading} className="shrink-0 gap-1.5">
          {salva.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}Salva il costo
        </Button>
      </div>
      {remoteChange && <div role="alert" className="text-sm text-amber-800">Il costo è cambiato mentre scrivevi. La bozza è conservata; rileggi i dati aggiornati prima di salvare.
        <Button type="button" variant="outline" size="sm" className="mt-2 block" onClick={() => setEdit(null)}>Rileggi e scarta la bozza</Button>
      </div>}
      <FullLaborCostCalculator disabled={!canEdit || salva.isPending || isLoading || remoteChange} onPropose={rate => change("costo_orario", testo(rate))} />
      {permissions.canViewCosts && <HrLaborReconciliation profiloId={profiloId} />}
    </div>
  );
}
