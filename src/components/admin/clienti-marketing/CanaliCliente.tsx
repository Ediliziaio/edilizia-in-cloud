/**
 * Da dove arriva ogni euro e ogni richiesta: una riga per canale.
 *
 * Un CPL medio fra Facebook a 8 euro e Google a 40 non è il CPL di nessuno dei
 * due: questa tabella è il posto dove si vede la differenza. Dice anche da dove
 * viene il costo — importato dalla piattaforma, messo a mano, o mancante — così
 * una riga con tante richieste e zero spesa si legge per quello che è: un
 * account pubblicitario non collegato, non un canale gratis.
 */
import { AlertTriangle, Link2Off } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, numero } from "./formato";
import type { CanaleScheda } from "./useSchedaCliente";

const th = "px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap";
const tdc = "px-2 py-1.5 tabular-nums whitespace-nowrap";

const COLORE: Record<string, string> = {
  meta: "bg-blue-500",
  google: "bg-amber-500",
  tiktok: "bg-fuchsia-500",
  form: "bg-emerald-500",
  altro: "bg-slate-400",
};

export function CanaliCliente({ canali, caricamento }: { canali: CanaleScheda[]; caricamento: boolean }) {
  if (caricamento) {
    return <div className="p-6 text-center text-xs text-muted-foreground">Sto leggendo i canali…</div>;
  }
  if (canali.length === 0) {
    return <div className="p-6 text-center text-xs text-muted-foreground">Nel periodo scelto non risultano né costi né richieste.</div>;
  }

  const spesaTotale = canali.reduce((s, c) => s + c.spesa, 0);
  const leadTotali = canali.reduce((s, c) => s + c.lead, 0);
  const scollegati = canali.filter((c) => c.lead > 0 && c.spesa === 0);

  return (
    <div>
      {scollegati.length > 0 && (
        <p className="flex items-start gap-2 border-b bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <Link2Off className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {scollegati.map((c) => `${c.nome} (${numero(c.lead)} richieste)`).join(", ")}: le richieste arrivano ma il
            costo no. Finché l'account non è collegato o i costi non si inseriscono a mano, per questi canali non
            esiste un costo per richiesta.
          </span>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-card shadow-[0_1px_0_hsl(var(--border))]">
            <tr>
              <th className={th}>Canale</th>
              <th className={cn(th, "text-right")}>Spesa</th>
              <th className={cn(th, "text-right")}>Quota</th>
              <th className={cn(th, "text-right")}>Copertura</th>
              <th className={cn(th, "text-right")}>Interazioni</th>
              <th className={cn(th, "text-right")}>Click</th>
              <th className={cn(th, "text-right")}>CPM</th>
              <th className={cn(th, "text-right")}>CPC</th>
              <th className={cn(th, "text-right")}>Dichiarati</th>
              <th className={cn(th, "text-right")}>Richieste</th>
              <th className={cn(th, "text-right")}>Costo richiesta</th>
              <th className={cn(th, "text-right")}>Contratti</th>
              <th className={cn(th, "text-right")}>Valore</th>
              <th className={th}>Costo</th>
            </tr>
          </thead>
          <tbody>
            {canali.map((c) => {
              const quota = spesaTotale > 0 ? c.spesa / spesaTotale : null;
              // Meta dichiara i suoi lead: se nel CRM ne arrivano molti meno,
              // è un problema di consegna, non di campagna.
              const persi = c.lead_dichiarati > 0 ? c.lead_dichiarati - c.lead : 0;
              return (
                <tr key={c.canale} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", COLORE[c.canale] ?? COLORE.altro)} />
                      <span className="font-medium">{c.nome}</span>
                    </span>
                  </td>
                  <td className={cn(tdc, "text-right font-medium")}>{c.spesa > 0 ? eur(c.spesa) : "—"}</td>
                  <td className={cn(tdc, "text-right text-muted-foreground")}>{quota != null && c.spesa > 0 ? `${Math.round(quota * 100)}%` : "—"}</td>
                  <td className={cn(tdc, "text-right")}>{c.copertura ? numero(c.copertura) : "—"}</td>
                  <td className={cn(tdc, "text-right")}>{c.interazioni ? numero(c.interazioni) : "—"}</td>
                  <td className={cn(tdc, "text-right")}>{c.click ? numero(c.click) : "—"}</td>
                  <td className={cn(tdc, "text-right")}>{c.cpm != null ? eur(c.cpm, 2) : "—"}</td>
                  <td className={cn(tdc, "text-right")}>{c.cpc != null ? eur(c.cpc, 2) : "—"}</td>
                  <td className={cn(tdc, "text-right")} title={persi > 0 ? `${numero(persi)} dichiarati da Meta non sono nel CRM` : undefined}>
                    {c.lead_dichiarati > 0 ? (
                      <span className={persi > 0 ? "text-amber-700 dark:text-amber-400" : undefined}>
                        {numero(c.lead_dichiarati)}
                        {persi > 0 && <AlertTriangle className="ml-1 inline h-3 w-3" />}
                      </span>
                    ) : "—"}
                  </td>
                  <td className={cn(tdc, "text-right font-medium")}>{numero(c.lead)}</td>
                  <td className={cn(tdc, "text-right font-medium")}>{c.cpl != null ? eur(c.cpl, 2) : "—"}</td>
                  <td className={cn(tdc, "text-right")}>{c.vendite > 0 ? numero(c.vendite) : "—"}</td>
                  <td className={cn(tdc, "text-right")}>{c.valore > 0 ? eur(c.valore) : "—"}</td>
                  <td className="px-2 py-1.5 text-[11px] text-muted-foreground">{c.origine_costo}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-medium">
              <td className="px-2 py-1.5">Totale</td>
              <td className={cn(tdc, "text-right")}>{eur(spesaTotale)}</td>
              <td colSpan={7} />
              <td className={cn(tdc, "text-right")}>{numero(leadTotali)}</td>
              <td className={cn(tdc, "text-right")}>{leadTotali > 0 && spesaTotale > 0 ? eur(spesaTotale / leadTotali, 2) : "—"}</td>
              <td className={cn(tdc, "text-right")}>{numero(canali.reduce((s, c) => s + c.vendite, 0))}</td>
              <td className={cn(tdc, "text-right")}>{eur(canali.reduce((s, c) => s + c.valore, 0))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
        «Dichiarati» è quello che conta la piattaforma pubblicitaria, «Richieste» quello che è davvero entrato nel CRM.
        Oggi l'unico canale che si sincronizza da solo è Facebook e Instagram: Google e TikTok compaiono qui appena si
        collega l'account o si inseriscono i costi a mano.
      </p>
    </div>
  );
}
