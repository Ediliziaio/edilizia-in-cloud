// src/components/orders/CantiereDaOrganizzare.tsx
import { ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAccessiCommessa } from "@/hooks/useAccessiCommessa";
import { useImpostazioniAvvio } from "@/hooks/useImpostazioniAvvio";
import { cn } from "@/lib/utils";
import { CONTROLLI_AVVIO, cosaManca, senzaControllo, testoMancano, type ControlloAvvio } from "@/lib/orders/nuovaCommessa";

interface Props {
  orderId: string;
  indirizzo: string | null | undefined;
  inizio: string | null | undefined;
  fine: string | null | undefined;
  /** Quante fasi ha la commessa; `null` finché si leggono (il riquadro aspetta, non allarma). */
  fasi: number | null;
  /** Quante rate ha il piano di pagamento; `null` finché si leggono. */
  rate: number | null;
  /** Chi ha «Ordini e Commesse»: gli altri non possono sistemare niente, quindi non vedono il riquadro. */
  puoModificare: boolean;
  /** Chi può cambiare le impostazioni dell'azienda: può anche dire «non mi serve». */
  puoConfigurare: boolean;
  onVai: (chiave: ControlloAvvio) => void;
}

/**
 * «Cantiere da organizzare»: una riga nella panoramica che dice cosa manca a una commessa
 * appena nata (indirizzo, date, fasi, chi lavora, come si paga), con il pulsante che porta
 * a sistemarlo. Sparisce da solo quando non manca niente di quello che l'azienda ha scelto di
 * controllare, e chi lo ritiene inutile lo toglie per tutta l'azienda.
 */
export function CantiereDaOrganizzare({ orderId, indirizzo, inizio, fine, fasi, rate, puoModificare, puoConfigurare, onVai }: Props) {
  const confirm = useConfirm();
  const { data: accessi, isLoading: accessiInLettura, isError: accessiNonLetti } = useAccessiCommessa(orderId);
  const { controlli, isLoading: impostazioniInLettura, salva } = useImpostazioniAvvio();

  if (!puoModificare || impostazioniInLettura || accessiInLettura || fasi === null || rate === null) return null;
  // Se gli accessi non si leggono non si può dire che manchino: nessun falso allarme.
  const persone = accessiNonLetti ? 1 : accessi?.length ?? 0;
  const mancanze = cosaManca({ indirizzo, inizio, fine, fasi, persone, rate }, controlli);
  if (mancanze.length === 0) return null;

  const nonServePiu = async (chiave: ControlloAvvio) => {
    const voce = CONTROLLI_AVVIO.find((c) => c.chiave === chiave)?.etichetta.toLowerCase() ?? chiave;
    const ok = await confirm({
      title: `Non ricordarmi più «${voce}»?`,
      description: "Vale per tutte le commesse dell'azienda. Si può riattivare in Impostazioni → Modelli di fasi.",
      confirmLabel: "Non ricordarmelo più",
    });
    if (ok) salva.mutate({ controlli: senzaControllo(controlli, chiave) });
  };

  return (
    <section aria-label="Cantiere da organizzare" className="rounded-xl border border-sky-200 bg-sky-50/60">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4 sm:py-3">
        <ListChecks aria-hidden="true" className="h-4 w-4 shrink-0 text-sky-700" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold text-sky-950">Cantiere da organizzare</span>
          <span className="text-slate-700"> · {testoMancano(mancanze)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {mancanze.map((m, i) => (
            // Sul telefono basta il primo pulsante: gli altri si vedono dopo averlo sistemato.
            <span key={m.chiave} className={cn("inline-flex items-center", i > 0 && "max-sm:hidden")}>
              <Button type="button" size="sm" variant="outline" className="h-8 border-sky-300 bg-white text-sky-900" onClick={() => onVai(m.chiave)}>
                {m.azione}
              </Button>
              {puoConfigurare && (
                <button
                  type="button"
                  aria-label={`Non ricordarmi più: ${m.mancante}`}
                  className="ml-0.5 rounded p-1 text-slate-400 hover:text-slate-700 max-sm:hidden"
                  onClick={() => { void nonServePiu(m.chiave); }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
