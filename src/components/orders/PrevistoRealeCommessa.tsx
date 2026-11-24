/**
 * «Previsto e reale» (24/11/2026): la previsione dei lavori fatta dalla pianta e salvata con la
 * commessa, accanto a quanto la commessa è costata e durata. Compare solo se una previsione è
 * stata salvata, e solo a chi vede i costi. Dove il reale manca lo dice, senza stimarlo.
 * Il calcolo è in `lib/planimetrie/previstoReale.ts`.
 */
import { Scale } from "lucide-react";
import { usePrevistoReale } from "@/hooks/usePrevisioneLavoriCommessa";
import { cn } from "@/lib/utils";

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const gg = (n: number) => `${n.toLocaleString("it-IT")} gg`;
const MANCA = <span className="text-muted-foreground">manca</span>;

function Scarto({ previsto, reale }: { previsto: number; reale: number | null }) {
  if (reale === null || !previsto) return <span className="text-muted-foreground">—</span>;
  const pct = Math.round((reale / previsto - 1) * 100);
  return <span className={cn("tabular-nums", pct > 10 ? "text-red-700 dark:text-red-300" : pct < -10 ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>{pct > 0 ? "+" : ""}{pct}%</span>;
}

export function PrevistoRealeCommessa({ orderId, workStartDate, workEndDate }: { orderId: string; workStartDate: string | null; workEndDate: string | null }) {
  const { salvata, confronto: c, isLoading } = usePrevistoReale(orderId, true, { inizio: workStartDate, fine: workEndDate });
  if (!salvata || !c) return null;
  const quando = new Date(salvata.created_at).toLocaleDateString("it-IT");
  const TH = "px-2 py-1.5 text-right font-medium";
  const TD = "px-2 py-1.5 text-right tabular-nums";
  return (
    <section aria-label="Previsto e reale" id="section-previsto-reale" className="scroll-mt-24 space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Scale className="h-4 w-4 text-primary" />Previsto e reale</h3>
        <p className="text-xs text-muted-foreground">
          Previsione dalla pianta{salvata.variante_nome ? ` (${salvata.variante_nome}` : " ("}{salvata.versione ? `, versione ${salvata.versione}` : ""}) salvata il {quando}, contro costi e giorni registrati sulla commessa.
          {!c.chiusa && " I lavori non risultano finiti: il reale è parziale e crescerà."}
          {isLoading && " Lettura del reale…"}
        </p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/30 p-3">
          <dt className="text-xs text-muted-foreground">Spesa</dt>
          <dd className="font-semibold tabular-nums">{euro.format(c.totale.previsto)} → {c.totale.reale === null ? MANCA : euro.format(c.totale.reale)}</dd>
          <dd className="text-xs"><Scarto previsto={c.totale.previsto} reale={c.totale.reale} /></dd>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <dt className="text-xs text-muted-foreground">Durata</dt>
          <dd className="font-semibold tabular-nums">{gg(c.giorniCalendario.previsto)} → {c.giorniCalendario.reale === null ? MANCA : gg(c.giorniCalendario.reale)}</dd>
          <dd className="text-xs text-muted-foreground">{c.giorniCalendario.fonte === "date" ? "dalle date di inizio e fine lavori" : c.giorniCalendario.fonte === "rapportini" ? "dal primo all'ultimo rapportino" : "senza date di lavoro né rapportini"}</dd>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <dt className="text-xs text-muted-foreground">Giorni di lavoro · manodopera</dt>
          <dd className="font-semibold tabular-nums">{gg(c.giorniLavoro.previsto)} → {c.giorniLavoro.reale === null ? MANCA : gg(c.giorniLavoro.reale)}</dd>
          <dd className="text-xs tabular-nums text-muted-foreground">{euro.format(c.manodopera.previsto)} → {c.manodopera.reale === null ? "manca" : euro.format(c.manodopera.reale)}</dd>
        </div>
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-xs" aria-label="Previsto e reale per fase">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Fase</th><th className={TH}>Previsto</th><th className={TH}>Reale</th><th className={TH}>Scarto</th><th className={TH}>Giorni</th></tr></thead>
          <tbody className="divide-y">
            {c.righe.map((r) => <tr key={r.fase} className="align-top">
              <th scope="row" className="py-1.5 text-left font-medium">{r.fase}
                <span className="block font-normal text-muted-foreground">{r.fasiCommessa.length ? `sulla commessa: ${r.fasiCommessa.join(", ")}` : "nessuna fase della commessa con questo nome"}</span></th>
              <td className={TD}>{euro.format(r.previsto)}</td>
              <td className={TD}>{r.reale === null ? MANCA : euro.format(r.reale)}</td>
              <td className={TD}><Scarto previsto={r.previsto} reale={r.reale} /></td>
              <td className={TD}>{gg(r.giorniPrevisti)} → {r.giorniReali === null ? MANCA : gg(r.giorniReali)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {c.fasiNonAbbinate.length > 0 && <p className="text-xs text-muted-foreground">
        Fasi della commessa fuori dalla previsione: {c.fasiNonAbbinate.map((f) => f.reale ? `${f.nome} (${euro.format(f.reale)})` : f.nome).join(", ")}. Sono nel totale reale, non nelle righe.
      </p>}
      <p className="text-xs text-muted-foreground">Il previsto viene dai prezzi delle voci della pianta, con spese generali e utile; il reale è il costo sostenuto. I giorni reali di una fase sono quelli con un rapportino su quella fase.</p>
    </section>
  );
}
