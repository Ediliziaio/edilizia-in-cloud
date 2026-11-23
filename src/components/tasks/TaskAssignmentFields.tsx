import { useId } from "react";
import "./task-editor-dialog.css";
import { Label } from "@/components/ui/label";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
  const office = offices.find(o => o.id === officeId);
  const candidates = people.filter(p => (!officeId || office?.membri.includes(p.id)) && (canAssignOthers || p.id === userId));
  const options = candidates.map(p => ({ value: p.id, label: p.id === userId ? t("Me stesso") : p.name }));
  // Keep the recorded person readable when editing an old/inactive area.
  if (officeDisabled && assigneeId && !options.some(o => o.value === assigneeId)) {
    options.push({ value: assigneeId, label: people.find(p => p.id === assigneeId)?.name || t("Responsabile assegnato") });
  }
  return (
    <div className="space-y-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-office`}>{t("Area / Ufficio")}</Label>
          <OfficeSelect id={`${id}-office`} label={t("Area / Ufficio")} value={officeId}
            disabled={officeDisabled || loading || error}
            onValueChange={onOfficeChange}
            options={[{ value: "", label: t("Attività individuale") }, ...offices.map(o => ({ value: o.id, label: o.nome })), ...(officeId && !office ? [{ value: officeId, label: t("Area associata (non attiva)") }] : [])]} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-assignee`}>{t("Assegna a")}</Label>
          <OfficeSelect id={`${id}-assignee`} label={t("Assegna a")} value={assigneeId}
            disabled={loading || error || (!canAssignOthers && !officeId)}
            onValueChange={onAssigneeChange}
            options={[...(officeId ? [{ value: "", label: t("Da prendere in carico") }] : []), ...options]} />
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{t("Aree o responsabili non disponibili.")} <button type="button" className="underline" onClick={onRetry}>{t("Riprova")}</button></p>
        : loading ? <p role="status" className="text-xs text-muted-foreground">{t("Caricamento aree e responsabili…")}</p>
        : !offices.length && !officeId ? <p className="text-xs text-muted-foreground">{t("Nessuna area attiva disponibile. Puoi assegnare l’attività a una persona.")}{manageOffices && <> <a href="/azienda/personale?tab=uffici" target="_blank" rel="noreferrer" className="text-primary underline">{t("Gestisci uffici")}</a></>}</p>
        : officeId ? <p className="text-xs text-muted-foreground">{t("Condivisa con l’area secondo i permessi. Scegli un membro oppure lasciala da prendere in carico.")}</p>
        : <p className="text-xs text-muted-foreground">{t("Attività assegnata a una persona, senza un’area di riferimento.")}</p>}
    </div>
  );
}
