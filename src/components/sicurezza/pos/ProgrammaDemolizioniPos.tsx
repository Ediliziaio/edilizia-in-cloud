import { Button } from "@/components/ui/button";
import { Area } from "./campi";
import { programmaDemolizioniVuoto, type ProgrammaDemolizioniPos as Programma } from "../../../../supabase/functions/_shared/posModello";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function ProgrammaDemolizioniPos({ valore, id, preposti, ro, cambia }: {
  id: string; valore?: Programma; preposti: string[]; ro: boolean; cambia: (p: Programma) => void;
}) {
  const t = useT();
  if (!valore) return !ro && <div className="sm:col-span-2">
    <Button type="button" variant="outline" size="sm" onClick={() => cambia(programmaDemolizioniVuoto())}>
      {t("Aggiungi programma delle demolizioni")}
    </Button>
  </div>;

  const persone = [...new Set([...preposti.filter(Boolean), ...(valore.preposto ? [valore.preposto] : [])])];
  return (
    <fieldset className="grid gap-3 rounded-lg border bg-background p-3 sm:col-span-2 sm:grid-cols-2">
      <legend className="px-1 text-sm font-semibold">{t("Programma delle demolizioni")}</legend>
      <p className="text-xs text-muted-foreground sm:col-span-2">{t("Per le demolizioni disciplinate dall’art. 151 registra la successione effettiva dei lavori e il preposto che li sorveglia.")}</p>
      <label className="block space-y-1 text-xs font-medium">
        <span>{t("Applicabilità del programma")}</span>
        <select className="block min-h-9 w-full rounded-md border bg-background px-2" disabled={ro} value={valore.applicabilita}
          onChange={e => cambia({ ...valore, applicabilita: e.target.value as Programma["applicabilita"] })}>
          <option value="da_valutare">{t("Da valutare")}</option><option value="si">{t("Applicabile")}</option><option value="no">{t("Non applicabile")}</option>
        </select>
      </label>
      {valore.applicabilita === "si" && <>
        <label className="block space-y-1 text-xs font-medium">
          <span>{t("Preposto alla sorveglianza")}</span>
          <select className="block min-h-9 w-full rounded-md border bg-background px-2" disabled={ro} value={valore.preposto}
            onChange={e => cambia({ ...valore, preposto: e.target.value })}>
            <option value="">{t("Scegli tra i preposti del POS")}</option>
            {persone.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <Area id={`${id}-sequenza`} label={t("Successione delle demolizioni")} rows={5} className="sm:col-span-2" readOnly={ro}
          value={valore.sequenza} onChange={sequenza => cambia({ ...valore, sequenza })} />
      </>}
      {valore.applicabilita === "no" && <Area id={`${id}-motivo`} label={t("Motivo della non applicabilità")} rows={2} readOnly={ro}
        value={valore.motivo} onChange={motivo => cambia({ ...valore, motivo })} />}
    </fieldset>
  );
}
