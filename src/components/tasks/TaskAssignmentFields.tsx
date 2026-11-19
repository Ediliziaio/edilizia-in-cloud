import { useId } from "react";
import "./task-editor-dialog.css";
import { Label } from "@/components/ui/label";
import { OfficeSelect } from "@/components/orders/OfficeSelect";

export interface TaskOfficeOption {
  id: string;
  nome: string;
  membri: string[];
}
export interface TaskAssigneeOption { id: string; name: string }

/** The same assignment controls in the daily workspace and in a commessa. */
export function TaskAssignmentFields({
  offices, people, officeId, assigneeId, userId, onOfficeChange,
  onAssigneeChange, officeDisabled, canAssignOthers = true,
  loading, error, onRetry, manageOffices,
}: {
  offices: readonly TaskOfficeOption[];
  people: readonly TaskAssigneeOption[];
  officeId: string;
  assigneeId: string;
  userId?: string;
  onOfficeChange: (id: string) => void;
  onAssigneeChange: (id: string) => void;
  officeDisabled?: boolean;
  canAssignOthers?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  manageOffices?: boolean;
}) {
  const id = useId();
  const office = offices.find(o => o.id === officeId);
  const candidates = people.filter(p => (!officeId || office?.membri.includes(p.id)) && (canAssignOthers || p.id === userId));
  const options = candidates.map(p => ({ value: p.id, label: p.id === userId ? "Me stesso" : p.name }));
  // Keep the recorded person readable when editing an old/inactive area.
  if (officeDisabled && assigneeId && !options.some(o => o.value === assigneeId)) {
    options.push({ value: assigneeId, label: people.find(p => p.id === assigneeId)?.name || "Responsabile assegnato" });
  }
  return (
    <div className="space-y-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-office`}>Area / Ufficio</Label>
          <OfficeSelect id={`${id}-office`} label="Area / Ufficio" value={officeId}
            disabled={officeDisabled || loading || error}
            onValueChange={onOfficeChange}
            options={[{ value: "", label: "Attività individuale" }, ...offices.map(o => ({ value: o.id, label: o.nome })), ...(officeId && !office ? [{ value: officeId, label: "Area associata (non attiva)" }] : [])]} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-assignee`}>Assegna a</Label>
          <OfficeSelect id={`${id}-assignee`} label="Assegna a" value={assigneeId}
            disabled={loading || error || (!canAssignOthers && !officeId)}
            onValueChange={onAssigneeChange}
            options={[...(officeId ? [{ value: "", label: "Da prendere in carico" }] : []), ...options]} />
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">Aree o responsabili non disponibili. <button type="button" className="underline" onClick={onRetry}>Riprova</button></p>
        : loading ? <p role="status" className="text-xs text-muted-foreground">Caricamento aree e responsabili…</p>
        : !offices.length && !officeId ? <p className="text-xs text-muted-foreground">Nessuna area attiva disponibile. Puoi assegnare l’attività a una persona.{manageOffices && <> <a href="/azienda/personale?tab=uffici" target="_blank" rel="noreferrer" className="text-primary underline">Gestisci uffici</a></>}</p>
        : officeId ? <p className="text-xs text-muted-foreground">Condivisa con l’area secondo i permessi. Scegli un membro oppure lasciala da prendere in carico.</p>
        : <p className="text-xs text-muted-foreground">Attività assegnata a una persona, senza un’area di riferimento.</p>}
    </div>
  );
}
