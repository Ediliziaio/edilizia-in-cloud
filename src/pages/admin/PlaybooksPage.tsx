import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, Loader2, Search, Play, CheckCircle2, XCircle, Activity, Workflow, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  usePlaybooksList,
  usePlaybookExecutions,
  useCreatePlaybook,
  useUpdatePlaybook,
  useDeletePlaybook,
  useTogglePlaybook,
} from "@/hooks/superadmin/usePlaybooks";
import type {
  Playbook,
  PlaybookAction,
  PlaybookExecution,
  CreatePlaybookPayload,
} from "@/hooks/superadmin/usePlaybooks";

// ─── Costanti eventi trigger ──────────────────────────────

const TRIGGER_EVENTI: Array<{ value: Playbook["trigger_event"]; label: string }> = [
  { value: "trial_started", label: "Trial iniziato" },
  { value: "trial_expiring_7d", label: "Trial in scadenza (7gg)" },
  { value: "trial_expired", label: "Trial scaduto" },
  { value: "payment_failed", label: "Pagamento fallito" },
  { value: "payment_recovered", label: "Pagamento recuperato" },
  { value: "plan_upgraded", label: "Piano upgradato" },
  { value: "plan_downgraded", label: "Piano downgradato" },
  { value: "account_suspended", label: "Account sospeso" },
  { value: "churned", label: "Churnato" },
  { value: "reactivated", label: "Riattivato" },
];

const TIPI_AZIONE: Array<{ value: PlaybookAction["type"]; label: string; requires: keyof PlaybookAction }> = [
  { value: "send_email", label: "Invia email", requires: "template_id" },
  { value: "add_tag", label: "Aggiungi tag", requires: "tag" },
  { value: "notify_superadmin", label: "Notifica SuperAdmin", requires: "message" },
  { value: "update_flag", label: "Aggiorna flag", requires: "flag" },
];

// ─── Badge colore evento ──────────────────────────────────

function BadgeEvento({ evento }: { evento: Playbook["trigger_event"] }) {
  const colori: Record<Playbook["trigger_event"], string> = {
    trial_started: "bg-green-100 text-green-700 border-green-200",
    trial_expiring_7d: "bg-yellow-100 text-yellow-700 border-yellow-200",
    trial_expired: "bg-yellow-100 text-yellow-700 border-yellow-200",
    payment_failed: "bg-red-100 text-red-700 border-red-200",
    payment_recovered: "bg-yellow-100 text-yellow-700 border-yellow-200",
    plan_upgraded: "bg-blue-100 text-blue-700 border-blue-200",
    plan_downgraded: "bg-yellow-100 text-yellow-700 border-yellow-200",
    account_suspended: "bg-yellow-100 text-yellow-700 border-yellow-200",
    churned: "bg-gray-100 text-gray-700 border-gray-200",
    reactivated: "bg-green-100 text-green-700 border-green-200",
  };
  const label = TRIGGER_EVENTI.find((e) => e.value === evento)?.label ?? evento;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colori[evento]}`}>
      {label}
    </span>
  );
}

function BadgeStato({ stato }: { stato: string }) {
  const mappa: Record<string, string> = {
    pending: "bg-gray-100 text-gray-700 border-gray-200",
    running: "bg-yellow-100 text-yellow-700 border-yellow-200",
    completed: "bg-green-100 text-green-700 border-green-200",
    failed: "bg-red-100 text-red-700 border-red-200",
  };
  const etichette: Record<string, string> = {
    pending: "In attesa",
    running: "In esecuzione",
    completed: "Completato",
    failed: "Fallito",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${mappa[stato] ?? "bg-gray-100 text-gray-700"}`}>
      {etichette[stato] ?? stato}
    </span>
  );
}

// ─── Validation helper ────────────────────────────────────

function validateAction(a: PlaybookAction): string | null {
  if (a.type === "send_email" && !a.template_id?.trim()) return "template_id mancante";
  if (a.type === "add_tag" && !a.tag?.trim()) return "tag mancante";
  if (a.type === "notify_superadmin" && !a.message?.trim()) return "messaggio mancante";
  if (a.type === "update_flag" && !a.flag?.trim()) return "nome flag mancante";
  return null;
}

