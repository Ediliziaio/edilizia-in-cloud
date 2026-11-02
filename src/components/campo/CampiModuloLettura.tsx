/** I campi propri di un rapportino già scritto: etichetta e valore come erano allora, anche se il modello è cambiato. */
import { valoreInTesto, type ValoreCampo } from "../../../supabase/functions/_shared/moduliCantiere";

export function CampiModuloLettura({ valori, titolo = "Altre informazioni" }: { valori: ValoreCampo[]; titolo?: string }) {
  if (valori.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titolo}</p>
      <dl className="mt-1.5 divide-y overflow-hidden rounded-xl border bg-white">
        {valori.map((v) => (
          <div key={`${v.chiave}@${v.phase_id ?? ""}`} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
            <dt className="min-w-0 text-slate-600">{v.etichetta}{v.fase_nome ? ` · ${v.fase_nome}` : ""}</dt>
            <dd className="min-w-0 break-words text-right font-medium text-slate-900">{valoreInTesto(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
