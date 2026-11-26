
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export interface IndicatoreConfronto {
  label: string;
  valore: number;
  tono?: "verde" | "ambra" | "neutro";
  onClick?: () => void;
  attivo?: boolean;
}
/** Medesima gerarchia e dimensione in conferme, DDT e fatture.
 *  Compatti dal 26/11/2026: in quelle finestre quello che conta è il documento, e tre
 *  riquadri alti 2.5rem lo spingevano sotto la metà dello schermo. */
export function RiepilogoConfronto({ indicatori }: { indicatori: IndicatoreConfronto[] }) {
  const t = useT();
  const toni = { verde: "border-emerald-200 bg-emerald-50 text-emerald-900", ambra: "border-amber-200 bg-amber-50 text-amber-950", neutro: "border-slate-200 bg-slate-50 text-slate-700" };
  return <div className="grid grid-cols-3 gap-2" aria-label={t("Riepilogo del confronto")}>
    {indicatori.map(i => <button key={i.label} type="button" disabled={!i.onClick} onClick={i.onClick}
      aria-pressed={i.onClick ? !!i.attivo : undefined}
      className={`flex min-h-8 min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-left disabled:cursor-default ${toni[i.tono || "neutro"]} ${i.attivo ? "ring-2 ring-blue-400" : ""}`}>
      <strong className="text-sm tabular-nums">{i.valore}</strong><span className="min-w-0 text-[11px] leading-tight" title={i.label}>{i.label}</span>
    </button>)}
  </div>;
}
export const CLASSE_DIALOG_CONFRONTO = "top-1/2 flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[1600px] flex-col gap-0 overflow-hidden rounded-lg p-0 sm:h-[94dvh] sm:max-h-[94dvh] sm:w-[calc(100vw-2rem)]";
export function PannelliConfrontoMobile({valore,onChange,sinistra,destra}:{valore:string;onChange:(v:string)=>void;sinistra:string;destra:string}) {
  const t = useT();
 return <div role="group" aria-label={t("Pannello da visualizzare")} className="flex shrink-0 gap-1 border-b bg-slate-50 px-4 py-2 lg:hidden">{[['sinistra',sinistra],['destra',destra]].map(([v,label])=><button key={v} type="button" aria-pressed={valore===v} onClick={()=>onChange(v)} className={`flex-1 rounded-md px-3 py-2 text-xs font-medium ${valore===v?'bg-white text-blue-800 shadow-sm':'text-slate-500'}`}>{label}</button>)}</div>;
}
