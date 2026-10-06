import { useRef, useState, type ReactNode } from "react";
import { Building2, Loader2, Pencil, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import type { ExecutorOption, PhaseAssignment } from "@/hooks/useOrderWorkPhases";
import { usePermissions } from "@/hooks/usePermissions";
import { parseWorkAmount } from "@/lib/orders/workPlanning";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export type AssignmentPatch = Partial<Pick<PhaseAssignment,
  "cost_preventivo" | "cost_consuntivo" | "hours" | "is_paid" | "paid_date" | "phase_id" | "notes">>;

// «1.140,00 €» come nel resto della commessa (formatCurrency), non «1140,00 €».
const eur = { format: formatCurrency };

function resolveExecutorLabel(a: PhaseAssignment, employees: ExecutorOption[], teams: ExecutorOption[]) {
  return a.executor_type === "interno"
    ? employees.find(e => e.id === a.employee_id)?.label ?? "Dipendente non disponibile"
    : teams.find(t => t.id === a.external_team_id)?.label ?? "Ditta non disponibile";
}

/**
 * Elenco di persone e ditte di una fase (06/10/2026): un riquadro solo, una
 * riga per assegnazione e i due costi in colonna sotto la loro intestazione,
 * invece di un riquadro per persona con i costi ripetuti in ognuno.
 */
export function ElencoAssegnazioni({ children }: { children: ReactNode }) {
  const { canEditOrders, canViewCosts } = usePermissions();
  return (
    <div className="divide-y overflow-hidden rounded-lg border bg-background">
      {canViewCosts && (
        <div aria-hidden="true" className="flex items-center gap-3 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground max-sm:hidden">
          <span className="flex-1 pl-10">Persona o ditta</span>
          <span className="w-28 text-right">Costo previsto</span>
          <span className="w-28 text-right">Costo consuntivo</span>
          {canEditOrders && <span className="w-8" />}
        </div>
      )}
      {children}
    </div>
  );
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
  // Chi è al lavoro vede la commessa nell'app nei giorni della fase: qui si
  // vede subito chi l'app non ce l'ha.
  const persona = internal ? employees.find(e => e.id === a.employee_id) : undefined;
  const senzaApp = !!persona && !persona.campoUserId;
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

  const sforato = a.cost_preventivo > 0 && a.cost_consuntivo > a.cost_preventivo;
  // Una riga dell'elenco (ElencoAssegnazioni): chi è, che cosa fa, i due costi
  // nelle colonne dell'intestazione, la matita per gestirla.
  return <div className="flex items-start gap-3 px-3 py-2.5">
    <span aria-hidden="true" className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", internal ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700")}>
      {internal ? <UserRound className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
    </span>
    <div className="min-w-0 flex-1">
      <p className="break-words text-sm font-medium">{name}</p>
      {/* Testo che va a capo da sé: niente puntini rimasti soli in fondo alla riga */}
      <p className="text-xs text-muted-foreground">
        <span>{internal ? "Dipendente" : "Ditta esterna"}</span>
        {internal && <> · <span>{a.hours ?? 0} h registrate</span></>}
        {senzaApp && <> · <span className="font-medium text-amber-700"><span className="sm:hidden">senza app</span><span className="max-sm:hidden">senza app: non vede la commessa</span></span></>}
        {!internal && canViewCosts && <span className="max-sm:hidden"> · {a.is_paid ? "pagamento registrato" : "pagamento da registrare"}</span>}
      </p>
      {a.notes && <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">{a.notes}</p>}
    </div>
    {canViewCosts && <>
      <span className="w-28 shrink-0 pt-0.5 text-right text-sm tabular-nums max-sm:hidden">
        <span className="sr-only">Costo previsto </span>{eur.format(a.cost_preventivo)}
      </span>
      <span className={cn("w-28 shrink-0 pt-0.5 text-right text-sm tabular-nums max-sm:hidden", sforato && "font-medium text-rose-700")}>
        <span className="sr-only">Costo consuntivo </span>{eur.format(a.cost_consuntivo)}
      </span>
    </>}
    {canEditOrders && <Button size="icon" variant="ghost" onClick={startEditing} aria-label={`Gestisci ${name}`} title="Gestisci" className="tap-compact h-8 w-8 shrink-0 text-muted-foreground">
      <Pencil className="h-4 w-4" />
    </Button>}
    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Gestisci assegnazione</DialogTitle><DialogDescription>{name} · {internal ? "Dipendente interno" : "Ditta esterna"}</DialogDescription></DialogHeader>
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
                <div><Label htmlFor={`budget-${a.id}`}>Costo previsto €</Label><Input id={`budget-${a.id}`} type="number" min="0" step="0.01" value={draft.budget} disabled={busy} onChange={e => setDraft({ ...draft, budget: e.target.value })} /></div>
                <div><Label htmlFor={`cost-${a.id}`}>Costo consuntivo €</Label><Input id={`cost-${a.id}`} type="number" min="0" step="0.01" value={draft.cost} disabled={busy} onChange={e => setDraft({ ...draft, cost: e.target.value })} /></div>
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
