/**
 * NewTaskDialog — Asana / ClickUp style task creation dialog.
 *
 * Caratteristiche:
 *  - Titolo prominent (font grande, autofocus) come Asana/Linear
 *  - Tipo task con icone colorate (Generico, Follow-up, Supporto, Onboarding,
 *    Vendita, Retention, Billing, Altro) per categorizzazione rapida
 *  - Assignee picker con avatar (super admins) — di default = io
 *  - Priorità con bandierine colorate (Bassa / Media / Alta)
 *  - Scadenza con shortcut rapidi (Oggi, Domani, +3gg, Settimana prossima)
 *  - Azienda collegata (opzionale — task interni team senza azienda)
 *  - Descrizione ricca (textarea)
 *  - Riusabile: accetta `prefill` props per integrazione da Assistenza,
 *    Lifecycle, Company Detail, ecc.
 *
 * DB: tabella `cs_tasks` (mantenuta per retrocompat — il nome utente è "Task")
 */
import { useEffect, useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfDay } from "date-fns";
import {
  Calendar, ListChecks, PhoneCall, HelpCircle, Sparkles, DollarSign,
  Heart, CreditCard, MoreHorizontal, Flag, User, Building2, FileText,
  Loader2, X,
} from "lucide-react";
// Nota: `DialogContent` di shadcn renderizza già un pulsante di chiusura (X)
// in alto a destra. Niente custom button qui per evitare il doppione X.
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Task type catalog ───────────────────────────────────────────────────
export const TASK_TYPES = [
  { value: "manual",     label: "Generico",   icon: ListChecks,      tone: "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300" },
  { value: "follow_up",  label: "Follow-up",  icon: PhoneCall,       tone: "text-blue-600 bg-blue-100 dark:bg-blue-950 dark:text-blue-300" },
  { value: "support",    label: "Supporto",   icon: HelpCircle,      tone: "text-amber-600 bg-amber-100 dark:bg-amber-950 dark:text-amber-300" },
  { value: "onboarding", label: "Onboarding", icon: Sparkles,        tone: "text-violet-600 bg-violet-100 dark:bg-violet-950 dark:text-violet-300" },
  { value: "sales",      label: "Vendita",    icon: DollarSign,      tone: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300" },
  { value: "retention",  label: "Retention",  icon: Heart,           tone: "text-rose-600 bg-rose-100 dark:bg-rose-950 dark:text-rose-300" },
  { value: "billing",    label: "Billing",    icon: CreditCard,      tone: "text-cyan-600 bg-cyan-100 dark:bg-cyan-950 dark:text-cyan-300" },
  { value: "other",      label: "Altro",      icon: MoreHorizontal,  tone: "text-muted-foreground bg-muted" },
] as const;

export type TaskTypeValue = typeof TASK_TYPES[number]["value"];

const PRIORITY_CONFIG = [
  { value: "low",    label: "Bassa",  flagClass: "text-slate-400" },
  { value: "medium", label: "Media",  flagClass: "text-blue-500" },
  { value: "high",   label: "Alta",   flagClass: "text-red-500" },
] as const;

// Avatar palette
const AVATAR_COLORS = [
  "bg-rose-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-violet-500", "bg-cyan-500", "bg-pink-500", "bg-teal-500",
];
function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(p: { first_name: string | null; last_name: string | null; email?: string | null }) {
  const fn = p.first_name?.charAt(0).toUpperCase() ?? "";
  const ln = p.last_name?.charAt(0).toUpperCase() ?? "";
  if (fn || ln) return `${fn}${ln}`;
  return (p.email ?? "?").charAt(0).toUpperCase();
}

// ─── Props ───────────────────────────────────────────────────────────────
export interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill opzionale (es. da Assistenza chat → company già preselezionata) */
  prefill?: {
    title?: string;
    description?: string;
    companyId?: string;
    type?: TaskTypeValue;
    priority?: "low" | "medium" | "high";
    assignedTo?: string;
  };
  /** Callback dopo creazione (es. invalidazione query custom) */
  onCreated?: (taskId: string | null) => void;
}

