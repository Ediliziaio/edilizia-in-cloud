import { DisegnoSerramentoSvg } from "@/components/serramenti/DisegnoSerramentoSvg";
import type { WindowAbaco } from "@/lib/surveys/windowAbaco";

const mm = (v: number | null) =>
  v == null ? "Da rilevare" : `${v.toLocaleString("it-IT")} mm`;
export function WindowAbacoPanel({
  abaco,
  defaultOpen = true,
}: {
  abaco: WindowAbaco;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-2xl border border-blue-100 bg-white"
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
        Abaco tecnico · misure e posa
      </summary>
      <div className="space-y-3 px-3 pb-3">
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-[11px] sm:text-xs">
            <caption className="sr-only">
              Misure indipendenti: larghezza e altezza, in millimetri
            </caption>
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th scope="col" className="p-2 font-medium">
                  Riferimento
                </th>
                <th scope="col" className="p-2 font-medium">
                  Larghezza
                </th>
                <th scope="col" className="p-2 font-medium">
                  Altezza
                </th>
              </tr>
            </thead>
            <tbody>
              {abaco.measurements.map((m) => (
                <tr key={m.label} className="border-t border-slate-100">
                  <th scope="row" className="p-2 font-medium text-slate-700">
                    {m.label}
                  </th>
                  <td className="p-2 tabular-nums">{mm(m.width)}</td>
                  <td className="p-2 tabular-nums">{mm(m.height)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
          }}
        >
          {abaco.figures.map((f) => (
            <figure
              key={f.title}
              className="min-w-0 rounded-xl bg-slate-50 p-3"
            >
              <figcaption className="text-xs font-semibold text-slate-800">
                {f.title}
              </figcaption>
              <div className="mt-2 [&>svg]:!h-52 [&>svg]:!w-full [&_polygon]:fill-slate-100 [&_polygon]:stroke-slate-600 [&_polygon]:[vector-effect:non-scaling-stroke] [&_polygon]:[stroke-width:0.75px] [&_rect]:fill-slate-200 [&_rect]:stroke-slate-600 [&_rect]:[vector-effect:non-scaling-stroke] [&_rect]:[stroke-width:0.75px] [&_polyline[stroke-opacity]]:stroke-slate-600 [&_polyline[stroke-opacity]]:[vector-effect:non-scaling-stroke] [&_polyline[stroke-opacity]]:[stroke-width:0.75px]">
                <DisegnoSerramentoSvg
                  scena={f.scene}
                  compatto
                  ariaLabel={`${f.title}. Schema illustrativo non in scala. ${f.caption}`}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                {f.caption}
              </p>
            </figure>
          ))}
        </div>
        {abaco.notes.map((n, i) => (
          <p
            key={n}
            className={
              i
                ? "rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900"
                : "text-[11px] leading-relaxed text-slate-500"
            }
          >
            {n}
          </p>
        ))}
      </div>
    </details>
  );
}
