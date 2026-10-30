// src/components/orders/TabellaCronoprogramma.tsx
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RigaTabella } from "@/lib/orders/tabellaCronoprogramma";

const data = (d: string | null) => (d ? format(parseISO(d), "dd/MM/yyyy") : "—");
// useGrouping "always": in italiano senza, 4480 resta senza punto delle migliaia.
const EURO = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" as unknown as boolean });
const euro = (n: number | null) => (n == null ? "—" : `${EURO.format(n)} €`);
const numero = (n: number | null) => (n == null ? "—" : n.toLocaleString("it-IT", { maximumFractionDigits: 2 }));

/**
 * Il cronoprogramma come tabella (31/10/2026): fasi e sottofasi con date, giorni,
 * persone, quantità e costi, come negli Excel dei clienti, ed esportabile.
 */
export function TabellaCronoprogramma({ righe, vediCosti, vediVenduto, onEsporta }: {
  righe: RigaTabella[];
  vediCosti: boolean;
  vediVenduto: boolean;
  onEsporta?: () => Promise<void>;
}) {
  const [esporto, setEsporto] = useState(false);
  const [errore, setErrore] = useState("");
  const esporta = async () => {
    if (!onEsporta) return;
    setEsporto(true); setErrore("");
    try { await onEsporta(); } catch { setErrore("Esportazione non riuscita: riprova."); } finally { setEsporto(false); }
  };
  const tot = (k: "costoPrevisto" | "costoConsuntivo" | "venduto") => righe.filter((r) => r.livello === 0).reduce((s, r) => s + (r[k] ?? 0), 0);
  return (
    <div className="space-y-2">
      {onEsporta && <div className="flex items-center justify-end gap-2">
        {errore && <span role="alert" className="text-xs text-rose-700">{errore}</span>}
        <Button size="sm" variant="outline" onClick={esporta} disabled={esporto}>
          {esporto ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}Esporta Excel
        </Button>
      </div>}
      <div className="overflow-x-auto rounded-lg border">
        <table aria-label="Tabella del cronoprogramma" className="w-full min-w-[860px] text-xs">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-2">N.</th><th className="px-2 py-2">Attività</th><th className="px-2 py-2">Inizio</th><th className="px-2 py-2">Fine</th>
              <th className="px-2 py-2 text-right">GG</th><th className="px-2 py-2 text-right" title="Giorni di lavoro dai rapportini">GG lav.</th><th className="px-2 py-2 text-right">Pers.</th><th className="px-2 py-2 text-right">Quantità</th><th className="px-2 py-2">U.M.</th>
              {vediCosti && <><th className="px-2 py-2 text-right">Costo previsto</th><th className="px-2 py-2 text-right">Consuntivo</th></>}
              {vediVenduto && <th className="px-2 py-2 text-right">Venduto</th>}
              <th className="px-2 py-2 text-right">Avanz.</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.id} data-testid={`riga-${r.numero}`} className={cn("border-t", r.livello === 0 ? "bg-white font-semibold" : "bg-slate-50/40")}>
                <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.numero}</td>
                <td className={cn("px-2 py-1.5", r.livello === 1 && "pl-6 font-normal")}>
                  {r.nome}{r.stimata && <span className="ml-1 text-[10px] font-normal text-sky-700">stimata</span>}
                  {r.ritardo > 0 && <span className="ml-1 text-[10px] font-medium text-rose-700">+{r.ritardo} gg</span>}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{data(r.inizio)}</td>
                <td className="px-2 py-1.5 tabular-nums">{data(r.fine)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.giorni ?? "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.giorniLavorati ?? ""}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.risorse ?? "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{numero(r.quantita)}</td>
                <td className="px-2 py-1.5">{r.unita ?? "—"}</td>
                {vediCosti && <><td className="px-2 py-1.5 text-right tabular-nums">{euro(r.costoPrevisto)}</td><td className="px-2 py-1.5 text-right tabular-nums">{euro(r.costoConsuntivo)}</td></>}
                {vediVenduto && <td className="px-2 py-1.5 text-right tabular-nums">{euro(r.venduto)}</td>}
                <td className="px-2 py-1.5 text-right tabular-nums">{r.avanzamento}%</td>
              </tr>
            ))}
          </tbody>
          {(vediCosti || vediVenduto) && <tfoot className="border-t-2 bg-slate-50 font-semibold">
            <tr>
              <td className="px-2 py-2" colSpan={9}>Totale fasi</td>
              {vediCosti && <><td className="px-2 py-2 text-right tabular-nums">{euro(tot("costoPrevisto"))}</td><td className="px-2 py-2 text-right tabular-nums">{euro(tot("costoConsuntivo"))}</td></>}
              {vediVenduto && <td className="px-2 py-2 text-right tabular-nums">{euro(tot("venduto"))}</td>}
              <td />
            </tr>
          </tfoot>}
        </table>
      </div>
    </div>
  );
}
