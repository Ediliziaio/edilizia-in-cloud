import {
  savedRenderChoices,
  savedRenderSamples,
} from "@/lib/render/renderSavedChoices";
import { ReferenceThumb } from "./ReferenceThumb";

export function RenderSavedChoices({
  config,
  comparisonKeys,
}: {
  config: unknown;
  comparisonKeys?: Set<string>;
}) {
  const choices = savedRenderChoices(config);
  const samples = savedRenderSamples(config);
  const groups = new Map<string, typeof choices>();
  for (const choice of choices)
    groups.set(choice.group, [...(groups.get(choice.group) ?? []), choice]);
  return (
    <section
      aria-label="Scelte salvate di questo render"
      className="space-y-4 rounded-xl border bg-card p-4"
    >
      <div>
        <h2 className="text-base font-semibold">Scelte di questo render</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Valori registrati con questa immagine, anche se il progetto è stato
          aggiornato.
        </p>
      </div>
      {!choices.length && (
        <p className="text-sm text-muted-foreground">
          Non sono disponibili scelte dettagliate per questo render.
        </p>
      )}
      {[...groups].map(([group, values], index) => (
        <details key={group} open={index < 2} className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {group}
          </summary>
          <dl className="mt-3 space-y-3">
            {values.map((choice) => (
              <div
                key={choice.key}
                className={
                  comparisonKeys?.has(choice.key)
                    ? "rounded bg-amber-50 p-2 ring-1 ring-amber-200"
                    : ""
                }
              >
                <dt className="text-[11px] text-muted-foreground">
                  {choice.label}
                </dt>
                <dd className="mt-0.5 flex items-start gap-2 break-words text-sm">
                  {choice.color && (
                    <span
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border"
                      style={{ backgroundColor: choice.color }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {choice.value}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
      {!!samples.length && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            Campioni di catalogo delle scelte salvate
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {samples.map((sample) => (
              <figure
                key={sample.id}
                className="overflow-hidden rounded-lg border"
              >
                <div className="aspect-square bg-muted">
                  <ReferenceThumb photo={sample.photo} alt={sample.label} />
                </div>
                <figcaption className="p-1.5 text-[10px] leading-tight">
                  {sample.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
