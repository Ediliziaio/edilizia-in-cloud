// src/components/orders/generali/unita/MargineUnita.tsx
// Da dove viene il margine dell'unità: ogni riga dice cosa toglie (piano, §3.1 punto 2).
import { Layers3, TrendingUp } from "lucide-react";
import { euro } from "@/components/orders/generali/unita/aspetto";
import { percento } from "@/components/orders/generali/piano/formato";
import { NOMI_CRITERIO, formattaNumero, type ContiUnita } from "@/lib/orders/generali/unitaConti";
import type { UnitaGenerale } from "@/lib/orders/generali/unita";
import { cn } from "@/lib/utils";

export function MargineUnita({ unita: u, conti }: { unita: UnitaGenerale; conti: ContiUnita }) {
  const c = conti.perUnita.get(u.orderId);
  if (!c) return null;
  const descrizionePrezzo = u.rogito !== null ? "Prezzo di rogito" : u.trattato !== null ? "Prezzo trattato" : "Prezzo di listino";
  const descrizioneMargine = u.rogito !== null ? "Margine sul rogito" : u.trattato !== null ? "Margine sul prezzo trattato" : "Margine sul listino";
  const costi = c.prezzo !== null && c.margine !== null ? c.prezzo - c.margine : null;
  const incidenza = c.prezzo !== null && c.prezzo > 0 && c.margine !== null ? c.margine / c.prezzo : null;
  const colore = (c.margine ?? 0) < 0 ? "text-destructive" : (c.margine ?? 0) > 0 ? "text-emerald-700 dark:text-emerald-300" : "";
  const quota = conti.criterio === "uguale"
    ? `una parte su ${conti.pesoTotale}`
    : `${formattaNumero(c.peso)} su ${formattaNumero(conti.pesoTotale)} ${conti.criterio === "millesimi" ? "‰" : conti.criterio === "mq" ? "m²" : "€"}`;
  const righe: { etichetta: string; nota?: string; valore: number | null; segno: "+" | "−" }[] = [
    { etichetta: descrizionePrezzo, valore: c.prezzo === null ? null : Math.round((c.prezzo - c.varianti) * 100) / 100, segno: "+" },
    ...(c.varianti ? [{ etichetta: "Varianti accettate dall'acquirente", valore: c.varianti, segno: "+" as const }] : []),
    { etichetta: "Costi della commessa", nota: u.codice ?? undefined, valore: c.costoDiretto, segno: "−" },
    ...(c.costoEreditato ? [{ etichetta: "Costi dell'unità divisa", nota: "per m²", valore: c.costoEreditato, segno: "−" as const }] : []),
    ...(c.provvigione ? [{ etichetta: "Provvigione agenzia", nota: u.agenzia ?? undefined, valore: c.provvigione, segno: "−" as const }] : []),
    { etichetta: "Quota dei costi comuni", valore: c.quotaComuni, segno: "−" },
  ];
  return (
    <div className="space-y-4">
      <dl aria-label="Riepilogo del margine" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground">{c.varianti ? "Prezzo con varianti" : descrizionePrezzo}</dt>
          <dd className="text-xl font-semibold tabular-nums">{euro(c.prezzo)}</dd>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground">Costi attribuiti</dt>
          <dd className="text-xl font-semibold tabular-nums">{euro(costi)}</dd>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/40">
          <dt className="text-xs text-muted-foreground">{descrizioneMargine}</dt>
          <dd className={cn("flex flex-wrap items-baseline gap-x-2 text-xl font-semibold tabular-nums", colore)}>
            {euro(c.margine)}
            {incidenza !== null && <span className="text-xs font-medium">{percento(incidenza)} del prezzo</span>}
          </dd>
        </div>
      </dl>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section aria-label="Calcolo del margine" className="rounded-lg border bg-card">
          <h3 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
            <TrendingUp className="size-4 text-blue-700 dark:text-blue-300" aria-hidden="true" /> Calcolo del margine
          </h3>
          <dl className="divide-y text-sm">
            {righe.map(r => <div key={r.etichetta} className="flex items-baseline justify-between gap-3 px-4 py-2">
              <dt className="min-w-0">{r.etichetta}
                {r.nota && <span className="ml-1.5 text-xs text-muted-foreground">{r.nota}</span>}
              </dt>
              <dd className="shrink-0 tabular-nums">{r.segno === "−" && r.valore ? "− " : ""}{euro(r.valore)}</dd>
            </div>)}
            <div className="flex items-baseline justify-between gap-3 bg-muted/35 px-4 py-2 font-medium">
              <dt>Margine dell’unità</dt>
              <dd className={cn("tabular-nums", colore)}>{euro(c.margine)}</dd>
            </div>
          </dl>
        </section>
        <section aria-label="Riparto dei costi comuni" className="rounded-lg border bg-card">
          <h3 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
            <Layers3 className="size-4 text-blue-700 dark:text-blue-300" aria-hidden="true" /> Riparto dei costi comuni
          </h3>
          <div className="space-y-3 p-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2"><dt>Costi comuni dell’operazione</dt><dd className="shrink-0 tabular-nums">{euro(conti.costiComuni)}</dd></div>
              <div className="flex justify-between gap-2 text-muted-foreground"><dt>Registrati sulla generale</dt><dd className="shrink-0 tabular-nums">{euro(conti.costiGenerale)}</dd></div>
              {(conti.permute ?? 0) !== 0 && <div className="flex justify-between gap-2 text-muted-foreground"><dt>Terreno in permuta</dt><dd className="shrink-0 tabular-nums">{euro(conti.permute)}</dd></div>}
              {(conti.costiSenzaParti ?? 0) !== 0 && <div className="flex justify-between gap-2 text-muted-foreground"><dt>Unità divise</dt><dd className="shrink-0 tabular-nums">{euro(conti.costiSenzaParti)}</dd></div>}
              <div className="flex justify-between gap-2 border-t pt-2 font-medium"><dt>Quota di {u.sigla}</dt><dd className="shrink-0 tabular-nums">{euro(c.quotaComuni)}</dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">Riparto {NOMI_CRITERIO[conti.criterio]} · {quota}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
