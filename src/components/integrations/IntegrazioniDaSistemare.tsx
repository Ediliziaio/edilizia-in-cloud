/**
 * «Da sistemare»: in cima alla pagina Integrazioni, tutto quello che non
 * funziona, una riga per problema con il pulsante che lo risolve.
 *
 * Prima i problemi erano sparsi in cinque pannelli (calendari, caselle,
 * domini, banca, schede) e per trovarli bisognava scorrere tutta la pagina
 * (05/10/2026). Senza problemi il riquadro non c'è.
 */
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderLogo, type IntegrationItem } from "./IntegrationsCatalog";

export type VoceDaSistemare = {
  id: string;
  Logo: IntegrationItem["Logo"];
  /** Di cosa si parla: «Caselle email», «Qonto», «Facebook e Instagram». */
  titolo: string;
  /** Cosa succede e cosa comporta, in una frase. */
  messaggio: string;
  /** Il pulsante: «Ricollega», «Vedi», «Risolvi». */
  azione: string;
  onAzione: () => void;
};

export function IntegrazioniDaSistemare({
  voci,
  conAzioni = true,
}: {
  voci: VoceDaSistemare[];
  /** Senza permesso di modifica le righe si leggono ma non hanno pulsanti. */
  conAzioni?: boolean;
}) {
  if (voci.length === 0) return null;
  return (
    <section
      aria-labelledby="da-sistemare-titolo"
      className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/15"
    >
      <header className="flex items-center gap-2 border-b border-amber-200/80 px-4 py-2.5 dark:border-amber-900/60">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <h2 id="da-sistemare-titolo" className="text-sm font-semibold">Da sistemare</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
          {voci.length}
        </span>
      </header>
      <ul className="divide-y divide-amber-200/70 dark:divide-amber-900/50">
        {voci.map((v) => (
          <li key={v.id} className="flex items-center gap-3 px-4 py-2.5">
            {renderLogo(v.Logo, "h-8 w-8 shadow-none", "h-5 w-5")}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">{v.titolo}</p>
              <p className="text-xs text-muted-foreground">{v.messaggio}</p>
            </div>
            {conAzioni && (
              <Button size="sm" variant="outline" className="h-8 shrink-0 bg-background" onClick={v.onAzione}>
                {v.azione}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
