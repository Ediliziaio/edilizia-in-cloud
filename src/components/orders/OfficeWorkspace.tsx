import { lazy, Suspense, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  Clock3,
  ListTodo,
  LockKeyhole,
  Plus,
  Search,
  Settings2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { campoWorkDay } from "@/lib/campo/workDay";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { PlaybookEditorDialog } from "./PlaybookEditorDialog";
import { OfficeTemplateApplyDialog } from "./OfficeTemplateApplyDialog";
import { OfficeSelect } from "./OfficeSelect";
import {
  OFFICE_STAGES,
  officeStage,
  officeStatus,
  officeCounts,
  invalidateOfficeWorkspace,
} from "@/lib/orders/officeWorkspace";
import { logTaskActivity } from "@/lib/taskActivityLog";
import { cn } from "@/lib/utils";
const Detail = lazy(() =>
  import("@/components/attivita/TaskDetailPanel").then((m) => ({
    default: m.TaskDetailPanel,
  })),
);
// Additive fields are not yet present in generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
interface Task {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  ufficio_id: string | null;
  office_stage: string | null;
  sort_order: number | null;
  attende_fase_id: string | null;
  bloccata_da_task_id: string | null;
  notes: string | null;
  priority: string;
  updated_at: string;
  [key: string]: unknown;
}
type Filter =
  | "aperte"
  | "tutte"
  | "pronte"
  | "scadute"
  | "bloccate"
  | "senza-responsabile"
  | "completate";
const emptyDraft = () => ({
  title: "",
  notes: "",
  assigned: "",
  date: "",
  stage: "altro",
  priority: "normale",
  predecessor: "",
  days: "2",
});
const shortDate = (date: string | null) =>
  date
    ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
      })
    : "Senza scadenza";

