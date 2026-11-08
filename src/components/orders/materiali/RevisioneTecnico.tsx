// Il riquadro del tecnico sopra i materiali della commessa: le fasi in verifica,
// le righe da guardare per prime (toccate a mano o senza quantità) e «Valida
// tutte» per le fasi che vengono dritte dal calcolo (lib/distinta/revisioneTecnico.ts).
import { useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ETICHETTA_MOTIVO, dettaglioRevisione, type RevisioneFase } from "@/lib/distinta/revisioneTecnico";

const MAX_RIGHE = 4;

export function RevisioneTecnico({ revisione, onApriFase, onValida, inCorso }: {
  revisione: RevisioneFase[];
  onApriFase: (phaseId: string) => void;
  onValida: (fasi: Array<{ phaseId: string; nome: string }>) => void;
  inCorso: boolean;
}) {
  const [conferma, setConferma] = useState(false);
  if (revisione.length === 0) return null;
  const validabili = revisione.filter((f) => f.validabileInBlocco);
  const daGuardare = revisione.reduce((n, f) => n + f.daGuardare.length, 0);

  return (
    <section aria-labelledby="revisione-tecnico" className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="revisione-tecnico" className="flex items-center gap-1.5 font-semibold">
            <ClipboardCheck className="h-4 w-4" aria-hidden />
            {revisione.length === 1 ? "1 fase da validare" : `${revisione.length} fasi da validare`}
          </h3>
          <p className="text-xs text-muted-foreground">
            {daGuardare === 0
              ? "Tutte le righe vengono dal calcolo del computo o delle tavole, nessuna toccata a mano."
              : `${daGuardare} ${daGuardare === 1 ? "riga da guardare" : "righe da guardare"} prima di validare; le altre vengono dal calcolo.`}
          </p>
        </div>
        {validabili.length > 0 && (
          <Button size="sm" onClick={() => setConferma(true)} disabled={inCorso}>
            {inCorso && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
            {validabili.length === revisione.length ? "Valida tutte" : validabili.length === 1 ? "Valida la fase pronta" : `Valida le ${validabili.length} pronte`}
          </Button>
        )}
      </div>

      <ul className="mt-2 space-y-2">
        {revisione.map((f) => (
          <li key={f.phaseId} className="rounded-md border bg-card px-2.5 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="text-left font-medium underline-offset-2 hover:underline" onClick={() => onApriFase(f.phaseId)}>
                {f.nome}
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {f.totale} {f.totale === 1 ? "materiale" : "materiali"}
                {f.daGuardare.length ? ` · ${f.daGuardare.length} da guardare` : " · tutto dal calcolo"}
                {!f.validabileInBlocco && " · da correggere prima"}
              </span>
            </div>
            {f.daGuardare.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs">
                {f.daGuardare.slice(0, MAX_RIGHE).map((d) => (
                  <li key={d.riga.id} className="flex flex-wrap gap-x-1.5">
                    <span className={d.motivo === "senza_quantita" ? "font-medium text-red-700 dark:text-red-300" : "font-medium text-amber-800 dark:text-amber-200"}>
                      {ETICHETTA_MOTIVO[d.motivo]}
                    </span>
                    <span className="truncate">{d.riga.name}</span>
                    <span className="text-muted-foreground">— {dettaglioRevisione(d)}</span>
                  </li>
                ))}
                {f.daGuardare.length > MAX_RIGHE && (
                  <li>
                    <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => onApriFase(f.phaseId)}>
                      e altre {f.daGuardare.length - MAX_RIGHE}: apri la fase
                    </button>
                  </li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog open={conferma} onOpenChange={setConferma}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Validare {validabili.length === 1 ? "1 fase" : `${validabili.length} fasi`}?</AlertDialogTitle>
            <AlertDialogDescription>
              I materiali passano all'ufficio acquisti, che può ordinarli. Per cambiarli dopo, la fase torna in bozza.
              {daGuardare > 0 && " Le righe toccate a mano sono comprese: se non le hai guardate, apri prima la fase."}
              {validabili.length < revisione.length && ` ${revisione.length - validabili.length} con righe senza quantità restano in verifica.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-48 space-y-0.5 overflow-y-auto text-sm">
            {validabili.map((f) => <li key={f.phaseId}>{f.nome} · {f.totale} materiali</li>)}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConferma(false); onValida(validabili.map((f) => ({ phaseId: f.phaseId, nome: f.nome }))); }}>
              Valida
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
