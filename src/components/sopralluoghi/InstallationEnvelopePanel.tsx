import type { InstallationEnvelope } from "@/lib/surveys/installationEnvelope";
import type { CSSProperties } from "react";
import { DisegnoSerramentoSvg } from "@/components/serramenti/DisegnoSerramentoSvg";

export function InstallationEnvelopePanel({
  data,
}: {
  data: InstallationEnvelope;
}) {
  const entered = data.measurements.filter((m) => m.value != null).length;
  return (
    <details
      className="rounded-xl border border-blue-100 bg-slate-50 p-3"
      open={entered ? true : undefined}
    >
      <summary className="cursor-pointer text-xs font-semibold text-blue-950">
        {data.title} · {entered ? `${entered} quote` : "da rilevare"}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-[11px] text-slate-500">{data.caption}</p>
        {!!data.sketches.length && (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
            {data.sketches.map((s) => (
              <figure
                key={s.title}
                className="rounded-xl border bg-white p-3"
                style={
                  {
                    "--envelope-font": `${Math.max(s.scene.larghezza, s.scene.altezza) * 0.075}px`,
                  } as CSSProperties
                }
              >
                <figcaption className="mb-2 text-[11px] font-medium text-blue-950">
                  {s.title}
                </figcaption>
                <DisegnoSerramentoSvg
                  scena={s.scene}
                  vista="interna"
                  ariaLabel={`${s.title}. ${s.scene.quote.map((q) => q.testo).join(" per ")}. Schema di ingombro.`}
                  className="mx-auto block max-h-40 w-full [&_text]:[font-size:var(--envelope-font)]"
                />
              </figure>
            ))}
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
          {data.measurements.map((m) => (
            <div key={m.key}>
              <dt className="text-[10px] text-slate-500">{m.label}</dt>
              <dd
                className={`text-xs font-medium ${m.value == null ? "text-amber-800" : "text-slate-900"}`}
              >
                {m.value == null
                  ? "Da rilevare"
                  : `${m.value.toLocaleString("it-IT")} mm`}
              </dd>
            </div>
          ))}
        </dl>
        {data.warnings.map((w) => (
          <p
            key={w}
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"
          >
            {w}
          </p>
        ))}
      </div>
    </details>
  );
}
