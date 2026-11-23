// src/components/orders/generali/unita/TabellaUnita.tsx
// Le unità in tabella (da tablet e computer): prezzi, stato, acquirente, pagato, margine.
// Una riga si apre come una casella del tabellone.
//
// I m² si scrivono qui, nella cella (16/11/2026): servono ai €/m² dell'operazione e finora si
// potevano mettere solo aprendo l'unità, una finestra per volta — su 26 unità nessuno lo fa, e
// infatti nel database 50 unità su 77 non hanno i metri quadri. Invio salva e passa alla
// successiva, così si compila la colonna di seguito.
import { useState } from "react";
import { NOMI_STATO, confrontaSigle, etichettaPiano, prezzoConVarianti, unitaVive, type ElencoUnita } from "@/lib/orders/generali/unita";
import { formattaNumero, pagamentiUnita, type ContiUnita, type RiepilogoVendite } from "@/lib/orders/generali/unitaConti";
import { STILE_STATO, euro } from "@/components/orders/generali/unita/aspetto";
import { useSalvaUnita } from "@/hooks/useGeneraleUnita";
import { leggiMq } from "@/components/orders/generali/design/SuperficieAMano";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  elenco: ElencoUnita;
  conti: ContiUnita;
  riepilogo: RiepilogoVendite;
  onApri: (orderId: string) => void;
  /** Con questo i m² si scrivono nella cella. */
  generaleId?: string;
  puoModificare?: boolean;
  totale?: string;
}

export function TabellaUnita({ elenco, conti, riepilogo, onApri, generaleId, puoModificare, totale = "Totale" }: Props) {
  const tr = useT();
  const p = elenco.permessi;
  const vive = [...unitaVive(elenco.unita)].sort((a, b) => confrontaSigle(a.sigla, b.sigla));
  const [inModifica, setInModifica] = useState<string | null>(null);
  const salvaMq = useSalvaUnita(generaleId ?? "");
  const mqScrivibili = !!generaleId && !!puoModificare;
  const dopo = (orderId: string) => vive[vive.findIndex((u) => u.orderId === orderId) + 1]?.orderId ?? null;
  const margini = p.margini && conti.costiComuni !== null;
  const totaleMargine = margini ? vive.reduce((t, u) => t + (conti.perUnita.get(u.orderId)?.margine ?? 0), 0) : null;
  const somma = (f: (u: (typeof vive)[number]) => number | null) => vive.reduce((t, u) => t + (f(u) ?? 0), 0);
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">{tr("Unità")}</th>
            <th className="px-2 py-2 font-medium">{tr("Piano")}</th>
            <th className="px-2 py-2 text-right font-medium">m²</th>
            <th className="px-2 py-2 text-right font-medium">‰</th>
            {p.importi && <th className="px-2 py-2 text-right font-medium">{tr("Listino")}</th>}
            {p.importi && <th className="px-2 py-2 text-right font-medium">{tr("Prezzo")}</th>}
            <th className="px-2 py-2 font-medium">{tr("Stato")}</th>
            <th className="px-2 py-2 font-medium">{tr("Acquirente")}</th>
            {p.importi && <th className="px-2 py-2 text-right font-medium">{tr("Pagato")}</th>}
            {p.importi && <th className="px-2 py-2 text-right font-medium">{tr("Da incassare")}</th>}
            {margini && <th className="px-3 py-2 text-right font-medium">{tr("Margine")}</th>}
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
                  {u.edificio && <p className="text-xs text-muted-foreground" dir="auto">{u.edificio}</p>}
                </td>
                <td className="px-2 py-2 text-xs">{u.piano ? etichettaPiano(u.piano) : "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums" onClick={(ev) => mqScrivibili && ev.stopPropagation()}>
                  {!mqScrivibili ? (
                    u.mq !== null ? formattaNumero(u.mq) : "—"
                  ) : inModifica === u.orderId ? (
                    <input
                      autoFocus
                      inputMode="decimal"
                      aria-label={tr("Metri quadri di {sigla}", { sigla: u.sigla })}
                      defaultValue={u.mq !== null ? String(u.mq) : ""}
                      disabled={salvaMq.isPending}
                      className="w-20 rounded border bg-background px-1.5 py-0.5 text-right tabular-nums"
                      onKeyDown={(ev) => {
                        if (ev.key === "Escape") { ev.preventDefault(); setInModifica(null); }
                        if (ev.key === "Enter") { ev.preventDefault(); (ev.target as HTMLInputElement).blur(); }
                      }}
                      onBlur={(ev) => {
                        const testo = ev.target.value.trim();
                        const mq = leggiMq(testo);
                        // Testo illeggibile: si lascia com'era, non si cancella il valore buono.
                        // Campo svuotato di proposito: si cancella. Uguale a prima: niente scrittura.
                        if ((testo === "" || mq !== null) && mq !== u.mq) {
                          salvaMq.mutate({ orderId: u.orderId, dati: { mq_commerciali: mq } });
                        }
                        setInModifica(dopo(u.orderId));
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={cn("w-full rounded px-1 text-right hover:bg-muted", u.mq === null && "text-muted-foreground")}
                      title={tr("Scrivi i metri quadri")}
                      onClick={() => setInModifica(u.orderId)}
                    >
                      {u.mq !== null ? formattaNumero(u.mq) : "—"}
                    </button>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{u.millesimi !== null ? formattaNumero(u.millesimi) : "—"}</td>
                {p.importi && <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{euro(u.listino)}</td>}
                {p.importi && <td className="px-2 py-2 text-right tabular-nums">{u.stato === "libera" ? "—" : euro(prezzoConVarianti(u))}</td>}
                <td className="px-2 py-2 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", STILE_STATO[u.stato].punto)} aria-hidden="true" />
                    {tr(NOMI_STATO[u.stato].una)}
                  </span>
                </td>
                <td className="max-w-[12rem] truncate px-2 py-2 text-xs" dir="auto">{u.acquirente ?? "—"}</td>
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
              <td className="px-3 py-2">{tr(totale)}</td>
              <td className="px-2 py-2" />
              <td className="px-2 py-2 text-right tabular-nums">{formattaNumero(riepilogo.mq)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formattaNumero(riepilogo.millesimi)}</td>
              {p.importi && <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{euro(somma((u) => u.listino))}</td>}
              {p.importi && <td className="px-2 py-2 text-right tabular-nums">{euro(somma((u) => (u.stato === "libera" ? null : prezzoConVarianti(u))))}</td>}
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
