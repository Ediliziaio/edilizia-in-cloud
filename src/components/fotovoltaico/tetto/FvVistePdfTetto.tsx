import type { DisegnoCommercialeFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { vistePdfTetto } from "../../../../supabase/functions/_shared/fvVistePdf";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function FvVistePdfTetto({ piano, modificabile, onChange }: { piano: DisegnoCommercialeFv; modificabile: boolean; onChange: (p: DisegnoCommercialeFv) => void }) {
  const t = useT();
  const viste = vistePdfTetto(piano);
  return <fieldset className="mb-3 rounded-xl border bg-slate-50 p-3">
    <legend className="px-1 text-sm font-semibold">{t("Viste del tetto nel PDF")}</legend>
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {([...(piano.mappa ? [["satellite", "Satellite con pannelli"]] : []), ["pianta", "Disegno 2D"], ...(piano.mappa ? [["treD", "Vista 3D"]] : [])] as Array<[keyof typeof viste, string]>).map(([id, label]) => <label key={id} className="inline-flex items-center gap-2"><input type="checkbox" checked={viste[id]} disabled={!modificabile} onChange={e => onChange({ ...piano, vistePdf: { ...viste, [id]: e.target.checked } })}/>{t(label)}</label>)}
    </div>
    <p className="mt-2 text-xs text-slate-600">{t("Il PDF include solo le viste selezionate e disponibili. Attiva il 3D dopo aver verificato la ricostruzione e l’altezza del tetto.")}</p>
  </fieldset>;
}
