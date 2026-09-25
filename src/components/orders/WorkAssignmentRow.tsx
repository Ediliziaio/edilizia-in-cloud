import { useRef, useState } from "react";
import { Building2, Clock3, Loader2, Pencil, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import type { ExecutorOption, PhaseAssignment } from "@/hooks/useOrderWorkPhases";
import { usePermissions } from "@/hooks/usePermissions";
import { parseWorkAmount } from "@/lib/orders/workPlanning";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export type AssignmentPatch = Partial<Pick<PhaseAssignment,
  "cost_preventivo" | "cost_consuntivo" | "hours" | "is_paid" | "paid_date" | "phase_id" | "notes">>;

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function resolveExecutorLabel(a: PhaseAssignment, employees: ExecutorOption[], teams: ExecutorOption[]) {
  return a.executor_type === "interno"
    ? employees.find(e => e.id === a.employee_id)?.label ?? "Dipendente non disponibile"
    : teams.find(t => t.id === a.external_team_id)?.label ?? "Squadra non disponibile";
}

interface Props {
  assignment: PhaseAssignment;
  employees: ExecutorOption[];
  externalTeams: ExecutorOption[];
  phases: { id: string; name: string }[];
  onUpdate: (patch: AssignmentPatch) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}

export function WorkAssignmentRow({ assignment: a, employees, externalTeams, phases, onUpdate, onDelete }: Props) {
  const { canEditOrders, canViewCosts, canManagePayments } = usePermissions();
  const internal = a.executor_type === "interno";
  const name = resolveExecutorLabel(a, employees, externalTeams);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const initial = useRef(a);
  const [draft, setDraft] = useState({ phase: "", notes: "", hours: "", budget: "", cost: "", paid: false });
  const startEditing = () => {
    initial.current = a;
    setDraft({ phase: a.phase_id ?? "", notes: a.notes ?? "", hours: a.hours == null ? "" : String(a.hours),
      budget: String(a.cost_preventivo), cost: String(a.cost_consuntivo), paid: a.is_paid });
    setError("");
    setOpen(true);
  };
  const save = async () => {
    if (!canEditOrders || busy) return;
    const budget = parseWorkAmount(draft.budget);
    const cost = parseWorkAmount(draft.cost);
    const hours = parseWorkAmount(draft.hours);
    if ((canViewCosts && (budget === null || cost === null)) || (internal && hours === null)) {
      setError("Inserisci importi e ore validi, maggiori o uguali a zero.");
      return;
    }
    // Only changed fields: editing an operational note must not overwrite costs
    // or hours refreshed by an approved field report in the meantime.
    const patch: AssignmentPatch = {};
    const base = initial.current;
    if ((draft.phase || null) !== base.phase_id) patch.phase_id = draft.phase || null;
    if ((draft.notes.trim() || null) !== base.notes) patch.notes = draft.notes.trim() || null;
    const newHours = draft.hours.trim() ? hours : null;
    if (internal && newHours !== base.hours) patch.hours = newHours;
    if (canViewCosts && budget !== base.cost_preventivo) patch.cost_preventivo = budget!;
    if (canViewCosts && cost !== base.cost_consuntivo) patch.cost_consuntivo = cost!;
    if (canViewCosts && canManagePayments && draft.paid !== base.is_paid) {
      patch.is_paid = draft.paid;
      patch.paid_date = draft.paid ? new Date().toISOString().slice(0, 10) : null;
    }
    if (!Object.keys(patch).length) { setOpen(false); return; }
    setBusy(true);
    try { await onUpdate(patch); setOpen(false); }
    catch { setError("Salvataggio non riuscito. I dati inseriti sono conservati: riprova."); }
    finally { setBusy(false); }
  };

  return <div className="rounded-xl border bg-background p-3 sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className={`rounded-lg p-2 ${internal ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>
          {internal ? <UserRound className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="break-words text-sm font-semibold">{name}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{internal ? "Dipendente" : "Squadra esterna"}</Badge>
            {internal && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{a.hours ?? 0} h registrate</span>}
            {!internal && <span>Affidamento esterno</span>}
          </div>
          {a.notes && <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{a.notes}</p>}
        </div>
      </div>
      {canEditOrders && <Button size="sm" variant="outline" onClick={startEditing} aria-label={`Gestisci ${name}`}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" />Gestisci
      </Button>}
    </div>
    {canViewCosts && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
      <span>Budget <strong className="font-medium text-foreground">{eur.format(a.cost_preventivo)}</strong></span>
      <span>Costo registrato <strong className="font-medium text-foreground">{eur.format(a.cost_consuntivo)}</strong></span>
      {!internal && <span>{a.is_paid ? "Pagamento registrato" : "Pagamento da registrare"}</span>}
    </div>}
    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Gestisci assegnazione</DialogTitle><DialogDescription>{name} · {internal ? "Dipendente interno" : "Squadra esterna"}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">Lavorazione
            <select aria-label="Lavorazione assegnata" value={draft.phase} onChange={e => setDraft({ ...draft, phase: e.target.value })} disabled={busy}
              className="flex h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Intera commessa · senza fase</option>
              {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="space-y-1.5"><Label htmlFor={`notes-${a.id}`}>Attività e accordi</Label>
            <Textarea id={`notes-${a.id}`} value={draft.notes} disabled={busy} rows={3} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          {internal && <div className="space-y-1.5"><Label htmlFor={`hours-${a.id}`}>Ore registrate</Label>
            <Input id={`hours-${a.id}`} type="number" min="0" step="0.5" value={draft.hours} disabled={busy} onChange={e => setDraft({ ...draft, hours: e.target.value })} />
            <p className="text-xs text-muted-foreground">Rettifica manuale del totale. Non ricalcola automaticamente il costo e non sostituisce i rapportini.</p>
          </div>}
          {canViewCosts && <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Costi e registrazione pagamento</summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">{internal ? "Il costo imputato alla commessa è distinto dal pagamento dello stipendio." : "Il costo dell'affidamento è distinto dalle ore lavorate e dall'approvazione dei rapportini."}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label htmlFor={`budget-${a.id}`}>Budget manodopera €</Label><Input id={`budget-${a.id}`} type="number" min="0" step="0.01" value={draft.budget} disabled={busy} onChange={e => setDraft({ ...draft, budget: e.target.value })} /></div>
                <div><Label htmlFor={`cost-${a.id}`}>Costo registrato €</Label><Input id={`cost-${a.id}`} type="number" min="0" step="0.01" value={draft.cost} disabled={busy} onChange={e => setDraft({ ...draft, cost: e.target.value })} /></div>
              </div>
              {canManagePayments && <label className="flex items-center gap-2 text-sm"><Switch checked={draft.paid} disabled={busy} onCheckedChange={paid => setDraft({ ...draft, paid })} />Pagamento registrato</label>}
              <p className="text-xs text-muted-foreground">Conserva la registrazione economica esistente; non esegue un pagamento bancario.</p>
            </div>
          </details>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" disabled={busy} className="text-destructive"><Trash2 className="mr-1 h-4 w-4" />Rimuovi</Button></AlertDialogTrigger>
            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Rimuovere questa assegnazione?</AlertDialogTitle>
              <AlertDialogDescription>Verrà eliminata la riga di manodopera di {name}, inclusi i costi registrati su questa riga. L'accesso all'app Campo si gestisce separatamente. Per cambiare lavorazione usa invece il campo Lavorazione.</AlertDialogDescription>
            </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={async () => {
              setBusy(true); try { await onDelete(); setOpen(false); } catch { toast.error("Assegnazione non rimossa. Riprova."); } finally { setBusy(false); }
            }}>Rimuovi assegnazione</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
          </AlertDialog>
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Annulla</Button><Button disabled={busy} onClick={save}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salva modifiche</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
