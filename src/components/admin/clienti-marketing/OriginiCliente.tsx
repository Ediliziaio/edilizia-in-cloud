/**
 * Da dove arriva.
 *
 * Nella stessa azienda ci possono essere più Business Manager, più account
 * pubblicitari e più pagine. Sommarli dà un totale che non si sa a chi
 * attribuire: se la spesa sale e le richieste no, senza questa divisione non si
 * capisce quale pezzo ha smesso di funzionare.
 *
 * Tre livelli: le connessioni (un Business Manager per riga, col suo token), gli
 * account pubblicitari con la spesa, le pagine con le richieste che hanno
 * portato.
 */
import { Link2, PlugZap } from "lucide-react";
import { cn } from "@/lib/utils";
import { dataBreve, eur, numero } from "./formato";
import type { Origini } from "./useSchedaCliente";

const th = "px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap";
const tdc = "px-2 py-1.5 tabular-nums whitespace-nowrap";

/** Meta dice «connected» quando il token è vivo: tutto il resto è da sistemare. */
const viva = (stato: string) => stato === "connected";

export function OriginiCliente({ origini, oggi }: { origini: Origini | null; oggi: Date }) {
  if (!origini) return null;
  const { connessioni, account, pagine } = origini;
  if (connessioni.length === 0 && account.length === 0 && pagine.length === 0) return null;

  const nonScelti = connessioni.reduce((s, c) => s + (c.account_visti - c.account_scelti), 0);

  return (
    <div className="border-t">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
        <PlugZap className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Da dove arriva</h4>
        {connessioni.length > 1 && (
          <span className="text-[11px] text-muted-foreground">{numero(connessioni.length)} Business Manager collegati</span>
        )}
      </div>

      {connessioni.some((c) => !viva(c.stato)) && (
        <p className="mx-3 mt-2 rounded-md bg-rose-50 px-2 py-1.5 text-[11px] text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          Una connessione non è più valida: da lì non arriva né spesa né richieste finché non viene ricollegata.
        </p>
      )}
      {nonScelti > 0 && (
        <p className="mx-3 mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {numero(nonScelti)} account pubblicitari visti dal Business Manager ma non scelti: la loro spesa non entra in
          nessun numero. Se uno di quelli è del cliente, va selezionato.
        </p>
      )}

      <div className="grid gap-3 p-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            Account pubblicitari
          </div>
          {account.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Nessun account con spesa nel periodo.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className={th}>Account</th>
                    <th className={cn(th, "text-right")}>Spesa</th>
                    <th className={cn(th, "text-right")}>Richieste</th>
                    <th className={cn(th, "text-right")}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {account.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="max-w-[14rem] truncate px-2 py-1.5" title={`${a.nome} · ${a.id}`}>
                        {a.nome}
                        {!a.scelto && <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400">non scelto</span>}
                      </td>
                      <td className={cn(tdc, "text-right font-medium")}>{a.spesa > 0 ? eur(a.spesa) : "—"}</td>
                      <td className={cn(tdc, "text-right")}>{a.lead > 0 ? numero(a.lead) : "—"}</td>
                      <td className={cn(tdc, "text-right")}>{a.cpl != null ? eur(a.cpl, 2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pagine Facebook e Instagram
          </div>
          {pagine.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Nessuna richiesta attribuita a una pagina nel periodo.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className={th}>Pagina</th>
                    <th className={cn(th, "text-right")}>Richieste</th>
                    <th className={cn(th, "text-right")}>Contratti</th>
                    <th className={th}>Ultima</th>
                  </tr>
                </thead>
                <tbody>
                  {pagine.map((pg) => (
                    <tr key={pg.id} className="border-t">
                      <td className="max-w-[14rem] truncate px-2 py-1.5" title={`${pg.nome} · ${pg.id}`}>
                        <span className="inline-flex items-center gap-1.5">
                          <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                          {pg.nome}
                        </span>
                      </td>
                      <td className={cn(tdc, "text-right font-medium")}>{pg.lead > 0 ? numero(pg.lead) : "—"}</td>
                      <td className={cn(tdc, "text-right")}>
                        {pg.vendite > 0 ? `${numero(pg.vendite)} · ${eur(pg.valore)}` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {pg.ultimo ? dataBreve(pg.ultimo, false, oggi) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