export function OfficeWorkspace({ orderId }: { orderId: string }) {
  const { effectiveCompany, user, role, profile } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();
  const editable =
    role === "company_admin" ||
    role === "super_admin" ||
    !!permissions.canEditOrders;
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("aperte");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [config, setConfig] = useState(false);
  const [applyTemplate, setApplyTemplate] = useState(false);
  const people = useQuery({
    queryKey: ["commessa-persone-ufficio", companyId],
    enabled: !!companyId,
    staleTime: 300000,
    queryFn: async () => {
      const { data, error } = await db.rpc("get_internal_chat_profiles", {
        p_company_id: companyId,
      });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        roles: string[];
      }[];
    },
  });
  const names = useMemo(() => {
    const map = new Map(
      (people.data ?? []).map((p) => [
        p.id,
        [p.first_name, p.last_name].filter(Boolean).join(" "),
      ]),
    );
    const ownName = [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(" ");
    if (user?.id && ownName) map.set(user.id, ownName);
    return map;
  }, [people.data, user, profile?.first_name, profile?.last_name]);
  const tasks = useQuery({
    queryKey: ["commessa-fasi-ufficio", orderId],
    enabled: !!companyId && !!orderId,
    staleTime: 30000,
    queryFn: async () => {
      const rows: Task[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await db
          .from("tasks")
          .select("*")
          .eq("company_id", companyId)
          .eq("order_id", orderId)
          .eq("activity_scope", "ufficio")
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })
          .range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data ?? []).length < 500) break;
      }
      const officeIds = [
        ...new Set(rows.map((r) => r.ufficio_id).filter(Boolean)),
      ];
      const phaseIds = [
        ...new Set(rows.map((r) => r.attende_fase_id).filter(Boolean)),
      ];
      const prevIds = [
        ...new Set(rows.map((r) => r.bloccata_da_task_id).filter(Boolean)),
      ].filter((id) => !rows.some((r) => r.id === id));
      const [offices, phases, previous] = await Promise.all([
        officeIds.length
          ? db
              .from("company_uffici")
              .select("id,nome")
              .eq("company_id", companyId)
              .in("id", officeIds)
          : { data: [] },
        phaseIds.length
          ? db
              .from("order_work_phases")
              .select("id,name")
              .eq("order_id", orderId)
              .in("id", phaseIds)
          : { data: [] },
        prevIds.length
          ? db
              .from("tasks")
              .select("id,title")
              .eq("company_id", companyId)
              .eq("order_id", orderId)
              .in("id", prevIds)
          : { data: [] },
      ]);
      for (const result of [offices, phases, previous])
        if (result.error) throw result.error;
      return {
        rows,
        offices: new Map<string, string>(
          (offices.data ?? []).map((x: { id: string; nome: string }) => [
            x.id,
            x.nome,
          ]),
        ),
        phases: new Map<string, string>(
          (phases.data ?? []).map((x: { id: string; name: string }) => [
            x.id,
            x.name,
          ]),
        ),
        previous: new Map<string, string>(
          [...rows, ...(previous.data ?? [])].map((x) => [x.id, x.title]),
        ),
      };
    },
  });
  const rows = tasks.data?.rows ?? [];
  const today = campoWorkDay();
  const counts = officeCounts(rows, today);
  const who = (f: Task) =>
    f.ufficio_id
      ? (tasks.data?.offices.get(f.ufficio_id) ?? "Ufficio non disponibile")
      : f.assigned_to
        ? names.get(f.assigned_to) || "Responsabile non disponibile"
        : "Da assegnare";
  const late = (f: Task) =>
    f.status !== "completata" &&
    f.status !== "in_attesa" &&
    !!f.due_date &&
    f.due_date < today;
  const blocked = (f: Task) =>
    f.attende_fase_id
      ? `Aspetta il cantiere: «${tasks.data?.phases.get(f.attende_fase_id) ?? "fase non disponibile"}»`
      : f.bloccata_da_task_id
        ? `Aspetta «${tasks.data?.previous.get(f.bloccata_da_task_id) ?? "attività non disponibile"}»`
        : "In attesa di conferma";
  const update = useMutation({
    mutationFn: async ({ task, status }: { task: Task; status: string }) => {
      if (!editable || !companyId || !user)
        throw Error("Non puoi modificare questa attività.");
      if (
        task.status === "in_attesa" &&
        (task.bloccata_da_task_id || task.attende_fase_id)
      )
        throw Error("Completa prima la dipendenza indicata.");
      const patch = {
        status,
        completed_at: status === "completata" ? new Date().toISOString() : null,
      };
      let q = db
        .from("tasks")
        .update(patch)
        .eq("company_id", companyId)
        .eq("order_id", orderId)
        .eq("activity_scope", "ufficio")
        .eq("id", task.id);
      if (task.updated_at) q = q.eq("updated_at", task.updated_at);
      const { data, error } = await q.select("id,status");
      if (error) throw error;
      if (!data?.length)
        throw Error(
          "Attività modificata da un altro utente o non più accessibile. Ricarica.",
        );
      await logTaskActivity({
        companyId,
        userId: user.id,
        taskId: task.id,
        taskTitle: task.title,
        eventType:
          status === "completata"
            ? "task_completed"
            : status === "da_fare"
              ? "task_reopened"
              : "task_status_changed",
        description: `ha impostato l’attività: ${officeStatus(status)}`,
        changes: patch,
        beforeSnapshot: task as never,
        afterSnapshot: { ...task, ...patch } as never,
      });
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.status === "completata"
          ? "Attività completata"
          : v.status === "in_corso"
            ? "Attività avviata"
            : "Attività riaperta",
      );
      invalidateOfficeWorkspace(qc, orderId);
    },
    onError: (e) =>
      toast.error(messaggioErrore(e, "Non sono riuscito a salvare.")),
  });
  const add = useMutation({
    mutationFn: async () => {
      if (!editable || !companyId || !user || !draft.title.trim())
        throw Error("Titolo e sessione sono necessari.");
      const predecessor = rows.find((r) => r.id === draft.predecessor);
      if (draft.predecessor && !predecessor)
        throw Error("Dipendenza non più disponibile.");
      const waiting = !!predecessor && predecessor.status !== "completata";
      const days = Number(draft.days);
      if (!Number.isInteger(days) || days < 0 || days > 3650)
        throw Error("Indica giorni validi per lo sblocco.");
      const { data, error } = await db
        .from("tasks")
        .insert({
          company_id: companyId,
          order_id: orderId,
          title: draft.title.trim(),
          notes: draft.notes.trim() || null,
          assigned_to: draft.assigned || user.id,
          created_by: user.id,
          office_stage: draft.stage,
          priority: draft.priority,
          category: "ordini",
          activity_scope: "ufficio",
          status: waiting ? "in_attesa" : "da_fare",
          due_date: waiting ? null : draft.date || null,
          bloccata_da_task_id: waiting ? predecessor.id : null,
          sblocco_giorni: waiting ? days : null,
          sort_order: Math.max(0, ...rows.map((r) => r.sort_order ?? 0)) + 1,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (!data?.id) throw Error("Attività non creata.");
      await logTaskActivity({
        companyId,
        userId: user.id,
        taskId: data.id,
        taskTitle: draft.title,
        eventType: "task_created",
        description: "ha creato un’attività d’ufficio",
        afterSnapshot: { activity_scope: "ufficio", office_stage: draft.stage },
      });
    },
    onSuccess: () => {
      toast.success("Attività d’ufficio creata");
      setCreating(false);
      setDraft(emptyDraft());
      invalidateOfficeWorkspace(qc, orderId);
    },
    onError: (e) => toast.error(messaggioErrore(e, "Attività non creata.")),
  });
  const visible = rows.filter(
    (r) =>
      (!search ||
        [r.title, r.notes, who(r)]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (filter === "tutte" ||
        (filter === "aperte" && r.status !== "completata") ||
        (filter === "pronte" &&
          r.status !== "completata" &&
          r.status !== "in_attesa") ||
        (filter === "scadute" && late(r)) ||
        (filter === "bloccate" && r.status === "in_attesa") ||
        (filter === "senza-responsabile" &&
          r.status !== "completata" &&
          !r.assigned_to &&
          !r.ufficio_id) ||
        (filter === "completate" && r.status === "completata")),
  );
  const detail = rows.find((r) => r.id === selected);
  return (
    <section aria-label="Attività d’ufficio" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">
            Il lavoro dell’ufficio
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Responsabili, scadenze e passaggi della commessa. Le stesse attività
            della tua agenda.
          </p>
        </div>
        <div className="flex gap-2">
          {editable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApplyTemplate(true)}
            >
              Applica modello
            </Button>
          )}
          {editable && permissions.canEditSettingsOrders && (
            <Button variant="outline" size="sm" onClick={() => setConfig(true)}>
              <Settings2 className="mr-1.5 h-4 w-4" />
              Modello aziendale
            </Button>
          )}
          {editable && (
            <Button
              size="sm"
              onClick={() => {
                setDraft(emptyDraft());
                setCreating(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Nuova attività d’ufficio
            </Button>
          )}
        </div>
      </div>
      {!tasks.isLoading && !tasks.isError && (
        <div
          className="grid grid-cols-2 gap-2 lg:grid-cols-4"
          aria-label="Situazione attività d’ufficio"
        >
          {(
            [
              ["pronte", "Da fare adesso", counts.ready],
              ["scadute", "Scadute", counts.late],
              ["bloccate", "In attesa", counts.blocked],
              ["senza-responsabile", "Da assegnare", counts.unassigned],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={cn(
                "rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40",
                filter === key && "border-primary/40 bg-primary/5",
              )}
            >
              <span className="block text-xs text-muted-foreground">
                {label}
              </span>
              <strong
                className={cn(
                  "mt-1 block text-2xl font-semibold tabular-nums",
                  key === "scadute" && count > 0
                    ? "text-orange-600"
                    : "text-foreground",
                )}
              >
                {count}
              </strong>
            </button>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div
            role="group"
            aria-label="Filtra attività"
            className="flex gap-1 rounded-lg bg-muted/60 p-1"
          >
            {(
              [
                ["aperte", "Aperte"],
                ["tutte", "Tutte"],
                ["completate", "Completate"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cn(
                  "min-h-8 rounded-md px-3 text-xs",
                  filter === key && "bg-background font-medium shadow-sm",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Cerca attività d’ufficio"
              placeholder="Cerca attività o responsabile…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
        </div>
        {tasks.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">
            Carico le attività…
          </p>
        ) : tasks.isError ? (
          <div role="alert" className="p-5 text-sm">
            Non riesco a leggere le attività.{" "}
            <button
              className="text-primary underline"
              onClick={() => void tasks.refetch()}
            >
              Riprova
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b bg-muted/15 px-4 py-2.5 text-xs text-muted-foreground">
              <span>
                {counts.done} di {counts.total} completate · solo attività
                d’ufficio
              </span>
              <div
                role="progressbar"
                aria-label="Avanzamento ufficio"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  counts.total
                    ? Math.round((counts.done / counts.total) * 100)
                    : 0
                }
                className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${counts.total ? (counts.done / counts.total) * 100 : 0}%`,
                  }}
                />
              </div>
              {people.isError && (
                <span className="text-orange-700">
                  Nomi dei responsabili non disponibili.{" "}
                  <button
                    className="underline"
                    onClick={() => void people.refetch()}
                  >
                    Riprova
                  </button>
                </span>
              )}
            </div>
            {!visible.length ? (
              <div className="p-8 text-center">
                <ListTodo className="mx-auto mb-3 h-7 w-7 text-primary/60" />
                <p className="text-sm font-medium">
                  {rows.length
                    ? "Nessuna attività per questa vista"
                    : "Organizza il lavoro d’ufficio della commessa"}
                </p>
                <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">
                  {rows.length
                    ? "Cambia filtro o ricerca per vedere le altre attività."
                    : "Aggiungi un’attività con responsabile e scadenza. Salvare un modello aziendale non lo applica a questa commessa."}
                </p>
              </div>
            ) : (
              OFFICE_STAGES.map(([stage, label]) => {
                const group = visible.filter(
                  (r) => officeStage(r.office_stage) === stage,
                );
                if (!group.length) return null;
                return (
                  <details
                    key={stage}
                    open
                    className="group border-b last:border-b-0"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2 bg-muted/25 px-4 py-3 text-sm font-medium">
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" />
                      {label}
                      <span className="text-xs font-normal text-muted-foreground">
                        {group.length}
                      </span>
                    </summary>
                    <ul className="divide-y">
                      {group.map((f) => (
                        <li
                          key={f.id}
                          className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/15"
                        >
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                              f.status === "completata"
                                ? "bg-primary/10 text-primary"
                                : f.status === "in_attesa"
                                  ? "bg-orange-500/10 text-orange-600"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            {f.status === "completata" ? (
                              <Check className="h-4 w-4" />
                            ) : f.status === "in_attesa" ? (
                              <LockKeyhole className="h-4 w-4" />
                            ) : (
                              <ListTodo className="h-4 w-4" />
                            )}
                          </span>
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setSelected(f.id)}
                            aria-label={`Apri attività: ${f.title}`}
                          >
                            <span className="block text-sm font-medium">
                              {f.title}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <UserRound className="h-3 w-3" />
                                {who(f)}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1",
                                  late(f) && "font-medium text-orange-700",
                                )}
                              >
                                <Clock3 className="h-3 w-3" />
                                {f.status === "in_attesa"
                                  ? "Scadenza dallo sblocco"
                                  : shortDate(f.due_date)}
                              </span>
                            </span>
                            {f.status === "in_attesa" && (
                              <span className="mt-1 block text-xs text-orange-700 dark:text-orange-300">
                                {blocked(f)}
                              </span>
                            )}
                          </button>
                          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px]">
                            {officeStatus(f.status)}
                          </span>
                          {editable && f.status !== "in_attesa" && (
                            <div className="flex gap-1">
                              {f.status === "da_fare" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={update.isPending}
                                  onClick={() =>
                                    update.mutate({
                                      task: f,
                                      status: "in_corso",
                                    })
                                  }
                                >
                                  Inizia
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={update.isPending}
                                onClick={() =>
                                  update.mutate({
                                    task: f,
                                    status:
                                      f.status === "completata"
                                        ? "da_fare"
                                        : "completata",
                                  })
                                }
                              >
                                {f.status === "completata"
                                  ? "Riapri"
                                  : "Completa"}
                              </Button>
                            </div>
                          )}
                          <button
                            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                            aria-label={`Dettagli: ${f.title}`}
                            onClick={() => setSelected(f.id)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })
            )}
          </>
        )}
      </div>
      {companyId && (
        <OfficeTemplateApplyDialog
          open={applyTemplate}
          onOpenChange={setApplyTemplate}
          companyId={companyId}
          orderId={orderId}
          vertical={effectiveCompany?.vertical}
        />
      )}
      {companyId && (
        <PlaybookEditorDialog
          open={config}
          onOpenChange={setConfig}
          companyId={companyId}
          vertical={effectiveCompany?.vertical}
          onSaved={() => invalidateOfficeWorkspace(qc, orderId)}
        />
      )}
      {detail && editable && (
        <Suspense fallback={<p role="status">Apro il dettaglio…</p>}>
          <Detail
            task={{
              ...detail,
              assigned_profile: {
                first_name: detail.assigned_to
                  ? names.get(detail.assigned_to) ||
                    "Responsabile non disponibile"
                  : null,
                last_name: null,
              },
            }}
            onClose={() => {
              setSelected(null);
              invalidateOfficeWorkspace(qc, orderId);
            }}
          />
        </Suspense>
      )}
      {detail && !editable && (
        <Sheet
          open
          onOpenChange={(v) => {
            if (!v) setSelected(null);
          }}
        >
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{detail.title}</SheetTitle>
              <SheetDescription>
                {who(detail)} · {officeStatus(detail.status)} ·{" "}
                {shortDate(detail.due_date)}
              </SheetDescription>
            </SheetHeader>
            <p className="mt-4 whitespace-pre-wrap text-sm">
              {detail.notes || "Nessuna nota"}
            </p>
          </SheetContent>
        </Sheet>
      )}
      <Sheet
        open={creating}
        onOpenChange={(v) => {
          if (!add.isPending) setCreating(v);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg sm:rounded-l-3xl">
          <SheetHeader>
            <SheetTitle>Nuova attività d’ufficio</SheetTitle>
            <SheetDescription>
              Collegata alla commessa e visibile nelle Attività del
              responsabile.
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <label className="block space-y-1.5 text-sm">
              <span>Cosa c’è da fare</span>
              <Input
                required
                maxLength={250}
                className="rounded-xl"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Es. Confermare l’ordine al fornitore"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span>Fase dell’ufficio</span>
              <OfficeSelect
                label="Fase dell’ufficio"
                value={draft.stage}
                onValueChange={(stage) => setDraft({ ...draft, stage })}
                options={OFFICE_STAGES.map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span>Responsabile</span>
              <OfficeSelect
                label="Responsabile"
                value={draft.assigned}
                onValueChange={(assigned) => setDraft({ ...draft, assigned })}
                options={[
                  { value: "", label: "Io" },
                  ...(people.data ?? [])
                    .filter((p) =>
                      (p.roles ?? []).some((r) =>
                        [
                          "company_admin",
                          "company_staff",
                          "salesperson",
                          "call_center",
                        ].includes(r),
                      ),
                    )
                    .filter((p) => p.id !== user?.id)
                    .map((p) => ({
                      value: p.id,
                      label: names.get(p.id) || "Nome non disponibile",
                    })),
                ]}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-sm">
                <span>Scadenza</span>
                <Input
                  type="date"
                  className="rounded-xl"
                  disabled={!!draft.predecessor}
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span>Priorità</span>
                <OfficeSelect
                  label="Priorità"
                  value={draft.priority}
                  onValueChange={(priority) => setDraft({ ...draft, priority })}
                  options={["bassa", "normale", "alta", "urgente"].map(
                    (value) => ({
                      value,
                      label: value[0].toUpperCase() + value.slice(1),
                    }),
                  )}
                />
              </label>
            </div>
            <label className="block space-y-1.5 text-sm">
              <span>Parte dopo</span>
              <OfficeSelect
                label="Parte dopo"
                value={draft.predecessor}
                onValueChange={(predecessor) =>
                  setDraft({ ...draft, predecessor })
                }
                options={[
                  { value: "", label: "Può partire subito" },
                  ...rows
                    .filter((r) => r.status !== "completata")
                    .map((r) => ({ value: r.id, label: r.title })),
                ]}
              />
            </label>
            {draft.predecessor && (
              <label className="block space-y-1.5 text-sm">
                <span>Giorni per completarla dopo lo sblocco</span>
                <Input
                  type="number"
                  className="rounded-xl"
                  min={0}
                  max={3650}
                  value={draft.days}
                  onChange={(e) => setDraft({ ...draft, days: e.target.value })}
                />
                <span className="block text-xs text-orange-700">
                  Nasce in attesa, senza una scadenza già trascorsa.
                </span>
              </label>
            )}
            <label className="block space-y-1.5 text-sm">
              <span>Dettagli</span>
              <Textarea
                className="rounded-xl"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                rows={3}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreating(false)}
                disabled={add.isPending}
              >
                Annulla
              </Button>
              <Button
                disabled={
                  add.isPending || !draft.title.trim() || people.isError
                }
                type="submit"
              >
                {add.isPending ? "Salvo…" : "Crea attività"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </section>
  );
}
