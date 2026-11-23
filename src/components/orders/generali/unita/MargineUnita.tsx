// src/components/orders/generali/unita/MargineUnita.tsx
// Da dove viene il margine dell'unità: ogni riga dice cosa toglie (piano, §3.1 punto 2).
import { Layers3, TrendingUp } from "lucide-react";
import { euro } from "@/components/orders/generali/unita/aspetto";
import { percento } from "@/components/orders/generali/piano/formato";
import { NOMI_CRITERIO, formattaNumero, type ContiUnita } from "@/lib/orders/generali/unitaConti";
import type { UnitaGenerale } from "@/lib/orders/generali/unita";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function MargineUnita({ unita: u, conti }: { unita: UnitaGenerale; conti: ContiUnita }) {
  const t = useT();
  const c = conti.perUnita.get(u.orderId);
  if (!c) return null;
  const descrizionePrezzo = u.rogito !== null ? t("Prezzo di rogito") : u.trattato !== null ? t("Prezzo trattato") : t("Prezzo di listino");
  const descrizioneMargine = u.rogito !== null ? t("Margine sul rogito") : u.trattato !== null ? t("Margine sul prezzo trattato") : t("Margine sul listino");
  const costi = c.prezzo !== null && c.margine !== null ? c.prezzo - c.margine : null;
  const incidenza = c.prezzo !== null && c.prezzo > 0 && c.margine !== null ? c.margine / c.prezzo : null;
  const colore = (c.margine ?? 0) < 0 ? "text-destructive" : (c.margine ?? 0) > 0 ? "text-emerald-700 dark:text-emerald-300" : "";
  const quota = conti.criterio === "uguale"
    ? t("una parte su {totale}", { totale: conti.pesoTotale })
    : t("{peso} su {totale} {unita}", { peso: formattaNumero(c.peso), totale: formattaNumero(conti.pesoTotale), unita: conti.criterio === "millesimi" ? "‰" : conti.criterio === "mq" ? "m²" : "€" });
  const righe: { etichetta: string; nota?: string; valore: number | null; segno: "+" | "−" }[] = [
    { etichetta: descrizionePrezzo, valore: c.prezzo === null ? null : Math.round((c.prezzo - c.varianti) * 100) / 100, segno: "+" },
    ...(c.varianti ? [{ etichetta: t("Varianti accettate dall'acquirente"), valore: c.varianti, segno: "+" as const }] : []),
    { etichetta: t("Costi della commessa"), nota: u.codice ?? undefined, valore: c.costoDiretto, segno: "−" },
    ...(c.costoEreditato ? [{ etichetta: t("Costi dell'unità divisa"), nota: t("per m²"), valore: c.costoEreditato, segno: "−" as const }] : []),
    ...(c.provvigione ? [{ etichetta: t("Provvigione agenzia"), nota: u.agenzia ?? undefined, valore: c.provvigione, segno: "−" as const }] : []),
    { etichetta: t("Quota dei costi comuni"), valore: c.quotaComuni, segno: "−" },
  ];
  return (
    <div className="space-y-4">
      <dl aria-label={t("Riepilogo del margine")} className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground">{c.varianti ? t("Prezzo con varianti") : descrizionePrezzo}</dt>
          <dd className="text-xl font-semibold tabular-nums">{euro(c.prezzo)}</dd>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground">{t("Costi attribuiti")}</dt>
          <dd className="text-xl font-semibold tabular-nums">{euro(costi)}</dd>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/40">
          <dt className="text-xs text-muted-foreground">{descrizioneMargine}</dt>
          <dd className={cn("flex flex-wrap items-baseline gap-x-2 text-xl font-semibold tabular-nums", colore)}>
            {euro(c.margine)}
            {incidenza !== null && <span className="text-xs font-medium">{t("{incidenza} del prezzo", { incidenza: String(percento(incidenza) ?? "") })}</span>}
          </dd>
        </div>
      </dl>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section aria-label={t("Calcolo del margine")} className="rounded-lg border bg-card">
          <h3 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
            <TrendingUp className="size-4 text-blue-700 dark:text-blue-300" aria-hidden="true" /> {t("Calcolo del margine")}
          </h3>
          <dl className="divide-y text-sm">
            {righe.map(r => <div key={r.etichetta} className="flex items-baseline justify-between gap-3 px-4 py-2">
              <dt className="min-w-0">{r.etichetta}
                {r.nota && <span className="ml-1.5 text-xs text-muted-foreground">{r.nota}</span>}
              </dt>
              <dd className="shrink-0 tabular-nums">{r.segno === "−" && r.valore ? "− " : ""}{euro(r.valore)}</dd>
            </div>)}
            <div className="flex items-baseline justify-between gap-3 bg-muted/35 px-4 py-2 font-medium">
              <dt>{t("Margine dell’unità")}</dt>
              <dd className={cn("tabular-nums", colore)}>{euro(c.margine)}</dd>
            </div>
          </dl>
        </section>
        <section aria-label={t("Riparto dei costi comuni")} className="rounded-lg border bg-card">
          <h3 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
            <Layers3 className="size-4 text-blue-700 dark:text-blue-300" aria-hidden="true" /> {t("Riparto dei costi comuni")}
          </h3>
          <div className="space-y-3 p-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2"><dt>{t("Costi comuni dell’operazione")}</dt><dd className="shrink-0 tabular-nums">{euro(conti.costiComuni)}</dd></div>
              <div className="flex justify-between gap-2 text-muted-foreground"><dt>{t("Registrati sulla generale")}</dt><dd className="shrink-0 tabular-nums">{euro(conti.costiGenerale)}</dd></div>
              {(conti.permute ?? 0) !== 0 && <div className="flex justify-between gap-2 text-muted-foreground"><dt>{t("Terreno in permuta")}</dt><dd className="shrink-0 tabular-nums">{euro(conti.permute)}</dd></div>}
              {(conti.costiSenzaParti ?? 0) !== 0 && <div className="flex justify-between gap-2 text-muted-foreground"><dt>{t("Unità divise")}</dt><dd className="shrink-0 tabular-nums">{euro(conti.costiSenzaParti)}</dd></div>}
              <div className="flex justify-between gap-2 border-t pt-2 font-medium"><dt>{t("Quota di {sigla}", { sigla: String(u.sigla ?? "") })}</dt><dd className="shrink-0 tabular-nums">{euro(c.quotaComuni)}</dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">{t("Riparto {valore} · {quota}", { valore: t(NOMI_CRITERIO[conti.criterio] ?? ""), quota })}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
