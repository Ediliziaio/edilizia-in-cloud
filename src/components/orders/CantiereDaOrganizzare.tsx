// src/components/orders/CantiereDaOrganizzare.tsx
import { ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAccessiCommessa } from "@/hooks/useAccessiCommessa";
import { useManodoperaPresenteCommessa } from "@/hooks/useManodoperaPresenteCommessa";
import { useImpostazioniAvvio } from "@/hooks/useImpostazioniAvvio";
import { cn } from "@/lib/utils";
import { CONTROLLI_AVVIO, cosaManca, senzaControllo, type ControlloAvvio } from "@/lib/orders/nuovaCommessa";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  /**
   * Commesse che per come sono fatte non hanno un piano rate: l'appalto a
   * misura, dove l'importo si sa alla fine e le rate nascono dal rendiconto.
   * Senza questo il riquadro chiederebbe per sempre «come si paga».
   */
  senzaRate?: boolean;
  onVai: (chiave: ControlloAvvio) => void;
}

/**
 * «Cantiere da organizzare»: una riga nella panoramica che dice cosa manca a una commessa
 * appena nata (indirizzo, date, fasi, chi lavora, come si paga), con il pulsante che porta
 * a sistemarlo. Sparisce da solo quando non manca niente di quello che l'azienda ha scelto di
 * controllare, e chi lo ritiene inutile lo toglie per tutta l'azienda.
 */
export function CantiereDaOrganizzare({ orderId, indirizzo, inizio, fine, fasi, rate, puoModificare, puoConfigurare, senzaRate, onVai }: Props) {
  const t = useT();
  const confirm = useConfirm();
  const { data: accessi, isLoading: accessiInLettura, isError: accessiNonLetti } = useAccessiCommessa(orderId);
  const manodopera = useManodoperaPresenteCommessa(orderId);
  const { controlli, isLoading: impostazioniInLettura, salva } = useImpostazioniAvvio();

  if (!puoModificare || impostazioniInLettura || accessiInLettura || manodopera.isLoading || fasi === null || rate === null) return null;
  // Se gli accessi non si leggono non si può dire che manchino: nessun falso allarme.
  // Workers without an app account and subcontracting companies still work here.
  // Never create fictitious access rights merely to dismiss this reminder.
  const persone = accessiNonLetti || manodopera.isError || manodopera.data ? 1 : accessi?.length ?? 0;
  const controlliValidi = senzaRate ? senzaControllo(controlli, "pagamenti") : controlli;
  const mancanze = cosaManca({ indirizzo, inizio, fine, fasi, persone, rate }, controlliValidi);
  if (mancanze.length === 0) return null;
  const voci = mancanze.map((m) => t(m.mancante));

  const nonServePiu = async (chiave: ControlloAvvio) => {
    const etichetta = CONTROLLI_AVVIO.find((c) => c.chiave === chiave)?.etichetta;
    const voce = etichetta ? t(etichetta).toLowerCase() : chiave;
    const ok = await confirm({
      title: t("Non ricordarmi più «{voce}»?", { voce }),
      description: t("Vale per tutte le commesse dell'azienda. Si può riattivare in Impostazioni → Fasi e avanzamento."),
      confirmLabel: t("Non ricordarmelo più"),
    });
    if (ok) salva.mutate({ controlli: senzaControllo(controlli, chiave) });
  };

  return (
    <section aria-label={t("Cantiere da organizzare")} className="rounded-xl border border-sky-200 bg-sky-50/60">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4 sm:py-3">
        <ListChecks aria-hidden="true" className="h-4 w-4 shrink-0 text-sky-700" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold text-sky-950">{t("Cantiere da organizzare")}</span>
          <span className="text-slate-700"> · {voci.length === 1 ? t("Manca: {voce}", { voce: voci[0] }) : t("Mancano: {elenco} e {ultima}", { elenco: voci.slice(0, -1).join(", "), ultima: voci[voci.length - 1] })}</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {mancanze.map((m, i) => (
            // Sul telefono basta il primo pulsante: gli altri si vedono dopo averlo sistemato.
            <span key={m.chiave} className={cn("inline-flex items-center", i > 0 && "max-sm:hidden")}>
              <Button type="button" size="sm" variant="outline" className="h-8 border-sky-300 bg-white text-sky-900" onClick={() => onVai(m.chiave)}>
                {t(m.azione)}
              </Button>
              {puoConfigurare && (
                <button
                  type="button"
                  aria-label={t("Non ricordarmi più: {voce}", { voce: t(m.mancante) })}
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
