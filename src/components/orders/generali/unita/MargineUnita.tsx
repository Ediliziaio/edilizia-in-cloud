// src/components/orders/generali/unita/MargineUnita.tsx
// Da dove viene il margine dell'unità: ogni riga dice cosa toglie (piano, §3.1 punto 2).
import { euro } from "@/components/orders/generali/unita/aspetto";
import { NOMI_CRITERIO, formattaNumero, type ContiUnita } from "@/lib/orders/generali/unitaConti";
import type { UnitaGenerale } from "@/lib/orders/generali/unita";
import { cn } from "@/lib/utils";

export function MargineUnita({ unita: u, conti }: { unita: UnitaGenerale; conti: ContiUnita }) {
  const c = conti.perUnita.get(u.orderId);
  if (!c) return null;
  const quota = conti.criterio === "uguale"
    ? `una parte su ${conti.pesoTotale}`
    : `${formattaNumero(c.peso)} su ${formattaNumero(conti.pesoTotale)} ${conti.criterio === "millesimi" ? "‰" : conti.criterio === "mq" ? "m²" : "€"}`;
  const righe: { etichetta: string; nota?: string; valore: number | null; segno: "+" | "−" }[] = [
    { etichetta: u.stato === "libera" ? "Prezzo di listino" : u.stato === "rogitata" ? "Prezzo di rogito" : "Prezzo trattato", valore: c.prezzo, segno: "+" },
    { etichetta: "Costi della commessa", nota: u.codice ?? undefined, valore: c.costoDiretto, segno: "−" },
    ...(c.costoEreditato ? [{ etichetta: "Costi dell'unità divisa", nota: "per m²", valore: c.costoEreditato, segno: "−" as const }] : []),
    ...(c.provvigione ? [{ etichetta: "Provvigione agenzia", nota: u.agenzia ?? undefined, valore: c.provvigione, segno: "−" as const }] : []),
    { etichetta: "Quota dei costi comuni", nota: `${NOMI_CRITERIO[conti.criterio]}: ${quota}`, valore: c.quotaComuni, segno: "−" },
  ];
  return (
    <div className="space-y-2">
      <dl className="divide-y rounded-md border text-sm">
        {righe.map((r) => (
          <div key={r.etichetta} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
            <dt className="min-w-0">
              {r.etichetta}
              {r.nota && <span className="ml-1.5 text-xs text-muted-foreground">{r.nota}</span>}
            </dt>
            <dd className="shrink-0 tabular-nums">{r.segno === "−" && r.valore ? "− " : ""}{euro(r.valore)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 bg-muted/40 px-3 py-1.5 font-medium">
          <dt>Margine</dt>
          <dd className={cn("tabular-nums", (c.margine ?? 0) < 0 && "text-destructive", (c.margine ?? 0) > 0 && "text-emerald-700 dark:text-emerald-400")}>{euro(c.margine)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Costi comuni {euro(conti.costiComuni)}: registrati sulla commessa generale {euro(conti.costiGenerale)}
        {(conti.permute ?? 0) > 0 && <>, terreno in permuta {euro(conti.permute)}</>}
        {(conti.costiSenzaParti ?? 0) > 0 && <>, unità divise {euro(conti.costiSenzaParti)}</>}.
      </p>
    </div>
  );
}
