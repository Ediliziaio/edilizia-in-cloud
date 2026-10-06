import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import type { EconomiaFasi } from "@/lib/orders/economiaFasi";
import { CampoVenduto, costoSforato, dettaglioVoci, margineDaMostrare } from "./EconomiaFaseRiga";

const eur = { format: formatCurrency };
const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);

const TH = "px-3 py-1.5 text-right font-medium";
const TD = "px-3 py-1.5 text-right tabular-nums";

/**
 * Economia delle lavorazioni (06/10/2026), in cima a Lavorazioni: una tabella
 * con una riga per fase — venduto (scrivibile), costo previsto, costo
 * consuntivo, margine — il totale, quello che non sta in nessuna fase e il
 * confronto col contratto, per vedere quanto resta da ripartire. Chiusa mostra
 * i totali in una riga. Da telefono non c'è.
 */
export function RiepilogoEconomicoFasi({
  economia,
  fasi,
  importoContratto,
  vedeVenduto,
  vedeCosti,
  vedeMargini,
  onSalvaVenduto,
}: {
  economia: EconomiaFasi;
  fasi: ReadonlyArray<{ id: string; name: string; status: string }>;
  /** Valore del contratto (imponibile, con le varianti approvate). */
  importoContratto?: number | null;
  vedeVenduto: boolean;
  vedeCosti: boolean;
  vedeMargini: boolean;
  onSalvaVenduto?: (faseId: string, importo: number | null) => void;
}) {
  if (!vedeVenduto && !vedeCosti) return null;
  const t = economia.totaleFasi;
  const fuori = economia.senzaFase;
  const sforato = vedeCosti && costoSforato(t);
  const colMargine = vedeVenduto && vedeMargini;
  const contratto = vedeVenduto && importoContratto && importoContratto > 0 ? importoContratto : null;
  const daRipartire = contratto != null ? Math.round((contratto - t.venduto) * 100) / 100 : 0;
  const fuoriConta = fuori.fonteVenduto !== null || fuori.costoPrevisto > 0 || fuori.costoConsuntivo > 0;
  // Il margine del totale: solo se ogni fase ha il venduto (altrimenti i costi
  // di quelle senza lo abbasserebbero per finta), sul consuntivo solo a lavori finiti.
  const tutteChiuse = fasi.length > 0 && fasi.every((f) => f.status === "completata");
  const margineTotale = economia.fasiSenzaVenduto === 0 && t.fonteVenduto !== null ? margineDaMostrare(t, tutteChiuse) : null;

  return (
    <details className="group rounded-lg border max-sm:hidden">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2 text-sm tabular-nums [&::-webkit-details-marker]:hidden">
        <span className="font-medium">
          <span aria-hidden="true" className="mr-1.5 inline-block text-muted-foreground transition-transform group-open:rotate-90">▸</span>
          Economia delle lavorazioni
        </span>
        {vedeVenduto && <span className="text-muted-foreground">Venduto <b className="font-semibold text-foreground">{eur.format(t.venduto)}</b></span>}
        {vedeCosti && <span className="text-muted-foreground">Costo previsto <b className="font-semibold text-foreground">{eur.format(t.costoPrevisto)}</b></span>}
        {vedeCosti && (
          <span className="text-muted-foreground">
            Costo consuntivo <b className={cn("font-semibold", sforato ? "text-rose-700" : "text-foreground")}>{eur.format(t.costoConsuntivo)}</b>
          </span>
        )}
        {contratto != null && daRipartire > 0 && (
          <span className="font-medium text-amber-700">{eur.format(daRipartire)} del contratto da ripartire</span>
        )}
      </summary>

      <div className="overflow-x-auto border-t">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/40 text-[11px] text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-1.5 text-left font-medium">Lavorazione</th>
              {vedeVenduto && <th scope="col" className={TH} title="Quanto paga il cliente per la lavorazione: scritto qui, o dalle righe del contratto collegate alla fase">Venduto</th>}
              {vedeCosti && <th scope="col" className={TH} title="Persone, ditte e costo d'acquisto delle righe della fase">Costo previsto</th>}
              {vedeCosti && <th scope="col" className={TH} title="Il costo sostenuto: ore e ditte registrate, acquisti emessi, scarichi di magazzino">Costo consuntivo</th>}
              {colMargine && <th scope="col" className={TH} title="Sul consuntivo per le fasi chiuse o già oltre il previsto, altrimenti previsto">Margine</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {fasi.map((f) => {
              const e = economia.perFase.get(f.id);
              if (!e) return null;
              const oltre = vedeCosti && costoSforato(e);
              const m = e.fonteVenduto !== null ? margineDaMostrare(e, f.status === "completata") : null;
              return (
                <tr key={f.id}>
                  <th scope="row" className="max-w-[18rem] truncate px-3 py-1.5 text-left font-normal">{f.name}</th>
                  {vedeVenduto && (
                    <td className={cn(TD, onSalvaVenduto && "py-1")}>
                      {onSalvaVenduto
                        ? <CampoVenduto economia={e} nomeFase={f.name} onSalva={(importo) => onSalvaVenduto(f.id, importo)} inTabella />
                        : e.fonteVenduto !== null ? eur.format(e.venduto) : <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                  {vedeCosti && <td className={TD} title={dettaglioVoci(e.previsto)}>{eur.format(e.costoPrevisto)}</td>}
                  {vedeCosti && (
                    <td className={cn(TD, oltre && "text-rose-700")} title={dettaglioVoci(e.consuntivo)}>
                      {eur.format(e.costoConsuntivo)}
                      {oltre && <span className="ml-1.5 text-xs font-medium">+{eur.format(e.scostamento)}</span>}
                    </td>
                  )}
                  {colMargine && (
                    <td className={cn(TD, m?.pct != null && m.pct < 0 && "text-rose-700")}>
                      {m?.pct != null ? <>{pct(m.pct)}{m.su === "previsto" && <span className="ml-1 text-[11px] text-muted-foreground">prev.</span>}</> : <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t bg-muted/20">
            <tr className="font-semibold">
              <th scope="row" className="px-3 py-1.5 text-left">Totale lavorazioni</th>
              {vedeVenduto && <td className={TD}>{eur.format(t.venduto)}</td>}
              {vedeCosti && <td className={TD}>{eur.format(t.costoPrevisto)}</td>}
              {vedeCosti && <td className={cn(TD, sforato && "text-rose-700")}>{eur.format(t.costoConsuntivo)}</td>}
              {colMargine && (
                <td className={TD} title={economia.fasiSenzaVenduto > 0 ? `${economia.fasiSenzaVenduto} lavorazioni senza venduto` : undefined}>
                  {margineTotale?.pct != null ? <>{pct(margineTotale.pct)}{margineTotale.su === "previsto" && <span className="ml-1 text-[11px] font-normal text-muted-foreground">prev.</span>}</> : "—"}
                </td>
              )}
            </tr>
            {fuoriConta && (
              <tr className="text-muted-foreground">
                <th scope="row" className="px-3 py-1.5 text-left font-normal">Fuori dalle fasi</th>
                {vedeVenduto && <td className={TD}>{fuori.fonteVenduto !== null ? eur.format(fuori.venduto) : "—"}</td>}
                {vedeCosti && <td className={TD}>{eur.format(fuori.costoPrevisto)}</td>}
                {vedeCosti && <td className={TD}>{eur.format(fuori.costoConsuntivo)}</td>}
                {colMargine && <td className={TD} />}
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {contratto != null && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground tabular-nums">
          Contratto <b className="font-semibold text-foreground">{eur.format(contratto)}</b>
          {" · "}nelle lavorazioni {eur.format(t.venduto)}
          {" · "}
          {daRipartire > 0
            ? <span className="font-medium text-amber-700">da ripartire {eur.format(daRipartire)}</span>
            : daRipartire < 0
              ? <span className="font-medium text-rose-700">oltre il contratto di {eur.format(-daRipartire)}</span>
              : <span className="font-medium text-emerald-700">tutto ripartito</span>}
          {economia.fasiSenzaVenduto > 0 && <> · {economia.fasiSenzaVenduto === 1 ? "1 lavorazione senza venduto" : `${economia.fasiSenzaVenduto} lavorazioni senza venduto`}</>}
        </p>
      )}
    </details>
  );
}
