/**
 * Installare un modello di area in un'azienda (super admin). L'azienda si
 * trova tipologie, linee e prodotti suoi; quelli che ha già con lo stesso nome
 * restano come sono, quindi si può ripetere.
 */
import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SceltaAzienda } from "@/components/admin/listino/SceltaAzienda";
import { AvvisoInstallazioneModello } from "@/components/listino/AvvisoInstallazioneModello";
import {
  useAnteprimaInstallazione,
  useAziendeLibreria,
  useModelliAreaMutations,
  type ModelloConInstallazioni,
} from "@/hooks/useModelliArea";
import {
  haMaggiorazioniDaCopiare,
  messaggioErroreInstallazione,
  testoContenuto,
  testoEsito,
  testoPrezzi,
  tipoErroreInstallazione,
  type EsitoInstallazione,
} from "@/lib/listino/modelliArea";

interface Props {
  modello: ModelloConInstallazioni;
  onChiudi: () => void;
}

const giorno = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });

export function InstallaModelloDialog({ modello, onChiudi }: Props) {
  const [aziendaId, setAziendaId] = useState<string | null>(null);
  const [esito, setEsito] = useState<EsitoInstallazione | null>(null);
  const { installa } = useModelliAreaMutations();
  const { data: aziende = [] } = useAziendeLibreria();
  const inCorso = installa.isPending;
  const azienda = aziende.find((a) => a.id === aziendaId) ?? null;
  // Cosa succederebbe alle maggiorazioni di QUELL'azienda: il modello arriva «senza» e senza questo controllo i
  // prodotti nuovi perdono in silenzio quelle che l'azienda ha già (Renova, 05/10/2026).
  const anteprima = useAnteprimaInstallazione({ modelloId: modello.id, companyId: aziendaId, enabled: !esito });
  const [copia, setCopia] = useState(true);
  const recente = !!anteprima.data?.installazione_recente;
  // Un secondo click prima che la finestra se ne accorga non parte.
  const invioInCorso = useRef(false);

  const note = useMemo(
    () => new Map(modello.installazioni.map((i) => [i.company_id, `già installato il ${giorno(i.installato_il)}`])),
    [modello.installazioni],
  );

  const vai = () => {
    if (!aziendaId || inCorso || anteprima.isLoading || recente || invioInCorso.current) return;
    invioInCorso.current = true;
    // Se c'è da scegliere si passa la scelta; se non c'è niente da copiare non si passa nulla, così il database
    // resta la rete di sicurezza anche quando l'anteprima è vecchia.
    const daScegliere = haMaggiorazioniDaCopiare(anteprima.data);
    installa.mutate(
      { modelloId: modello.id, companyId: aziendaId, copiaMaggiorazioni: daScegliere ? copia : undefined },
      {
        onSuccess: (e) => setEsito(e),
        onError: (e) => {
          const tipo = tipoErroreInstallazione(e);
          if (tipo === "recente" || tipo === "in_corso") {
            toast.info(messaggioErroreInstallazione(e));
          } else if (tipo === "scelta_maggiorazioni") {
            toast.warning("Prima scegli cosa fare delle maggiorazioni", { description: messaggioErroreInstallazione(e) });
            void anteprima.refetch();
          } else {
            toast.error("Modello non installato", { description: messaggioErroreInstallazione(e) });
          }
        },
        onSettled: () => {
          invioInCorso.current = false;
        },
      },
    );
  };

  const racconto = esito ? testoEsito(esito) : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !inCorso) onChiudi();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Installa «{modello.nome}»</DialogTitle>
          <DialogDescription>{testoContenuto(modello.riepilogo)}</DialogDescription>
        </DialogHeader>

        {racconto ? (
          <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div>
              <p className="font-medium">
                {azienda ? `${azienda.name}: ` : ""}
                {racconto.titolo}
              </p>
              {racconto.dettaglio && <p className="mt-1 text-muted-foreground">{racconto.dettaglio}</p>}
            </div>
          </div>
        ) : (
          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            <SceltaAzienda
              valore={aziendaId}
              onScegli={setAziendaId}
              note={note}
              etichetta="Azienda in cui installare il modello"
              disabilitata={inCorso}
            />
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {testoPrezzi(modello.con_prezzi_vendita)} Tipologie e linee con lo stesso nome si riusano; i prodotti che
              l&apos;azienda ha già con lo stesso nome restano come sono.
            </p>
            {aziendaId && (
              <AvvisoInstallazioneModello
                anteprima={anteprima.data}
                caricamento={anteprima.isLoading}
                copia={copia}
                onCopia={setCopia}
                disabilitato={inCorso}
              />
            )}
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          {racconto ? (
            <Button onClick={onChiudi} className="h-10 w-full sm:w-auto">
              Chiudi
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onChiudi} disabled={inCorso} className="h-10 w-full sm:w-auto">
                Annulla
              </Button>
              <Button
                onClick={vai}
                disabled={!aziendaId || inCorso || anteprima.isLoading || recente}
                className="h-10 w-full sm:w-auto"
              >
                {inCorso ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Installo…
                  </>
                ) : azienda ? (
                  `Installa in ${azienda.name}`
                ) : (
                  "Installa"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