// ─── Component ───────────────────────────────────────────────────────────
export function NewTaskDialog({ open, onOpenChange, prefill, onCreated }: NewTaskDialogProps) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const todayIso = new Date().toISOString().slice(0, 10);

  // ─── Form state ────────────────────────────────────────────────────────
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [description, setDescription] = useState(prefill?.description ?? "");
  const [type, setType] = useState<TaskTypeValue>(prefill?.type ?? "manual");
  const [priority, setPriority] = useState<"low" | "medium" | "high">(prefill?.priority ?? "medium");
  const [companyId, setCompanyId] = useState(prefill?.companyId ?? "");
  const [assignedTo, setAssignedTo] = useState<string>(prefill?.assignedTo ?? user?.id ?? "");
  const [dueDate, setDueDate] = useState("");

  // Reset on open con nuovi prefill
  useEffect(() => {
    if (open) {
      setTitle(prefill?.title ?? "");
      setDescription(prefill?.description ?? "");
      setType(prefill?.type ?? "manual");
      setPriority(prefill?.priority ?? "medium");
      setCompanyId(prefill?.companyId ?? "");
      setAssignedTo(prefill?.assignedTo ?? user?.id ?? "");
      setDueDate("");
    }
  }, [open, prefill, user?.id]);

  // ─── Companies (opzionale: il task può essere "interno" senza azienda) ───
  const { data: companies = [] } = useQuery({
    queryKey: queryKeys.csTasks.companies,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .eq("is_platform_admin_company", false)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // ─── Super admin team (assignees) ────────────────────────────────────────
  const { data: assignees = [] } = useQuery({
    queryKey: ["super-admin-assignees"],
    queryFn: async () => {
      // Fetch user_id list of super admins
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin");
      if (rolesErr) throw rolesErr;
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id).filter(Boolean)));
      if (ids.length === 0) return [];
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, avatar_url")
        .in("id", ids);
      if (error) throw error;
      return profiles ?? [];
    },
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });

  // Fallback: include current user even if non listato (no FK problemi)
  const assigneesWithMe = useMemo(() => {
    if (!user?.id) return assignees;
    if (assignees.find((a) => a.id === user.id)) return assignees;
    if (!profile) return assignees;
    return [
      { id: user.id, first_name: profile.first_name, last_name: profile.last_name, email: profile.email, avatar_url: null },
      ...assignees,
    ];
  }, [assignees, user?.id, profile]);

  // ─── Mutation ──────────────────────────────────────────────────────────
  const createTask = useMutation({
    mutationFn: async (): Promise<string | null> => {
      const t = title.trim();
      if (!user?.id) throw new Error("Sessione admin non disponibile.");
      if (!t) throw new Error("Inserisci un titolo.");
      if (dueDate && dueDate < todayIso) {
        throw new Error("La scadenza non può essere nel passato.");
      }
      const payload = {
        company_id: companyId || null,
        title: t,
        description: description.trim() || null,
        task_type: type,
        priority,
        due_date: dueDate || null,
        created_by: user.id,
        assigned_to: assignedTo || user.id,
      };
      const { data, error } = await supabase
        .from("cs_tasks" as never)
        .insert(payload as never)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return ((data as { id?: string } | null)?.id) ?? null;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.csTasks.all });
      queryClient.invalidateQueries({ queryKey: ["admin-attivita-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sidebar-badges"] });
      toast.success("Task creato", { description: title.trim() });
      onCreated?.(id);
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message || "Impossibile creare il task"),
  });

  // ─── Date shortcuts (Asana-style) ──────────────────────────────────────
  const dateShortcuts = useMemo(() => {
    const today = startOfDay(new Date());
    return [
      { label: "Oggi",     date: format(today, "yyyy-MM-dd") },
      { label: "Domani",   date: format(addDays(today, 1), "yyyy-MM-dd") },
      { label: "+3 giorni", date: format(addDays(today, 3), "yyyy-MM-dd") },
      { label: "Prossima settimana", date: format(addDays(today, 7), "yyyy-MM-dd") },
    ];
  }, []);

  const selectedTypeCfg = TASK_TYPES.find((t) => t.value === type) ?? TASK_TYPES[0];
  const selectedAssignee = assigneesWithMe.find((a) => a.id === assignedTo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            Nuovo Task
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Titolo prominent */}
          <div>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Cosa c'è da fare?"
              className="text-lg font-semibold border-0 shadow-none focus-visible:ring-0 px-0 h-auto py-1 placeholder:text-muted-foreground/50"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && title.trim()) {
                  createTask.mutate();
                }
              }}
            />
          </div>

          {/* Descrizione */}
          <div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Aggiungi una descrizione…"
              rows={2}
              className="border-0 shadow-none focus-visible:ring-0 px-0 resize-none placeholder:text-muted-foreground/50 text-sm"
            />
          </div>

          {/* Meta row: type + priority + assignee + due date */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            {/* Tipo */}
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1 mb-1.5">
                <selectedTypeCfg.icon className="h-3 w-3" /> Tipo
              </Label>
              <Select value={type} onValueChange={(v) => setType(v as TaskTypeValue)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => {
                    const Icon = t.icon;
                    return (
                      <SelectItem key={t.value} value={t.value}>
                        <div className="flex items-center gap-2">
                          <span className={cn("inline-flex h-4 w-4 items-center justify-center rounded p-0.5", t.tone)}>
                            <Icon className="h-3 w-3" />
                          </span>
                          {t.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Priorità */}
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1 mb-1.5">
                <Flag className="h-3 w-3" /> Priorità
              </Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_CONFIG.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center gap-2">
                        <Flag className={cn("h-3 w-3 fill-current", p.flagClass)} /> {p.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assignee */}
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1 mb-1.5">
                <User className="h-3 w-3" /> Assegnato a
              </Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger className="h-9">
                  <SelectValue>
                    {selectedAssignee ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className={cn("text-[10px] text-white", avatarColor(selectedAssignee.id))}>
                            {initials(selectedAssignee)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">
                          {[selectedAssignee.first_name, selectedAssignee.last_name].filter(Boolean).join(" ") || selectedAssignee.email || "Io"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Seleziona…</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {assigneesWithMe.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className={cn("text-[10px] text-white", avatarColor(a.id))}>
                            {initials(a)}
                          </AvatarFallback>
                        </Avatar>
                        <span>
                          {[a.first_name, a.last_name].filter(Boolean).join(" ") || a.email}
                          {a.id === user?.id && <span className="text-muted-foreground ml-1">(io)</span>}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scadenza */}
            <div>
              <Label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1 mb-1.5">
                <Calendar className="h-3 w-3" /> Scadenza
              </Label>
              <Input
                type="date"
                value={dueDate}
                min={todayIso}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          {/* Quick date shortcuts (Asana-style) */}
          <div className="flex flex-wrap gap-1.5">
            {dateShortcuts.map((s) => (
              <Button
                key={s.label}
                type="button"
                variant={dueDate === s.date ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setDueDate(dueDate === s.date ? "" : s.date)}
              >
                {s.label}
              </Button>
            ))}
            {dueDate && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setDueDate("")}
              >
                <X className="h-3 w-3" /> Rimuovi data
              </Button>
            )}
          </div>

          {/* Azienda (opzionale) */}
          <div className="pt-2 border-t">
            <Label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1 mb-1.5">
              <Building2 className="h-3 w-3" /> Azienda collegata
              <span className="text-muted-foreground/60 normal-case font-normal">(opzionale)</span>
            </Label>
            <Select value={companyId || "_none"} onValueChange={(v) => setCompanyId(v === "_none" ? "" : v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Nessuna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">
                  <span className="text-muted-foreground">— Task interno (nessuna azienda)</span>
                </SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Anteprima descrizione preview */}
          {description.trim() && (
            <div className="text-xs text-muted-foreground flex items-start gap-1.5">
              <FileText className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="truncate">{description.length} caratteri</span>
            </div>
          )}

          {dueDate && dueDate < todayIso && (
            <p className="text-xs text-red-600">⚠️ Data nel passato — non valida</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-muted/30 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            <kbd className="px-1.5 py-0.5 rounded bg-background border text-[10px]">⌘ Enter</kbd> per creare
          </p>
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button
              size="sm"
              onClick={() => createTask.mutate()}
              disabled={!title.trim() || createTask.isPending || (dueDate && dueDate < todayIso) || false}
              className="gap-1.5"
            >
              {createTask.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creazione…</>
              ) : (
                <>Crea Task</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Tipo task helper — restituisce config con icone/colori per badge esterni */
export function getTaskTypeConfig(type: string) {
  return TASK_TYPES.find((t) => t.value === type) ?? TASK_TYPES[0];
}
