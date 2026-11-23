import type { WindowSystem } from "@/lib/surveys/windowSystems";
import { DisegnoSerramentoSvg } from "@/components/serramenti/DisegnoSerramentoSvg";
import { finituraDaEtichetta } from "@/lib/serramenti/finituraSerramento";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
export function WindowSystemPanel({ data }: { data: WindowSystem }) {
  const t = useT();
  return (
    <details open className="rounded-2xl border border-blue-100 bg-white p-3">
      <summary className="min-h-11 cursor-pointer text-sm font-semibold text-blue-950">
        {t(data.title)}
      </summary>
      <div className="space-y-3">
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))",
          }}
        >
          {data.figures.map((f) => (
            <figure
              key={f.title}
              className="min-w-0 rounded-xl border bg-slate-50 p-3"
            >
              <figcaption className="text-xs font-semibold">
                {t(f.title)}
              </figcaption>
              <DisegnoSerramentoSvg
                scena={f.scene}
                finituraInterna={finituraDaEtichetta("#ffffff")}
                finituraEsterna={finituraDaEtichetta("#ffffff")}
                compatto
                className="mx-auto block max-h-64 w-full"
                ariaLabel={`${t(f.title)}. ${t(f.caption)}`}
              />
              <p className="text-[11px] text-slate-500">{t(f.caption)}</p>
            </figure>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {data.measurements.map((m) => (
            <div key={m.key}>
              <dt className="text-[10px] text-slate-500">{t(m.label)}</dt>
              <dd className="text-xs font-medium">
                {m.value == null
                  ? t("Da rilevare")
                  : `${m.value.toLocaleString(intlCampo())} mm`}
              </dd>
            </div>
          ))}
        </dl>
        {data.notes.map((n) => (
          <p key={n} className="text-[11px] text-slate-500">
            {t(n)}
          </p>
        ))}
        {data.checks.map((n) => (
          <p
            key={n}
            role="status"
            className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900"
          >
            {t(n)}
          </p>
        ))}
      </div>
    </details>
  );
}
