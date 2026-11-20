import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PIPELINE_PRINCIPALE,
  statiPerPipeline,
  statoDiPartenza,
  type SceltaPipelineCreazione,
} from "@/lib/orders/pipelineCreazione";
import type { PipelineLocale } from "@/lib/orders/pipelineLocali";
import type { OrderStatus } from "@/lib/orderUtils";

interface Props {
  pipeline: ReadonlyArray<PipelineLocale>;
  statiPrincipali: ReadonlyArray<OrderStatus>;
  value: SceltaPipelineCreazione;
  onChange: (value: SceltaPipelineCreazione) => void;
  caricamento?: boolean;
  errore?: string | null;
  statiPrincipaliInCaricamento?: boolean;
  erroreStatiPrincipali?: boolean;
  disabled?: boolean;
  onRiprova?: () => void;
  onRiprovaStati?: () => void;
  principale?: boolean;
}

export function StatoPipelineIniziale({
  pipeline, statiPrincipali, value, onChange, caricamento, errore,
  statiPrincipaliInCaricamento, erroreStatiPrincipali, disabled, onRiprova,
  onRiprovaStati, principale = true,
}: Props) {
  const id = useId();
  const usaPrincipale = value.pipelineId === PIPELINE_PRINCIPALE;
  const disponibile = usaPrincipale ? principale : pipeline.some((p) => p.id === value.pipelineId);
  const stati = statiPerPipeline(value.pipelineId, pipeline, statiPrincipali);
  const statiInCaricamento = caricamento || (usaPrincipale && statiPrincipaliInCaricamento);
  const statiNonCaricati = (usaPrincipale && erroreStatiPrincipali) || (!usaPrincipale && errore);
  const statoValido = stati.some((stato) => stato.id === value.faseId);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-pipeline`}>Pipeline commessa</Label>
          <Select
            value={usaPrincipale && !principale ? "" : value.pipelineId}
            disabled={disabled || caricamento}
            onValueChange={(pipelineId) => onChange({
              pipelineId,
              faseId: statoDiPartenza(statiPerPipeline(pipelineId, pipeline, statiPrincipali)),
            })}
          >
            <SelectTrigger id={`${id}-pipeline`}>
              <SelectValue placeholder="Scegli la pipeline" />
            </SelectTrigger>
            <SelectContent>
              {principale && <SelectItem value={PIPELINE_PRINCIPALE}>Principale</SelectItem>}
              {!usaPrincipale && !disponibile && <SelectItem disabled value={value.pipelineId}>Pipeline non disponibile</SelectItem>}
              {pipeline.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-stato`}>Stato iniziale</Label>
          <Select
            value={disponibile && statoValido ? value.faseId : ""}
            disabled={disabled || statiInCaricamento || !disponibile || stati.length === 0}
            onValueChange={(faseId) => onChange({ ...value, faseId })}
          >
            <SelectTrigger id={`${id}-stato`}>
              <SelectValue placeholder="Seleziona stato" />
            </SelectTrigger>
            <SelectContent>
              {stati.map((stato) => <SelectItem key={stato.id} value={stato.id}>{stato.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {statiInCaricamento && <p role="status" className="text-xs text-muted-foreground">Caricamento pipeline e stati…</p>}
      {!caricamento && !errore && !disponibile && (
        <p role="alert" className="text-xs text-destructive">
          {usaPrincipale ? "Scegli la pipeline della commessa." : "La pipeline della bozza non è più disponibile. Scegline un’altra."}
        </p>
      )}
      {!statiInCaricamento && !statiNonCaricati && disponibile && (
        stati.length === 0
          ? <p role="alert" className="text-xs text-destructive">Questa pipeline non ha stati disponibili. Verifica la configurazione o scegli un’altra pipeline.</p>
          : value.faseId && !statoValido
            ? <p role="alert" className="text-xs text-destructive">Lo stato precedente non è più disponibile. Scegline uno dall’elenco.</p>
            : null
      )}
      {errore && (
        <div role="alert" className="text-xs text-destructive">
          Non riesco a caricare le pipeline aggiuntive.
          {onRiprova && <Button type="button" variant="link" size="sm" onClick={onRiprova}>Riprova pipeline</Button>}
        </div>
      )}
      {usaPrincipale && erroreStatiPrincipali && (
        <div role="alert" className="text-xs text-destructive">
          Non riesco a caricare gli stati della pipeline.
          {onRiprovaStati && <Button type="button" variant="link" size="sm" onClick={onRiprovaStati}>Riprova stati</Button>}
        </div>
      )}
    </div>
  );
}