// ID locale stabile per le action durante l'editing — evita key={index} bug
// quando si rimuove un'azione (prima React riassegnava state agli index sbagliati).
type EditableAction = PlaybookAction & { _localId: string };
function addLocalId(a: PlaybookAction): EditableAction {
  return { ...a, _localId: crypto.randomUUID() };
}

// ─── Card singola azione ──────────────────────────────────

function ActionCard({
  azione, indice, onUpdate, onRimuovi, errore,
}: {
  azione: EditableAction;
  indice: number;
  onUpdate: (indice: number, updates: Partial<EditableAction>) => void;
  onRimuovi: (indice: number) => void;
  errore?: string | null;
}) {
  return (
    <Card className={cn("border", errore ? "border-red-300 bg-red-50/30" : "border-gray-200")}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Tipo azione</Label>
            <Select value={azione.type} onValueChange={(v) => onUpdate(indice, { type: v as PlaybookAction["type"] })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPI_AZIONE.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-28">
            <Label className="text-xs text-muted-foreground">Ritardo (min)</Label>
            <Input
              type="number"
              min={0}
              className="h-8 text-sm"
              value={azione.delay_minutes}
              onChange={(e) => onUpdate(indice, { delay_minutes: Number(e.target.value) })}
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 mt-4"
            onClick={() => onRimuovi(indice)}
            title="Rimuovi azione"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {azione.type === "send_email" && (
          <div>
            <Label className="text-xs text-muted-foreground">ID Template email *</Label>
            <Input
              className="h-8 text-sm"
              placeholder="es. welcome_trial"
              value={azione.template_id ?? ""}
              onChange={(e) => onUpdate(indice, { template_id: e.target.value })}
            />
          </div>
        )}

        {azione.type === "add_tag" && (
          <div>
            <Label className="text-xs text-muted-foreground">Tag da aggiungere *</Label>
            <Input
              className="h-8 text-sm"
              placeholder="es. trial-scaduto"
              value={azione.tag ?? ""}
              onChange={(e) => onUpdate(indice, { tag: e.target.value })}
            />
          </div>
        )}

        {azione.type === "notify_superadmin" && (
          <div>
            <Label className="text-xs text-muted-foreground">Messaggio notifica *</Label>
            <Textarea
              className="text-sm min-h-[60px]"
              rows={2}
              placeholder="es. Azienda {{name}} ha fatto churn"
              value={azione.message ?? ""}
              onChange={(e) => onUpdate(indice, { message: e.target.value })}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Placeholder: <code>{"{{name}}"}</code>, <code>{"{{plan}}"}</code>, <code>{"{{days}}"}</code>
            </p>
          </div>
        )}

        {azione.type === "update_flag" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Nome flag *</Label>
              <Input
                className="h-8 text-sm"
                placeholder="es. is_churned"
                value={azione.flag ?? ""}
                onChange={(e) => onUpdate(indice, { flag: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Valore</Label>
              {/* Toggle Switch per boolean semplici ("true"/"false"), altrimenti input string */}
              <div className="flex items-center gap-2 h-8">
                <Switch
                  checked={azione.value === true || azione.value === "true"}
                  onCheckedChange={(v) => onUpdate(indice, { value: v })}
                />
                <span className="text-xs text-muted-foreground">
                  {azione.value === true || azione.value === "true" ? "true" : "false"}
                </span>
              </div>
            </div>
          </div>
        )}

        {errore && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {errore}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Editor playbook inline ───────────────────────────────

function EditorPlaybook({ playbook, onChiudi }: { playbook: Playbook; onChiudi: () => void }) {
  const [nome, setNome] = useState(playbook.name);
  const [triggerEvent, setTriggerEvent] = useState<Playbook["trigger_event"]>(playbook.trigger_event);
  const [delayHours, setDelayHours] = useState(playbook.delay_hours);
  const [isActive, setIsActive] = useState(playbook.is_active);
  const [azioni, setAzioni] = useState<EditableAction[]>(() => playbook.actions.map(addLocalId));
  const [showValidation, setShowValidation] = useState(false);

  // BUG FIX: prima se l'utente selezionava un altro playbook senza chiudere,
  // gli state erano inizializzati solo al primo mount → mostrava dati del
  // playbook precedente. Ora sync quando cambia l'id del playbook.
  useEffect(() => {
    setNome(playbook.name);
    setTriggerEvent(playbook.trigger_event);
    setDelayHours(playbook.delay_hours);
    setIsActive(playbook.is_active);
    setAzioni(playbook.actions.map(addLocalId));
    setShowValidation(false);
  }, [playbook.id]);

  const { mutate: salva, isPending: salvando } = useUpdatePlaybook();

  function aggiungiAzione() {
    setAzioni((prev) => [...prev, addLocalId({ type: "send_email", delay_minutes: 0 })]);
  }
  function aggiornaAzione(indice: number, updates: Partial<EditableAction>) {
    setAzioni((prev) => prev.map((a, i) => (i === indice ? { ...a, ...updates } : a)));
  }
  function rimuoviAzione(indice: number) {
    setAzioni((prev) => prev.filter((_, i) => i !== indice));
  }

  // Validazione
  const erroriAzioni = useMemo(() => azioni.map(validateAction), [azioni]);
  const hasErrors = erroriAzioni.some(Boolean) || !nome.trim();
  const erroreNome = !nome.trim() ? "Nome obbligatorio" : null;

  function handleSalva() {
    if (hasErrors) {
      setShowValidation(true);
      return;
    }
    // Rimuove _localId prima di persistere
    const cleanActions: PlaybookAction[] = azioni.map(({ _localId, ...rest }) => rest);
    salva(
      {
        id: playbook.id,
        name: nome.trim(),
        trigger_event: triggerEvent,  // BUG FIX: prima veniva ignorato
        is_active: isActive,
        delay_hours: delayHours,
        actions: cleanActions,
      },
      { onSuccess: onChiudi },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base">Modifica playbook</h3>
        <Button variant="ghost" size="sm" onClick={onChiudi}>Chiudi</Button>
      </div>

      <div>
        <Label>Nome playbook *</Label>
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className={cn("mt-1", showValidation && erroreNome && "border-red-500")}
        />
        {showValidation && erroreNome && (
          <p className="text-xs text-red-600 mt-1">{erroreNome}</p>
        )}
      </div>

      <div>
        <Label>Evento trigger</Label>
        <Select value={triggerEvent} onValueChange={(v) => setTriggerEvent(v as Playbook["trigger_event"])}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_EVENTI.map((e) => (
              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <Label>Ritardo esecuzione (ore)</Label>
          <Input
            type="number"
            min={0}
            className="mt-1"
            value={delayHours}
            onChange={(e) => setDelayHours(Number(e.target.value))}
          />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label>{isActive ? "Attivo" : "Inattivo"}</Label>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Azioni ({azioni.length})</Label>
          {showValidation && erroriAzioni.filter(Boolean).length > 0 && (
            <span className="text-xs text-red-600">
              {erroriAzioni.filter(Boolean).length} errori di validazione
            </span>
          )}
        </div>
        <div className="space-y-2">
          {azioni.map((az, i) => (
            <ActionCard
              key={az._localId}   // BUG FIX: key stabile (prima era `key={i}`)
              azione={az}
              indice={i}
              onUpdate={aggiornaAzione}
              onRimuovi={rimuoviAzione}
              errore={showValidation ? erroriAzioni[i] : null}
            />
          ))}
        </div>

        <Button variant="outline" size="sm" className="mt-2 w-full border-dashed" onClick={aggiungiAzione}>
          <Plus className="h-4 w-4 mr-1" /> Aggiungi azione
        </Button>
      </div>

      <Button className="w-full" onClick={handleSalva} disabled={salvando}>
        {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        <Save className="h-4 w-4 mr-2" />
        Salva Playbook
      </Button>
    </div>
  );
}

// ─── Dialog: nuovo playbook ───────────────────────────────

function DialogNuovoPlaybook({ aperto, onChiudi }: { aperto: boolean; onChiudi: () => void }) {
  const [nome, setNome] = useState("");
  const [evento, setEvento] = useState<Playbook["trigger_event"]>("trial_started");
  const { mutate: crea, isPending: creando } = useCreatePlaybook();

  // BUG FIX: reset form on open/close così non trascina stato da sessione precedente
  useEffect(() => {
    if (aperto) {
      setNome("");
      setEvento("trial_started");
    }
  }, [aperto]);

  function handleCrea() {
    if (!nome.trim()) return;
    const payload: CreatePlaybookPayload = { name: nome.trim(), trigger_event: evento };
    crea(payload, { onSuccess: onChiudi });
  }

  return (
    <Dialog open={aperto} onOpenChange={onChiudi}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Nuovo playbook</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nome playbook</Label>
            <Input className="mt-1" placeholder="es. Benvenuto trial" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <Label>Evento trigger</Label>
            <Select value={evento} onValueChange={(v) => setEvento(v as Playbook["trigger_event"])}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIGGER_EVENTI.map((e) => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>Annulla</Button>
          <Button onClick={handleCrea} disabled={creando || !nome.trim()}>
            {creando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crea playbook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI overview ─────────────────────────────────────────

function PlaybookStats({ playbooks, executions }: { playbooks: Playbook[]; executions: PlaybookExecution[] }) {
  const stats = useMemo(() => {
    const totali = playbooks.length;
    const attivi = playbooks.filter(p => p.is_active).length;
    const sevenDaysAgo = Date.now() - 7 * 86400 * 1000;
    const exec7d = executions.filter(e => new Date(e.started_at).getTime() > sevenDaysAgo);
    const success = exec7d.filter(e => e.status === "completed").length;
    const failed = exec7d.filter(e => e.status === "failed").length;
    const successRate = exec7d.length > 0 ? Math.round((success / exec7d.length) * 100) : null;
    return { totali, attivi, exec7d: exec7d.length, success, failed, successRate };
  }, [playbooks, executions]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard icon={<Workflow className="h-4 w-4" />} label="Playbook totali" value={stats.totali} subtitle={`${stats.attivi} attivi`} accent="bg-primary/10 text-primary" />
      <StatCard icon={<Activity className="h-4 w-4" />} label="Esecuzioni 7gg" value={stats.exec7d} accent="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" />
      <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Success rate 7gg" value={stats.successRate != null ? `${stats.successRate}%` : "—"} subtitle={stats.successRate != null ? `${stats.success}/${stats.exec7d}` : "nessuna esec."} accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" />
      <StatCard icon={<XCircle className="h-4 w-4" />} label="Errori 7gg" value={stats.failed} accent={stats.failed > 0 ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-muted text-muted-foreground"} />
    </div>
  );
}

function StatCard({ icon, label, value, subtitle, accent }: {
  icon: React.ReactNode; label: string; value: string | number; subtitle?: string; accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-start gap-2.5">
        <div className={cn("p-1.5 rounded-lg shrink-0", accent)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          <p className="text-xl font-bold leading-tight mt-0.5">{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Tab esecuzioni ───────────────────────────────────────

function TabEsecuzioni() {
  const [statusFilter, setStatusFilter] = useState<PlaybookExecution["status"] | "all">("all");
  const [search, setSearch] = useState("");
  const { data: esecuzioni, isLoading } = usePlaybookExecutions({ status: statusFilter, limit: 100 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return esecuzioni ?? [];
    return (esecuzioni ?? []).filter(e =>
      (e.company_name ?? "").toLowerCase().includes(q) ||
      (e.playbook_name ?? "").toLowerCase().includes(q) ||
      e.trigger_event.toLowerCase().includes(q)
    );
  }, [esecuzioni, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca azienda, playbook, evento…"
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Ogni stato</SelectItem>
            <SelectItem value="pending">In attesa</SelectItem>
            <SelectItem value="running">In esecuzione</SelectItem>
            <SelectItem value="completed">Completato</SelectItem>
            <SelectItem value="failed">Fallito</SelectItem>
          </SelectContent>
        </Select>
        {esecuzioni && (
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length}/{esecuzioni.length} risultati
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Activity className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {esecuzioni && esecuzioni.length > 0 ? "Nessun risultato per i filtri" : "Nessuna esecuzione registrata"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Azienda</TableHead>
                <TableHead>Playbook</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Iniziato</TableHead>
                <TableHead>Durata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((ex) => {
                const durata = ex.completed_at
                  ? Math.round((new Date(ex.completed_at).getTime() - new Date(ex.started_at).getTime()) / 1000)
                  : null;
                return (
                  <TableRow key={ex.id} className={ex.status === "failed" ? "bg-rose-50/30 dark:bg-rose-950/10" : undefined}>
                    <TableCell className="font-medium">
                      {ex.company_name ?? (
                        <code className="text-xs text-muted-foreground">{ex.company_id.slice(0, 8)}…</code>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {ex.playbook_name ?? <span className="text-muted-foreground italic">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">{ex.trigger_event}</TableCell>
                    <TableCell><BadgeStato stato={ex.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(ex.started_at), "dd/MM HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {durata != null ? (durata < 60 ? `${durata}s` : `${Math.round(durata / 60)}m`) : <span className="italic">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Pagina principale ────────────────────────────────────

export default function PlaybooksPage() {
  const [dialogAperto, setDialogAperto] = useState(false);
  const [playbookSelezionato, setPlaybookSelezionato] = useState<Playbook | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Playbook | null>(null);
  const [search, setSearch] = useState("");
  const [filterEvent, setFilterEvent] = useState<Playbook["trigger_event"] | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const { data: playbooks = [], isLoading } = usePlaybooksList();
  const { data: executions = [] } = usePlaybookExecutions({ limit: 200 });
  const { mutate: elimina, isPending: eliminando } = useDeletePlaybook();
  const { mutate: toggle } = useTogglePlaybook();

  // Filtro + search playbooks
  const filteredPlaybooks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return playbooks.filter((p) => {
      if (filterEvent !== "all" && p.trigger_event !== filterEvent) return false;
      if (filterStatus === "active" && !p.is_active) return false;
      if (filterStatus === "inactive" && p.is_active) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.trigger_event.toLowerCase().includes(q);
    });
  }, [playbooks, search, filterEvent, filterStatus]);

  // Se il playbook selezionato viene eliminato dalla lista, reset selezione
  useEffect(() => {
    if (playbookSelezionato && !playbooks.find(p => p.id === playbookSelezionato.id)) {
      setPlaybookSelezionato(null);
    }
  }, [playbooks, playbookSelezionato]);

  // Se il playbook in lista è stato aggiornato (es. toggle altrove), aggiorna anche
  // la selezione corrente così l'editor riflette i dati freschi
  useEffect(() => {
    if (!playbookSelezionato) return;
    const fresh = playbooks.find(p => p.id === playbookSelezionato.id);
    if (fresh && fresh !== playbookSelezionato) {
      setPlaybookSelezionato(fresh);
    }
  }, [playbooks]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="hidden md:block">
        <h1 className="text-2xl font-bold">Playbook Automatici</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configura sequenze di azioni automatiche scatenate da eventi del lifecycle
        </p>
      </div>

      {/* KPI stats */}
      <PlaybookStats playbooks={playbooks} executions={executions} />

      <Tabs defaultValue="playbooks">
        <TabsList>
          <TabsTrigger value="playbooks">
            Playbook
            {playbooks.length > 0 && (
              <span className="ml-1.5 rounded bg-muted-foreground/15 px-1.5 text-[10px]">{playbooks.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="esecuzioni">
            Esecuzioni
            {executions.length > 0 && (
              <span className="ml-1.5 rounded bg-muted-foreground/15 px-1.5 text-[10px]">{executions.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab Playbook */}
        <TabsContent value="playbooks" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Colonna sinistra — lista */}
            <div className="space-y-3">
              {/* Toolbar search + filtri + crea */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca playbook…"
                    className="pl-9 h-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
                  <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti</SelectItem>
                    <SelectItem value="active">Attivi</SelectItem>
                    <SelectItem value="inactive">Inattivi</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-9" onClick={() => setDialogAperto(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Nuovo
                </Button>
              </div>

              <Select value={filterEvent} onValueChange={(v) => setFilterEvent(v as typeof filterEvent)}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue placeholder="Filtra per evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli eventi</SelectItem>
                  {TRIGGER_EVENTI.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {isLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
                </div>
              )}

              {!isLoading && playbooks.length === 0 && (
                <Card>
                  <CardContent className="py-12 flex flex-col items-center text-center gap-3">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Workflow className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Nessun playbook configurato</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                        Crea il primo per automatizzare le risposte a eventi lifecycle.
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setDialogAperto(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Crea il primo playbook
                    </Button>
                  </CardContent>
                </Card>
              )}

              {!isLoading && playbooks.length > 0 && filteredPlaybooks.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center space-y-2">
                    <p className="text-sm font-medium">Nessun risultato</p>
                    <Button size="sm" variant="outline" onClick={() => { setSearch(""); setFilterEvent("all"); setFilterStatus("all"); }}>
                      Reset filtri
                    </Button>
                  </CardContent>
                </Card>
              )}

              {filteredPlaybooks.map((pb) => (
                <Card
                  key={pb.id}
                  className={cn(
                    "cursor-pointer transition-colors hover:border-primary/50",
                    playbookSelezionato?.id === pb.id && "border-primary",
                    !pb.is_active && "opacity-60"
                  )}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{pb.name}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <BadgeEvento evento={pb.trigger_event} />
                          <span className="text-xs text-muted-foreground">
                            {pb.actions.length} {pb.actions.length === 1 ? "azione" : "azioni"}
                          </span>
                          {pb.delay_hours > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              ritardo {pb.delay_hours}h
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Switch
                          checked={pb.is_active}
                          onCheckedChange={(val) => toggle({ id: pb.id, is_active: val })}
                          aria-label="Attiva/disattiva playbook"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPlaybookSelezionato(playbookSelezionato?.id === pb.id ? null : pb)}
                        >
                          {playbookSelezionato?.id === pb.id ? "Chiudi" : "Modifica"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeleteConfirm(pb)}   // BUG FIX: confirm UI invece di eliminazione diretta
                          title="Elimina playbook"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Colonna destra — editor */}
            <div>
              {playbookSelezionato ? (
                <Card>
                  <CardContent className="pt-4">
                    <EditorPlaybook
                      playbook={playbookSelezionato}
                      onChiudi={() => setPlaybookSelezionato(null)}
                    />
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 border border-dashed rounded-lg text-muted-foreground gap-2">
                  <Play className="h-8 w-8 opacity-30" />
                  <span className="text-sm">Seleziona un playbook per modificarlo</span>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab Esecuzioni */}
        <TabsContent value="esecuzioni" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registro esecuzioni</CardTitle>
            </CardHeader>
            <CardContent>
              <TabEsecuzioni />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog nuovo playbook */}
      <DialogNuovoPlaybook aperto={dialogAperto} onChiudi={() => setDialogAperto(false)} />

      {/* Confirm dialog delete — BUG FIX: prima deletava senza conferma */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare "{deleteConfirm?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Il playbook verrà rimosso definitivamente insieme a tutte le sue azioni configurate.
              {deleteConfirm && deleteConfirm.actions.length > 0 && (
                <> Contiene <strong>{deleteConfirm.actions.length}</strong> {deleteConfirm.actions.length === 1 ? "azione" : "azioni"}.</>
              )}
              {" "}Le esecuzioni storiche rimarranno come log. Operazione irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm) {
                  elimina(deleteConfirm.id, {
                    onSuccess: () => {
                      if (playbookSelezionato?.id === deleteConfirm.id) {
                        setPlaybookSelezionato(null);
                      }
                      setDeleteConfirm(null);
                    },
                  });
                }
              }}
              disabled={eliminando}
            >
              {eliminando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Elimina playbook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
