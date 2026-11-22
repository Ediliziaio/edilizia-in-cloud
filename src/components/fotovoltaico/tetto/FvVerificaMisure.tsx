import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DisegnoCommercialeFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { dataMisuraValida, improntaMisureFv, statoMisureFv } from "../../../../supabase/functions/_shared/fvVerificaMisure";

export function FvVerificaMisure({ piano, modificabile, onChange }: {
  piano: DisegnoCommercialeFv; modificabile: boolean; onChange: (p: DisegnoCommercialeFv) => void;
}) {
  const stato = statoMisureFv(piano);
  const [fonte, setFonte] = useState<"sopralluogo" | "rilievo">("sopralluogo");
  const [data, setData] = useState("");
  const [conferma, setConferma] = useState(false);
  const foto = piano.mappa?.fotoSolar;
  return <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
    <summary className="cursor-pointer font-semibold">{stato.confermata ? "Misure confrontate con il rilievo" : "Misure da verificare"}</summary>
    <p className="mt-2 text-xs text-slate-600">{stato.testo}</p>
    <dl className="my-3 space-y-2 text-xs">
      <div><dt className="text-slate-500">Contorni e distanze</dt><dd>{piano.mappa ? "Disegnati sulla mappa, in scala geografica" : "Disegno metrico dell’operatore"}</dd></div>
      <div><dt className="text-slate-500">Pendenze</dt><dd>{stato.pendenze}</dd></div>
      <div><dt className="text-slate-500">Altezza alla gronda</dt><dd>{stato.altezza == null ? "Non indicata: la vista 3D usa un’altezza illustrativa" : `${stato.altezza.toLocaleString("it-IT")} m · quota inserita nel modello`}</dd></div>
      {foto && <div><dt className="text-slate-500">Foto Google Solar</dt><dd>{new Date(`${foto.data}T12:00:00`).toLocaleDateString("it-IT")} · {Math.round(foto.risoluzione * 100)} cm/pixel. La data della foto non certifica lo stato attuale del tetto.</dd></div>}
    </dl>
    {modificabile && !stato.confermata && <div className="space-y-3 border-t pt-3">
      <label className="block text-xs">Fonte del confronto<select aria-label="Fonte della verifica misure" value={fonte} className="mt-1 w-full rounded border bg-white p-2" onChange={e => setFonte(e.target.value as typeof fonte)}><option value="sopralluogo">Sopralluogo</option><option value="rilievo">Rilievo disponibile</option></select></label>
      <label className="block text-xs">Data del sopralluogo o rilievo<input aria-label="Data della verifica misure" type="date" max={new Date().toLocaleDateString("en-CA")} value={data} className="mt-1 w-full rounded border p-2" onChange={e => setData(e.target.value)} /></label>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={conferma} onChange={e => setConferma(e.target.checked)} />Ho confrontato contorni, pendenze e altezza con questa fonte.</label>
      <Button type="button" variant="outline" className="w-full whitespace-normal" disabled={!conferma || !dataMisuraValida(data) || data > new Date().toLocaleDateString("en-CA") || stato.altezza == null} onClick={() => onChange({ ...piano, confermaMisure: { firma: improntaMisureFv(piano), fonte, data } })}>Registra il confronto delle misure</Button>
      {stato.altezza == null && <p className="text-xs text-amber-800">Indica prima l’altezza nella vista 3D della fase Impianto.</p>}
    </div>}
  </details>;
}
