export interface IndicatoreConfronto {
  label: string;
  valore: number;
  tono?: "verde" | "ambra" | "neutro";
  onClick?: () => void;
  attivo?: boolean;
}
/** Medesima gerarchia e dimensione in conferme, DDT e fatture. */
export function RiepilogoConfronto({ indicatori }: { indicatori: IndicatoreConfronto[] }) {
  const toni = { verde: "border-emerald-200 bg-emerald-50 text-emerald-900", ambra: "border-amber-200 bg-amber-50 text-amber-950", neutro: "border-slate-200 bg-slate-50 text-slate-700" };
  return <div className="grid grid-cols-3 gap-2" aria-label="Riepilogo del confronto">
    {indicatori.map(i => <button key={i.label} type="button" disabled={!i.onClick} onClick={i.onClick}
      aria-pressed={i.onClick ? !!i.attivo : undefined}
      className={`flex min-h-10 min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left disabled:cursor-default ${toni[i.tono || "neutro"]} ${i.attivo ? "ring-2 ring-blue-400" : ""}`}>
      <strong className="text-base tabular-nums">{i.valore}</strong><span className="min-w-0 text-[11px] leading-tight sm:text-xs" title={i.label}>{i.label}</span>
    </button>)}
  </div>;
}
export const CLASSE_DIALOG_CONFRONTO = "flex h-[94dvh] max-h-[94dvh] w-[calc(100vw-1rem)] max-w-[1600px] flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]";
export function PannelliConfrontoMobile({valore,onChange,sinistra,destra}:{valore:string;onChange:(v:string)=>void;sinistra:string;destra:string}) {
 return <div role="group" aria-label="Pannello da visualizzare" className="flex shrink-0 gap-1 border-b bg-slate-50 px-4 py-2 lg:hidden">{[['sinistra',sinistra],['destra',destra]].map(([v,label])=><button key={v} type="button" aria-pressed={valore===v} onClick={()=>onChange(v)} className={`flex-1 rounded-md px-3 py-2 text-xs font-medium ${valore===v?'bg-white text-blue-800 shadow-sm':'text-slate-500'}`}>{label}</button>)}</div>;
}
