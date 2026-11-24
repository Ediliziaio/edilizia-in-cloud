import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DisegnoCommercialeFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { dataMisuraValida, improntaMisureFv, statoMisureFv } from "../../../../supabase/functions/_shared/fvVerificaMisure";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export function FvVerificaMisure({ piano, modificabile, onChange }: {
  piano: DisegnoCommercialeFv; modificabile: boolean; onChange: (p: DisegnoCommercialeFv) => void;
}) {
  const t = useT();
  const stato = statoMisureFv(piano);
  const [fonte, setFonte] = useState<"sopralluogo" | "rilievo">("sopralluogo");
  const [data, setData] = useState("");
  const [conferma, setConferma] = useState(false);
  const foto = piano.mappa?.fotoSolar;
  return <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
    <summary className="cursor-pointer font-semibold">{stato.confermata ? t("Misure confrontate con il rilievo") : t("Misure da verificare")}</summary>
    <p className="mt-2 text-xs text-slate-600">{stato.testo}</p>
    <dl className="my-3 space-y-2 text-xs">
      <div><dt className="text-slate-500">{t("Contorni e distanze")}</dt><dd>{piano.mappa ? t("Disegnati sulla mappa, in scala geografica") : t("Disegno metrico dell’operatore")}</dd></div>
      <div><dt className="text-slate-500">{t("Pendenze")}</dt><dd>{stato.pendenze}</dd></div>
      <div><dt className="text-slate-500">{t("Altezza alla gronda")}</dt><dd>{stato.altezza == null ? t("Non indicata: la vista 3D usa un’altezza illustrativa") : t("{altezza} m · quota inserita nel modello", { altezza: stato.altezza.toLocaleString(intlCampo()) })}</dd></div>
      {foto && <div><dt className="text-slate-500">{t("Foto Google Solar")}</dt><dd>{t("{valore} · {valore2} cm/pixel. La data della foto non certifica lo stato attuale del tetto.", { valore: new Date(`${foto.data}T12:00:00`).toLocaleDateString(intlCampo()), valore2: Math.round(foto.risoluzione * 100) })}</dd></div>}
    </dl>
    {modificabile && !stato.confermata && <div className="space-y-3 border-t pt-3">
      <label className="block text-xs">{t("Fonte del confronto")}<select aria-label={t("Fonte della verifica misure")} value={fonte} className="mt-1 w-full rounded border bg-white p-2" onChange={e => setFonte(e.target.value as typeof fonte)}><option value="sopralluogo">{t("Sopralluogo")}</option><option value="rilievo">{t("Rilievo disponibile")}</option></select></label>
      <label className="block text-xs">{t("Data del sopralluogo o rilievo")}<input aria-label={t("Data della verifica misure")} type="date" max={new Date().toLocaleDateString("en-CA")} value={data} className="mt-1 w-full rounded border p-2" onChange={e => setData(e.target.value)} /></label>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={conferma} onChange={e => setConferma(e.target.checked)} />{t("Ho confrontato contorni, pendenze e altezza con questa fonte.")}</label>
      <Button type="button" variant="outline" className="w-full whitespace-normal" disabled={!conferma || !dataMisuraValida(data) || data > new Date().toLocaleDateString("en-CA") || stato.altezza == null} onClick={() => onChange({ ...piano, confermaMisure: { firma: improntaMisureFv(piano), fonte, data } })}>{t("Registra il confronto delle misure")}</Button>
      {stato.altezza == null && <p className="text-xs text-amber-800">{t("Indica prima l’altezza nella vista 3D della fase Impianto.")}</p>}
    </div>}
  </details>;
}
