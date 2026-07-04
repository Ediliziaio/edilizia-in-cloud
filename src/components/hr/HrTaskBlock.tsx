/**
 * HrTaskBlock — task/obiettivi assegnati a una persona.
 * Lista con badge priorità/stato + scadenza IT, aggiunta inline, toggle stato,
 * eliminazione con conferma. Pattern gemello di HrDocumentiSection/HrAssenzeSection.
 */
import { useState } from "react";
import { useHrTask, useHrTaskMutations } from "@/hooks/useHrTask";
import type { HrTask, TaskPriorita, TaskStato } from "@/types/hr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ListChecks, Plus, Trash2, Loader2, Check, Circle, CircleDot } from "lucide-react";

function fmt(d: string | null): string {
  if (!d) return "—";
  const [y, m, g] = d.split("-");
  return `${g}/${m}/${y}`;
}

const PRIORITA: { value: TaskPriorita; label: string; cls: string }[] = [
  { value: "bassa", label: "Bassa", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "media", label: "Media", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "alta", label: "Alta", cls: "bg-red-100 text-red-800 border-red-200" },
];
const STATO: Record<TaskStato, { label: string; cls: string }> = {
  da_fare: { label: "Da fare", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  in_corso: { label: "In corso", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  fatto: { label: "Fatto", cls: "bg-green-100 text-green-800 border-green-200" },
  annullato: { label: "Annullato", cls: "bg-slate-100 text-slate-500 border-slate-200 line-through" },
};

// stato successivo al click sull'icona di completamento
const NEXT_STATO: Record<TaskStato, TaskStato> = {
  da_fare: "in_corso",
  in_corso: "fatto",
  fatto: "da_fare",
  annullato: "da_fare",
};

interface Props { profiloId: string; companyId: string; }

export function HrTaskBlock({ profiloId, companyId }: Props) {
  const { data: tasks = [], isLoading } = useHrTask(profiloId);
  const { create, setStato, remove } = useHrTaskMutations(profiloId, companyId);

  const [titolo, setTitolo] = useState("");
  const [scadenza, setScadenza] = useState("");
  const [priorita, setPriorita] = useState<TaskPriorita>("media");

  const add = async () => {
    if (!titolo.trim()) return;
    await create.mutateAsync({ titolo, scadenza: scadenza || null, priorita });
    setTitolo(""); setScadenza(""); setPriorita("media");
  };

  const priCls = (p: TaskPriorita) => PRIORITA.find((x) => x.value === p)?.cls ?? "";
  const priLabel = (p: TaskPriorita) => PRIORITA.find((x) => x.value === p)?.label ?? p;

  const StatoIcon = ({ t }: { t: HrTask }) => {
    if (t.stato === "fatto") return <Check className="h-4 w-4 text-green-600" />;
    if (t.stato === "in_corso") return <CircleDot className="h-4 w-4 text-blue-600" />;
    return <Circle className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground">TASK & OBIETTIVI</h4>
      </div>

      {/* Riga aggiunta inline */}
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Nuovo task</label>
          <Input
            value={titolo}
            onChange={(e) => setTitolo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="es. Chiudere consuntivo cantiere Rossi"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Scadenza</label>
          <Input type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} className="w-full sm:w-40" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Priorità</label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-28"
            value={priorita}
            onChange={(e) => setPriorita(e.target.value as TaskPriorita)}
          >
            {PRIORITA.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <Button onClick={add} disabled={create.isPending || !titolo.trim()} className="shrink-0">
          {create.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}Aggiungi
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Nessun task assegnato. Aggiungi il primo obiettivo qui sopra.
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const sb = STATO[t.stato];
            return (
              <div key={t.id} className="flex items-start gap-2 rounded-lg border p-3">
                <button
                  type="button"
                  className="mt-0.5 shrink-0"
                  title="Cambia stato"
                  onClick={() => setStato.mutate({ id: t.id, stato: NEXT_STATO[t.stato] })}
                >
                  <StatoIcon t={t} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium text-sm ${t.stato === "fatto" || t.stato === "annullato" ? "text-muted-foreground line-through" : ""}`}>
                      {t.titolo}
                    </span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priCls(t.priorita)}`}>{priLabel(t.priorita)}</Badge>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sb.cls}`}>{sb.label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {t.scadenza ? <>Scadenza <b>{fmt(t.scadenza)}</b></> : "Senza scadenza"}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={t.stato}
                    onChange={(e) => setStato.mutate({ id: t.id, stato: e.target.value as TaskStato })}
                  >
                    {(Object.keys(STATO) as TaskStato[]).map((s) => (
                      <option key={s} value={s}>{STATO[s].label}</option>
                    ))}
                  </select>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Elimina">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminare il task?</AlertDialogTitle>
                        <AlertDialogDescription>{t.titolo}. L'operazione è irreversibile.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(t.id)}>Elimina</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
