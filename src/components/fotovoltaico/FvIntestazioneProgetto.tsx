import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function FvIntestazioneProgetto({ titolo, numero, indirizzo, stato, azioni, conversione }: {
  titolo: string; numero: string; indirizzo: string; stato: ReactNode; azioni: ReactNode; conversione: ReactNode;
}) {
  return <header className="border-b border-slate-200 bg-white text-slate-900">
    <div className="mx-auto max-w-[1400px] space-y-3 px-4 py-5 sm:px-8">
      <Link to="/azienda/marketing/fotovoltaico" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={16}/>Progetti fotovoltaici</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><p className="mb-1 hidden text-xs font-semibold uppercase tracking-wider text-slate-500 lg:block">Preventivo fotovoltaico</p>
          <div className="flex flex-wrap items-center gap-2"><h1 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">{titolo}</h1>{stato}</div>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600"><span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs">{numero}</span><span>{indirizzo}</span></p>
        </div>
        <div className="flex flex-wrap gap-2 max-lg:w-full">{azioni}</div>
      </div>
    </div>
    <div className="mx-auto max-w-[1400px] px-4 pb-5 sm:px-8">{conversione}</div>
  </header>;
}
