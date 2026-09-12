/**
 * Cosa spegnere.
 *
 * Una riga per campagna (o per inserzione) con quanto ha speso e quante
 * richieste ha portato DAVVERO nel CRM, non quante ne dichiara Meta. Il costo
 * per richiesta è il rapporto fra quei due numeri, e il verdetto lo confronta
 * con le soglie del cliente.
 *
 * Sotto tre volte il costo obiettivo non si dà un giudizio: una campagna che ha
 * speso otto euro non ha ancora detto niente, e spegnerla sarebbe una decisione
 * presa sul rumore.
 */
import { AlertTriangle, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { dataBreve, eur, numero } from "./formato";
import type { RigaInserzione } from "./useSchedaCliente";

const th = "px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap";
const tdc = "px-2 py-1.5 tabular-nums whitespace-nowrap";

const TONO: Record<RigaInserzione["verdetto"], string> = {
  "da spegnere": "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  "da capire": "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  "da guardare": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "va bene": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  "troppo presto": "bg-muted text-muted-foreground",
};

/** Meta chiama ACTIVE quello che sta girando: il resto è già fermo. */
const acceso = (stato: string | null) => stato === "ACTIVE";

export function CampagneCliente({
  righe, caricamento, livello, onLivello, oggi,
}: {
  righe: RigaInserzione[];
  caricamento: boolean;
  livello: "campagna" | "inserzione";
  onLivello: (v: "campagna" | "inserzione") => void;
  oggi: Date;
}) {
  const daSpegnere = righe.filter((r) => r.verdetto === "da spegnere");
  const daCapire = righe.filter((r) => r.verdetto === "da capire");
  const sprecato = daSpegnere.reduce((s, r) => s + r.spesa, 0);
  const target = righe.find((r) => r.cpl_target != null)?.cpl_target ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="inline-flex rounded-lg border p-0.5">
          {(["campagna", "inserzione"] as const).map((v) => (
            <button key={v} type="button" onClick={() => onLivello(v)}
              className={cn("rounded-md px-2.5 py-1 text-xs transition-colors",
                livello === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {v === "campagna" ? "Per campagna" : "Per inserzione"}
            </button>
          ))}
        </div>
        {target != null && (
          <span className="text-[11px] text-muted-foreground">costo per richiesta obiettivo {eur(target, 2)}</span>
        )}
      </div>

      {caricamento ? (
        <div className="p-6 text-center text-xs text-muted-foreground">Sto leggendo le campagne…</div>
      ) : righe.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Nel periodo scelto non risulta spesa per campagna. Il dettaglio arriva con la sincronizzazione notturna di Meta.
        </div>
      ) : (
        <>
          {daCapire.length > 0 && (
            <p className="flex items-start gap-2 border-b bg-sky-50 px-3 py-2 text-[11px] text-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {daCapire.map((r) => r.nome).join(", ")}: Meta dichiara molte più richieste di quelle entrate nel CRM.
                Il costo per richiesta qui non misura la campagna, misura la consegna. Prima di spegnere, controlla il
                modulo collegato e l'obiettivo della campagna.
              </span>
            </p>
          )}

          {daSpegnere.length > 0 && (
            <p className="flex items-start gap-2 border-b bg-rose-50 px-3 py-2 text-[11px] text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              <PauseCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {daSpegnere.length === 1 ? "Una" : numero(daSpegnere.length)}{" "}
                {livello === "campagna"
                  ? (daSpegnere.length === 1 ? "campagna da spegnere" : "campagne da spegnere")
                  : (daSpegnere.length === 1 ? "inserzione da spegnere" : "inserzioni da spegnere")}
                {" "}nel periodo, {eur(sprecato)} di spesa.
                {daSpegnere.some((r) => acceso(r.stato)) ? " Alcune stanno ancora girando." : " Risultano già ferme."}
              </span>
            </p>
          )}

          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card shadow-[0_1px_0_hsl(var(--border))]">
                <tr>
                  <th className={th}>{livello === "campagna" ? "Campagna" : "Inserzione"}</th>
                  <th className={th}>Stato</th>
                  <th className={cn(th, "text-right")}>Spesa</th>
                  <th className={cn(th, "text-right")}>Giorni</th>
                  <th className={cn(th, "text-right")}>Copertura</th>
                  <th className={cn(th, "text-right")}>Click</th>
                  <th className={cn(th, "text-right")}>CPC</th>
                  <th className={cn(th, "text-right")}>Dichiarati</th>
                  <th className={cn(th, "text-right")}>Richieste</th>
                  <th className={cn(th, "text-right")}>Costo richiesta</th>
                  <th className={cn(th, "text-right")}>Contratti</th>
                  <th className={cn(th, "text-right")}>Valore</th>
                  <th className={th}>Verdetto</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="max-w-[22rem] px-2 py-1.5">
                      <div className="truncate font-medium" title={r.nome}>{r.nome}</div>
                      {livello === "inserzione" && (r.campagna_nome || r.gruppo_nome) && (
                        <div className="truncate text-[10.5px] text-muted-foreground" title={`${r.campagna_nome ?? ""} · ${r.gruppo_nome ?? ""}`}>
                          {[r.campagna_nome, r.gruppo_nome].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={cn("inline-flex items-center gap-1 text-[11px]",
                        acceso(r.stato) ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", acceso(r.stato) ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                        {acceso(r.stato) ? "gira" : r.stato ? "ferma" : "—"}
                      </span>
                    </td>
                    <td className={cn(tdc, "text-right font-medium")}>{eur(r.spesa)}</td>
                    <td className={cn(tdc, "text-right text-muted-foreground")} title={r.ultimo_giorno ? `ultimo giorno con spesa: ${dataBreve(r.ultimo_giorno, false, oggi)}` : undefined}>
                      {numero(r.giorni_con_spesa)}
                    </td>
                    <td className={cn(tdc, "text-right")}>{r.copertura ? numero(r.copertura) : "—"}</td>
                    <td className={cn(tdc, "text-right")}>{r.click ? numero(r.click) : "—"}</td>
                    <td className={cn(tdc, "text-right")}>{r.cpc != null ? eur(r.cpc, 2) : "—"}</td>
                    <td className={cn(tdc, "text-right text-muted-foreground")}>{r.lead_dichiarati > 0 ? numero(r.lead_dichiarati) : "—"}</td>
                    <td className={cn(tdc, "text-right font-medium")}>{numero(r.lead)}</td>
                    <td className={cn(tdc, "text-right font-medium",
                      r.verdetto === "da spegnere" ? "text-rose-700 dark:text-rose-400"
                        : r.verdetto === "da guardare" ? "text-amber-700 dark:text-amber-400" : "")}>
                      {r.cpl != null ? eur(r.cpl, 2) : "—"}
                    </td>
                    <td className={cn(tdc, "text-right")}>{r.vendite > 0 ? numero(r.vendite) : "—"}</td>
                    <td className={cn(tdc, "text-right")}>{r.valore > 0 ? eur(r.valore) : "—"}</td>
                    <td className="px-2 py-1.5">
                      <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10.5px] font-medium", TONO[r.verdetto])}
                        title={r.perche}>
                        {r.verdetto}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="flex items-start gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              «Richieste» sono i contatti entrati nel CRM con l'identificativo di questa{" "}
              {livello === "campagna" ? "campagna" : "inserzione"}, «Dichiarati» quelli che conta Meta. Il verdetto
              guarda le richieste vere. Sotto tre volte il costo obiettivo non viene dato nessun giudizio: prima serve
              spesa a sufficienza.
            </span>
          </p>
        </>
      )}
    </div>
  );
}
