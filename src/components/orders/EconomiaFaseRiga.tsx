import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import type { EconomiaFase, VociCosto } from "@/lib/orders/economiaFasi";

const eur = { format: formatCurrency };
const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);

/** «manodopera 1.140,00 € · materiali e forniture 320,00 €»: solo le voci che ci sono. */
export function dettaglioVoci(voci: VociCosto): string {
  const parti = [
    voci.manodopera ? `manodopera ${eur.format(voci.manodopera)}` : null,
    voci.ditte ? `ditte ${eur.format(voci.ditte)}` : null,
    voci.materiali ? `materiali e forniture ${eur.format(voci.materiali)}` : null,
  ].filter(Boolean);
  return parti.length > 0 ? parti.join(" · ") : "nessun costo";
}

/** Il costo consuntivo ha superato il previsto (con un previsto da confrontare). */
export function costoSforato(e: EconomiaFase): boolean {
  return e.costoPrevisto > 0 && e.scostamento > 0;
}

function Voce({ titolo, valore, nota, tono }: { titolo: string; valore: string; nota: string; tono?: "rosso" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{titolo}</dt>
      <dd className={cn("text-base font-semibold tabular-nums", tono === "rosso" ? "text-rose-700" : "text-foreground")}>{valore}</dd>
      <dd className="text-xs text-muted-foreground">{nota}</dd>
    </div>
  );
}

/**
 * Riga «Economia» di una fase (06/10/2026): venduto, costo previsto e costo
 * consuntivo, con le voci e i margini, ognuno col suo permesso. Da telefono
 * non c'è, come il riepilogo dei costi.
 */
export function EconomiaFaseRiga({
  economia,
  vedeVenduto,
  vedeCosti,
  vedeMargini,
}: {
  economia: EconomiaFase;
  vedeVenduto: boolean;
  vedeCosti: boolean;
  vedeMargini: boolean;
}) {
  if (!vedeVenduto && !vedeCosti) return null;
  const sforato = vedeCosti && costoSforato(economia);
  const mostraMargini = vedeMargini && economia.marginePrevistoPct != null;
  return (
    <div className="flex flex-wrap items-start gap-2 max-sm:hidden">
      <span className="w-24 shrink-0 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Economia</span>
      <div className="min-w-0 flex-1 rounded-lg border bg-muted/30 p-3">
        <dl className="grid gap-3 sm:grid-cols-3">
          {vedeVenduto && (
            <Voce
              titolo="Venduto"
              valore={economia.righe > 0 ? eur.format(economia.venduto) : "—"}
              nota={economia.righe > 0
                ? economia.righe === 1 ? "1 riga del contratto" : `${economia.righe} righe del contratto`
                : "nessuna riga del contratto collegata"}
            />
          )}
          {vedeCosti && <Voce titolo="Costo previsto" valore={eur.format(economia.costoPrevisto)} nota={dettaglioVoci(economia.previsto)} />}
          {vedeCosti && (
            <Voce
              titolo="Costo consuntivo"
              valore={eur.format(economia.costoConsuntivo)}
              nota={dettaglioVoci(economia.consuntivo)}
              tono={sforato ? "rosso" : undefined}
            />
          )}
        </dl>
        {((vedeCosti && economia.costoPrevisto > 0) || mostraMargini) && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs tabular-nums">
            {vedeCosti && economia.costoPrevisto > 0 && (
              <span className={sforato ? "font-medium text-rose-700" : "text-emerald-700"}>
                {sforato
                  ? `+${eur.format(economia.scostamento)} sul previsto`
                  : economia.scostamento < 0
                    ? `${eur.format(-economia.scostamento)} sotto il previsto`
                    : "in linea col previsto"}
              </span>
            )}
            {mostraMargini && (
              <span className="text-muted-foreground">
                Margine previsto <b className="font-semibold text-foreground">{pct(economia.marginePrevistoPct)}</b>
                {" · "}consuntivo <b className={cn("font-semibold", sforato ? "text-rose-700" : "text-foreground")}>{pct(economia.margineConsuntivoPct)}</b>
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
