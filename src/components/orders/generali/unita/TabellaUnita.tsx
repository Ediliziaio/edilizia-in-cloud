// src/components/orders/generali/unita/TabellaUnita.tsx
// Le unità in tabella (da tablet e computer): prezzi, stato, acquirente, pagato, margine.
// Una riga si apre come una casella del tabellone.
import { NOMI_STATO, confrontaSigle, etichettaPiano, prezzoCorrente, unitaVive, type ElencoUnita } from "@/lib/orders/generali/unita";
import { formattaNumero, pagamentiUnita, type ContiUnita, type RiepilogoVendite } from "@/lib/orders/generali/unitaConti";
import { STILE_STATO, euro } from "@/components/orders/generali/unita/aspetto";
import { cn } from "@/lib/utils";

interface Props {
  elenco: ElencoUnita;
  conti: ContiUnita;
  riepilogo: RiepilogoVendite;
  onApri: (orderId: string) => void;
}

export function TabellaUnita({ elenco, conti, riepilogo, onApri }: Props) {
  const p = elenco.permessi;
  const vive = [...unitaVive(elenco.unita)].sort((a, b) => confrontaSigle(a.sigla, b.sigla));
  const margini = p.margini && conti.costiComuni !== null;
  const totaleMargine = margini ? [...conti.perUnita.values()].reduce((t, c) => t + (c.margine ?? 0), 0) : null;
  const somma = (f: (u: (typeof vive)[number]) => number | null) => vive.reduce((t, u) => t + (f(u) ?? 0), 0);
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Unità</th>
            <th className="px-2 py-2 font-medium">Piano</th>
            <th className="px-2 py-2 text-right font-medium">m²</th>
            <th className="px-2 py-2 text-right font-medium">‰</th>
            {p.importi && <th className="px-2 py-2 text-right font-medium">Listino</th>}
            {p.importi && <th className="px-2 py-2 text-right font-medium">Prezzo</th>}
            <th className="px-2 py-2 font-medium">Stato</th>
            <th className="px-2 py-2 font-medium">Acquirente</th>
            {p.importi && <th className="px-2 py-2 text-right font-medium">Pagato</th>}
            {p.importi && <th className="px-2 py-2 text-right font-medium">Da incassare</th>}
            {margini && <th className="px-3 py-2 text-right font-medium">Margine</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {vive.map((u) => {
            const pag = pagamentiUnita(u);
            const conto = conti.perUnita.get(u.orderId);
            return (
              <tr key={u.orderId} className="cursor-pointer hover:bg-muted/40" onClick={() => onApri(u.orderId)}>
                <td className="px-3 py-2">
                  <button type="button" className="text-left font-medium hover:underline" onClick={(ev) => { ev.stopPropagation(); onApri(u.orderId); }}>
                    {u.sigla}
                  </button>
                  {u.tipologia && <span className="ml-1.5 text-xs text-muted-foreground">{u.tipologia}</span>}
                  {u.edificio && <p className="text-xs text-muted-foreground">{u.edificio}</p>}
                </td>
                <td className="px-2 py-2 text-xs">{u.piano ? etichettaPiano(u.piano) : "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{u.mq !== null ? formattaNumero(u.mq) : "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{u.millesimi !== null ? formattaNumero(u.millesimi) : "—"}</td>
                {p.importi && <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{euro(u.listino)}</td>}
                {p.importi && <td className="px-2 py-2 text-right tabular-nums">{u.stato === "libera" ? "—" : euro(prezzoCorrente(u))}</td>}
                <td className="px-2 py-2 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", STILE_STATO[u.stato].punto)} aria-hidden="true" />
                    {NOMI_STATO[u.stato].una}
                  </span>
                </td>
                <td className="max-w-[12rem] truncate px-2 py-2 text-xs">{u.acquirente ?? "—"}</td>
                {p.importi && <td className="px-2 py-2 text-right tabular-nums">{pag.pagato ? euro(pag.pagato) : "—"}</td>}
                {p.importi && <td className="px-2 py-2 text-right tabular-nums">{pag.residuo !== null ? euro(pag.residuo) : "—"}</td>}
                {margini && (
                  <td className={cn("px-3 py-2 text-right tabular-nums", (conto?.margine ?? 0) < 0 && "text-destructive")}>{euro(conto?.margine ?? null)}</td>
                )}
              </tr>
            );
          })}
        </tbody>
        {vive.length > 1 && (
          <tfoot>
            <tr className="border-t bg-muted/30 text-sm font-medium">
              <td className="px-3 py-2">Totale</td>
              <td className="px-2 py-2" />
              <td className="px-2 py-2 text-right tabular-nums">{formattaNumero(riepilogo.mq)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formattaNumero(riepilogo.millesimi)}</td>
              {p.importi && <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{euro(somma((u) => u.listino))}</td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(somma((u) => (u.stato === "libera" ? null : prezzoCorrente(u))))}</td>}
              <td className="px-2 py-2" colSpan={2} />
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro((riepilogo.incassato ?? 0) + (riepilogo.permute ?? 0))}</td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(riepilogo.daIncassare)}</td>}
              {margini && <td className={cn("px-3 py-2 text-right tabular-nums", (totaleMargine ?? 0) < 0 && "text-destructive")}>{euro(totaleMargine)}</td>}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
