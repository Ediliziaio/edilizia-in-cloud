import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import type { EconomiaFasi } from "@/lib/orders/economiaFasi";
import { costoSforato, dettaglioVoci } from "./EconomiaFaseRiga";

const eur = { format: formatCurrency };
const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);

/**
 * Riepilogo economico delle lavorazioni (06/10/2026), in cima a Lavorazioni:
 * le tre voci di tutte le fasi e quello che non sta in nessuna fase. Prendeva
 * il posto del «Riepilogo costi della manodopera», che sommava solo persone e
 * ditte. Chiuso finché non serve; da telefono non c'è.
 */
export function RiepilogoEconomicoFasi({
  economia,
  vedeVenduto,
  vedeCosti,
  vedeMargini,
}: {
  economia: EconomiaFasi;
  vedeVenduto: boolean;
  vedeCosti: boolean;
  vedeMargini: boolean;
}) {
  if (!vedeVenduto && !vedeCosti) return null;
  const t = economia.totaleFasi;
  const fuori = economia.senzaFase;
  const sforato = vedeCosti && costoSforato(t);
  const caselle = [
    vedeVenduto && { titolo: "Venduto", valore: eur.format(t.venduto), nota: t.righe > 0 ? `${t.righe} righe del contratto nelle fasi` : "nessuna riga del contratto nelle fasi" },
    vedeCosti && { titolo: "Costo previsto", valore: eur.format(t.costoPrevisto), nota: dettaglioVoci(t.previsto) },
    vedeCosti && { titolo: "Costo consuntivo", valore: eur.format(t.costoConsuntivo), nota: dettaglioVoci(t.consuntivo), rosso: sforato },
    vedeCosti && { titolo: "Scostamento", valore: eur.format(t.scostamento), nota: "consuntivo meno previsto", rosso: t.scostamento > 0, verde: t.scostamento < 0 },
  ].filter(Boolean) as Array<{ titolo: string; valore: string; nota: string; rosso?: boolean; verde?: boolean }>;
  const fuoriConta = fuori.righe > 0 || fuori.costoPrevisto > 0 || fuori.costoConsuntivo > 0;

  return (
    <details className="rounded-lg border p-3 max-sm:hidden">
      <summary className="cursor-pointer text-sm font-medium">Riepilogo economico delle lavorazioni</summary>
      <p className="my-2 text-xs text-muted-foreground">
        Venduto: le righe del contratto collegate alle fasi. Costo previsto: persone, ditte e costo d'acquisto delle righe.
        Costo consuntivo: quello sostenuto, cioè ore e ditte registrate, acquisti emessi e scarichi di magazzino.
      </p>
      <dl className={cn("grid gap-2 rounded-lg border bg-muted/40 p-3", caselle.length >= 4 ? "sm:grid-cols-4" : caselle.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {caselle.map((c) => (
          <div key={c.titolo} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{c.titolo}</dt>
            <dd className={cn("text-base font-semibold tabular-nums", c.rosso ? "text-rose-600" : c.verde ? "text-emerald-600" : "text-foreground")}>{c.valore}</dd>
            <dd className="text-[11px] text-muted-foreground">{c.nota}</dd>
          </div>
        ))}
        {vedeCosti && t.costoPrevisto > 0 && (
          <div className={cn("pt-1", caselle.length >= 4 ? "sm:col-span-4" : caselle.length === 3 ? "sm:col-span-3" : "sm:col-span-2")}>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", sforato ? "bg-rose-500" : "bg-emerald-500")}
                style={{ width: `${Math.min(100, (t.costoConsuntivo / t.costoPrevisto) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Consuntivo al {((t.costoConsuntivo / t.costoPrevisto) * 100).toFixed(0)}% del previsto
              {vedeMargini && t.marginePrevistoPct != null && (
                <> · margine previsto {pct(t.marginePrevistoPct)}, consuntivo {pct(t.margineConsuntivoPct)}</>
              )}
            </p>
          </div>
        )}
      </dl>
      {fuoriConta && (
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">
          Fuori dalle fasi:{" "}
          {[
            vedeVenduto && fuori.righe > 0 ? `venduto ${eur.format(fuori.venduto)} (${fuori.righe === 1 ? "1 riga" : `${fuori.righe} righe`})` : null,
            vedeCosti && fuori.costoPrevisto > 0 ? `costo previsto ${eur.format(fuori.costoPrevisto)}` : null,
            vedeCosti && fuori.costoConsuntivo > 0 ? `consuntivo ${eur.format(fuori.costoConsuntivo)}` : null,
          ].filter(Boolean).join(" · ") || "niente da sommare"}
          . Provvigioni, costi diretti e rimborsi restano nel conto economico della commessa.
        </p>
      )}
    </details>
  );
}
