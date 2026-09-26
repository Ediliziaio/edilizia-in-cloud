import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarDays, Trash2, RefreshCw, Sparkles, User, Users, UserX,
  ListChecks, Clock, Link2, ChevronDown, Plus, X, ExternalLink,
} from "lucide-react";
import { TaskTemplatePicker } from "./TaskTemplatePicker";
import { addDays, format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { TASK_CATEGORY_OPTIONS as CATEGORIES } from "@/lib/taskCategories";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { queryKeys } from "@/lib/queryKeys";
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";
import { describeTaskChanges, logTaskActivity } from "@/lib/taskActivityLog";
import { collegamentiAttivita } from "@/lib/attivita/collegamenti";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import {
  buildTaskStatusUpdate,
  getTaskStatusEventType,
  getTaskStatusTransitionDescription,
} from "@/lib/taskStatuses";

const RECURRENCE_OPTIONS = [
  { value: "none",      label: "Nessuna ripetizione" },
  { value: "daily",     label: "Ogni giorno" },
  { value: "weekly",    label: "Ogni settimana" },
  { value: "biweekly",  label: "Ogni 2 settimane" },
  { value: "monthly",   label: "Ogni mese" },
];

interface TaskData {
  id?: string;
  title: string;
  notes: string;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_to: string | null;
  order_id: string | null;
  stock_item_id: string | null;
  cost_id: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  ticket_id: string | null;
  category: string;
  estimated_hours?: number | null;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
  recurrence_end_date?: string | null;
}

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskData | null;
  onSaved: () => void;
  defaultCategory?: string;
  defaultOrderId?: string;
  defaultStockItemId?: string;
  defaultCostId?: string;
  defaultContactId?: string;
  defaultOpportunityId?: string;
  defaultTicketId?: string;
  defaultAssignedTo?: string | null;
}

const PRIORITIES = [
  { value: "bassa", label: "Bassa" },
  { value: "normale", label: "Normale" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];


const MAX_INITIAL_CHECKLIST_ITEMS = 20;

function inferDueDateFromText(text: string): Date | undefined {
  const lower = text.toLowerCase();
  const today = new Date();
  if (lower.includes("dopodomani")) return addDays(today, 2);
  if (lower.includes("domani")) return addDays(today, 1);
  if (lower.includes("oggi")) return today;
  if (lower.includes("prossima settimana") || lower.includes("settimana prossima")) return addDays(today, 7);

  const match = lower.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const currentYear = today.getFullYear();
  const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : currentYear;
  const parsed = new Date(year, month, day);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function inferPriorityFromText(text: string) {
  const lower = text.toLowerCase();
  if (/\b(urgente|subito|immediato|bloccante|scadut[aoe]|oggi)\b/.test(lower)) return "urgente";
  if (/\b(importante|alta priorita|alta priorità|domani|cliente arrabbiato)\b/.test(lower)) return "alta";
  if (/\b(quando possibile|bassa|non urgente)\b/.test(lower)) return "bassa";
  return "normale";
}

function inferCategoryFromText(text: string) {
  const lower = text.toLowerCase();
  if (/\b(ticket|assistenza|segnalazione|bug|problema)\b/.test(lower)) return "assistenza";
  if (/\b(magazzino|stock|material[ei]|scarico|carico|inventario)\b/.test(lower)) return "magazzino";
  if (/\b(fattura|pagamento|incasso|saldo|bonifico|scadenza pagamento)\b/.test(lower)) return "pagamenti";
  if (/\b(costo|spesa|fornitore|consuntivo)\b/.test(lower)) return "costi";
  if (/\b(cliente|lead|commerciale|preventivo|sopralluogo)\b/.test(lower)) return "marketing";
  if (/\b(ordine|commessa|cantiere|lavoro|posa|montaggio|installazione)\b/.test(lower)) return "ordini";
  return "generale";
}

function inferEstimatedHoursFromText(text: string) {
  const match = text.toLowerCase().match(/\b(\d+(?:[,.]\d+)?)\s*(?:h|ore|ora)\b/);
  return match ? match[1].replace(",", ".") : "";
}

function buildChecklistFromText(text: string) {
  const lower = text.toLowerCase();
  if (/\b(montaggio|posa|installazione|cantiere|finestr|serrament)\b/.test(lower)) {
    return ["Verificare misure e accesso", "Preparare materiali e attrezzatura", "Eseguire intervento", "Caricare foto o note finali"];
  }
  if (/\b(ordine|acquisto|fornitore|materiale)\b/.test(lower)) {
    return ["Verificare quantità", "Confermare disponibilità", "Registrare ordine o consegna", "Aggiornare la commessa"];
  }
  if (/\b(cliente|preventivo|sopralluogo|commerciale)\b/.test(lower)) {
    return ["Contattare il cliente", "Verificare dati e richiesta", "Aggiornare esito", "Programmare follow-up"];
  }
  if (/\b(ticket|assistenza|problema|bug)\b/.test(lower)) {
    return ["Analizzare segnalazione", "Riprodurre o verificare problema", "Applicare soluzione", "Confermare chiusura"];
  }
  return ["Verificare dati", "Eseguire attività", "Aggiornare stato"];
}

function inferTitleFromText(text: string) {
  const firstLine = text.split(/\n/).map((line) => line.trim()).find(Boolean) || "";
  const sentence = firstLine.split(/[.!?]/)[0]?.trim() || firstLine;
  return sentence.length > 110 ? `${sentence.slice(0, 107)}...` : sentence;
}

export function TaskDialog({ open, onOpenChange, task, onSaved, defaultCategory, defaultOrderId, defaultStockItemId, defaultCostId, defaultContactId, defaultOpportunityId, defaultTicketId, defaultAssignedTo }: TaskDialogProps) {
  const { effectiveCompany, user, profile } = useAuth();
  const navigate = useNavigate();
  const companyId = effectiveCompany?.id;
  const isEditing = !!task?.id;
  const { onlyAssigned } = usePermissions();
  // Mobile: titolo, note, a chi, priorità, scadenza, stato (in modifica) e i
  // collegamenti. Modelli, assistente AI, checklist iniziale, categoria e
  // stima ore restano al desktop: si aggiungono anche dopo, dal dettaglio.
  const isMobile = useIsMobile();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("da_fare");
  const [priority, setPriority] = useState("normale");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [orderId, setOrderId] = useState<string>("");
  const [stockItemId, setStockItemId] = useState<string>("");
  const [costId, setCostId] = useState<string>("");
  const [contactId, setContactId] = useState<string>("");
  const [opportunityId, setOpportunityId] = useState<string>("");
  const [ticketId, setTicketId] = useState<string>("");
  const [category, setCategory] = useState("generale");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [initialChecklistItems, setInitialChecklistItems] = useState<string[]>([]);
  const [checklistDraft, setChecklistDraft] = useState("");
  const [aiBrief, setAiBrief] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<string>("none");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);
  const { statuses: statusOptions } = useTaskStatuses(companyId, [status].filter(Boolean));

  useEffect(() => {
    if (isEditing && task) {
      setTitle(task.title);
      setNotes(task.notes || "");
      setStatus(task.status);
      setPriority(task.priority);
      setDueDate(task.due_date ? new Date(task.due_date) : undefined);
      setAssignedTo(task.assigned_to || "");
      setOrderId(task.order_id || "");
      setStockItemId(task.stock_item_id || "");
      setCostId(task.cost_id || "");
      setContactId(task.contact_id || "");
      setOpportunityId(task.opportunity_id || "");
      setTicketId(task.ticket_id || "");
      setCategory(task.category);
      setEstimatedHours(task.estimated_hours != null ? String(task.estimated_hours) : "");
      setInitialChecklistItems([]);
      setChecklistDraft("");
      setAiBrief("");
      setAdvancedOpen(true);
      setIsRecurring(task.is_recurring ?? false);
      setRecurrenceRule(task.recurrence_rule ?? "none");
      setRecurrenceEndDate(task.recurrence_end_date ? new Date(task.recurrence_end_date) : undefined);
    } else {
      setTitle(task?.title || "");
      setNotes(task?.notes || "");
      setStatus(task?.status || "da_fare");
      setPriority(task?.priority || "normale");
      setDueDate(task?.due_date ? new Date(task.due_date) : undefined);
      setAssignedTo(task?.assigned_to || defaultAssignedTo || (onlyAssigned && user?.id ? user.id : ""));
      setOrderId(task?.order_id || defaultOrderId || "");
      setStockItemId(task?.stock_item_id || defaultStockItemId || "");
      setCostId(task?.cost_id || defaultCostId || "");
      setContactId(task?.contact_id || defaultContactId || "");
      setOpportunityId(task?.opportunity_id || defaultOpportunityId || "");
      setTicketId(task?.ticket_id || defaultTicketId || "");
      setCategory(task?.category || defaultCategory || "generale");
      setEstimatedHours(task?.estimated_hours != null ? String(task.estimated_hours) : "");
      setInitialChecklistItems([]);
      setChecklistDraft("");
      setAiBrief("");
      setAdvancedOpen(false);
      setIsRecurring(task?.is_recurring ?? false);
      setRecurrenceRule(task?.recurrence_rule ?? "none");
      setRecurrenceEndDate(task?.recurrence_end_date ? new Date(task.recurrence_end_date) : undefined);
    }
  }, [task, open, defaultCategory, defaultOrderId, defaultStockItemId, defaultCostId, defaultContactId, defaultOpportunityId, defaultTicketId, defaultAssignedTo, onlyAssigned, user?.id, isEditing]);

  // FIX: filtro ruoli staff per escludere customer/referrer
  const { data: assignableUsers = [] } = useCompanyStaffUsers(
    open ? companyId : null
  );
  const assigneeOptions = useMemo(() => {
    const map = new Map<string, { id: string; first_name: string; last_name: string }>();
    if (user?.id) {
      map.set(user.id, {
        id: user.id,
        first_name: profile?.first_name || "Me",
        last_name: profile?.last_name || "stesso",
      });
    }
    assignableUsers.forEach((u) => map.set(u.id, u));
    return Array.from(map.values());
  }, [assignableUsers, profile?.first_name, profile?.last_name, user?.id]);

  const teamAssigneeOptions = useMemo(
    () => assigneeOptions.filter((option) => option.id !== user?.id),
    [assigneeOptions, user?.id],
  );

  const assignMode = !assignedTo || assignedTo === "none"
    ? "unassigned"
    : assignedTo === user?.id
      ? "me"
      : "team";

  const setAssignMode = (mode: "me" | "team" | "unassigned") => {
    if (mode === "me" && user?.id) setAssignedTo(user.id);
    if (mode === "team") setAssignedTo(teamAssigneeOptions[0]?.id || assignedTo || "");
    if (mode === "unassigned") setAssignedTo("none");
  };

  const applySmartDraft = () => {
    const text = aiBrief.trim();
    if (!text) {
      toast.error("Scrivi prima cosa deve essere fatto");
      return;
    }

    const suggestedTitle = inferTitleFromText(text);
    if (suggestedTitle) setTitle(suggestedTitle);
    setNotes((prev) => prev || text);
    setPriority(inferPriorityFromText(text));
    setCategory(inferCategoryFromText(text));
    const due = inferDueDateFromText(text);
    if (due) setDueDate(due);
    const hours = inferEstimatedHoursFromText(text);
    if (hours) setEstimatedHours(hours);
    setInitialChecklistItems((prev) => prev.length > 0 ? prev : buildChecklistFromText(text));

    const lower = text.toLowerCase();
    const matchedAssignee = assigneeOptions.find((option) => {
      const first = option.first_name?.toLowerCase();
      const last = option.last_name?.toLowerCase();
      const full = `${option.first_name} ${option.last_name}`.trim().toLowerCase();
      return (first && lower.includes(first)) || (last && lower.includes(last)) || lower.includes(full);
    });
    if (matchedAssignee) setAssignedTo(matchedAssignee.id);

    toast.success("Bozza attività compilata");
  };

  const addInitialChecklistItem = () => {
    const value = checklistDraft.trim();
    if (!value) return;
    if (initialChecklistItems.length >= MAX_INITIAL_CHECKLIST_ITEMS) {
      toast.error(`Massimo ${MAX_INITIAL_CHECKLIST_ITEMS} elementi checklist`);
      return;
    }
    setInitialChecklistItems((items) => [...items, value]);
    setChecklistDraft("");
  };

  const updateInitialChecklistItem = (index: number, value: string) => {
    setInitialChecklistItems((items) => items.map((item, itemIndex) => itemIndex === index ? value : item));
  };

  const removeInitialChecklistItem = (index: number) => {
    setInitialChecklistItems((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };

  const { data: orders = [] } = useQuery({
    queryKey: queryKeys.taskLookups.orders(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("orders")
        .select("id, description, order_code")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: open && !!companyId && (category === "ordini" || category === "pagamenti"),
  });

  const { data: stockItems = [] } = useQuery({
    queryKey: queryKeys.taskLookups.stock(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("warehouse_stock")
        .select("id, name, description")
        .eq("company_id", companyId)
        .order("name")
        .limit(100);
      return data || [];
    },
    enabled: open && !!companyId && category === "magazzino",
  });

  const { data: costs = [] } = useQuery({
    queryKey: queryKeys.taskLookups.costs(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("company_costs")
        .select("id, name, amount")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: open && !!companyId && category === "costi",
  });

  const { data: contacts = [] } = useQuery({
    queryKey: queryKeys.taskLookups.contacts(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId)
        .order("first_name")
        .limit(100);
      return data || [];
    },
    // Il collegamento si può mettere a QUALUNQUE attività: anche una nata
    // dall'aggiunta rapida, che non ha categoria.
    enabled: open && !!companyId,
  });

  const { data: opportunities = [] } = useQuery({
    queryKey: queryKeys.taskLookups.opportunities(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_opportunities")
        .select("id, name, value, contact_id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: open && !!companyId,
  });

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Inserisci un titolo");
      return;
    }
    if (!companyId || !user) return;
    const normalizedEstimatedHours = estimatedHours.trim()
      ? Number(estimatedHours.replace(",", "."))
      : null;
    if (normalizedEstimatedHours != null && (!Number.isFinite(normalizedEstimatedHours) || normalizedEstimatedHours < 0)) {
      toast.error("Stima ore non valida");
      return;
    }
    const checklistItems = initialChecklistItems
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, MAX_INITIAL_CHECKLIST_ITEMS);

    setSaving(true);
    try {
      // Con un'opportunità e nessun contatto scelto, l'attività prende il
      // contatto dell'opportunità: così si vede anche nella scheda del cliente.
      // L'elenco carica le ultime 100: per una più vecchia si chiede al database.
      let contattoDellOpportunita: string | null = null;
      const oppScelta = opportunityId && opportunityId !== "none" ? opportunityId : null;
      if (oppScelta && (!contactId || contactId === "none")) {
        const inElenco = (opportunities as { id: string; contact_id?: string | null }[])
          .find((o) => o.id === oppScelta);
        contattoDellOpportunita = inElenco?.contact_id ?? null;
        if (!contattoDellOpportunita) {
          const { data } = await supabase
            .from("marketing_opportunities").select("contact_id").eq("id", oppScelta).maybeSingle();
          contattoDellOpportunita = (data as { contact_id?: string | null } | null)?.contact_id ?? null;
        }
      }

      const payload: Record<string, unknown> = {
        company_id: companyId,
        title: title.trim(),
        notes: notes.trim() || null,
        ...buildTaskStatusUpdate(status, statusOptions),
        priority,
        due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
        assigned_to: assignedTo && assignedTo !== "none" ? assignedTo : null,
        // I collegamenti NON dipendono dalla categoria: l'attività resta
        // attaccata a ciò da cui nasce, e con un'opportunità si porta dietro il
        // suo contatto (vedi lib/attivita/collegamenti.ts).
        ...collegamentiAttivita(
          { contactId, opportunityId, orderId, stockItemId, costId, ticketId: ticketId || defaultTicketId },
          contattoDellOpportunita,
        ),
        category,
        estimated_hours: normalizedEstimatedHours,
        is_recurring: isRecurring && recurrenceRule !== "none",
        recurrence_rule: isRecurring && recurrenceRule !== "none" ? recurrenceRule : null,
        recurrence_end_date: isRecurring && recurrenceRule !== "none" && recurrenceEndDate
          ? format(recurrenceEndDate, "yyyy-MM-dd")
          : null,
      };

      if (isEditing && task?.id) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", task.id).eq("company_id", companyId!);
        if (error) throw error;
        const changes = Object.fromEntries(
          Object.entries(payload).filter(([key, value]) => (task as any)[key] !== value)
        );
        const statusChanged = typeof changes.status === "string";
        await logTaskActivity({
          companyId,
          userId: user.id,
          taskId: task.id,
          taskTitle: title.trim(),
          eventType: statusChanged ? getTaskStatusEventType(task.status, String(changes.status), statusOptions) : "task_updated",
          description: statusChanged
            ? getTaskStatusTransitionDescription(task.status, String(changes.status), statusOptions)
            : describeTaskChanges(changes),
          changes,
          beforeSnapshot: task as any,
          afterSnapshot: { ...(task as any), ...payload },
        });
        toast.success("Attività aggiornata");
      } else {
        payload.created_by = user.id;
        const { data: createdTask, error } = await supabase
          .from("tasks")
          .insert(payload as any)
          .select("id, title")
          .single();
        if (error) throw error;
        if (createdTask?.id && checklistItems.length > 0) {
          const { error: checklistError } = await supabase.from("task_checklist_items").insert(
            checklistItems.map((item, index) => ({
              task_id: createdTask.id,
              title: item,
              position: index,
            })) as any,
          );
          if (checklistError) {
            toast.warning("Attività creata, ma checklist non salvata", { description: checklistError.message });
          }
        }
        await logTaskActivity({
          companyId,
          userId: user.id,
          taskId: createdTask?.id,
          taskTitle: createdTask?.title || title.trim(),
          eventType: "task_created",
          description: "ha creato l'attività",
          afterSnapshot: payload,
        });
        toast.success("Attività creata");
      }

      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Errore", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task?.id) return;
    setSaving(true);
    try {
      await logTaskActivity({
        companyId,
        userId: user?.id,
        taskId: task.id,
        taskTitle: task.title,
        eventType: "task_deleted",
        description: "ha eliminato l'attività",
        beforeSnapshot: task as any,
        importance: "high",
      });
      const { error } = await supabase.from("tasks").delete().eq("id", task.id).eq("company_id", companyId!);
      if (error) throw error;
      toast.success("Attività eliminata");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Errore", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle>{isEditing ? "Modifica Attività" : "Nuova Attività"}</DialogTitle>
              <DialogDescription className="sr-only">
                {isEditing ? "Modifica i dettagli dell'attività" : "Compila i campi per creare una nuova attività"}
              </DialogDescription>
            </div>
            {!isEditing && !isMobile && (
              <TaskTemplatePicker
                currentTitle={title}
                currentNotes={notes}
                currentStatus={status}
                currentPriority={priority}
                currentCategory={category}
                currentEstimatedHours={estimatedHours ? Number(estimatedHours.replace(",", ".")) : null}
                currentChecklistItems={initialChecklistItems}
                statusOptions={statusOptions}
                onApply={(tpl) => {
                  if (tpl.title) setTitle(tpl.title);
                  if (tpl.notes) setNotes(tpl.notes);
                  if (tpl.status) setStatus(tpl.status);
                  setPriority(tpl.priority);
                  setCategory(tpl.category);
                  if (tpl.estimated_hours != null) setEstimatedHours(String(tpl.estimated_hours));
                  if (tpl.checklist_items) setInitialChecklistItems(tpl.checklist_items);
                }}
              />
            )}
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-2 max-sm:gap-3 max-sm:py-0">
          {!isEditing && !isMobile && (
            <div className="rounded-lg border bg-primary/5 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <Label htmlFor="task-ai-brief" className="text-sm font-medium">Assistente AI</Label>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Textarea
                  id="task-ai-brief"
                  value={aiBrief}
                  onChange={(e) => setAiBrief(e.target.value)}
                  placeholder="Es. Assegna a Luigi montaggio finestre domani, alta priorità, 4 ore"
                  rows={2}
                  className="min-h-[68px] bg-background text-sm"
                  maxLength={800}
                />
                <Button type="button" className="h-10 gap-2 sm:self-end" onClick={applySmartDraft}>
                  <Sparkles className="h-4 w-4" />
                  Compila
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Titolo *</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Ordinare prodotto X" maxLength={200} autoFocus={isMobile && !isEditing} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dettagli aggiuntivi..." rows={isMobile ? 2 : 3} maxLength={1000} className="max-sm:min-h-[60px]" />
          </div>

          {!isEditing && !isMobile && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                Checklist iniziale
              </Label>
              <div className="rounded-md border bg-muted/20 p-2">
                {initialChecklistItems.length > 0 && (
                  <div className="mb-2 space-y-1.5">
                    {initialChecklistItems.map((item, index) => (
                      <div key={`checklist-${index}`} className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5">
                        <Checkbox checked={false} aria-label={`Elemento checklist ${index + 1}`} />
                        <Input
                          value={item}
                          onChange={(e) => updateInitialChecklistItem(index, e.target.value)}
                          className="h-7 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
                          maxLength={200}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeInitialChecklistItem(index)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <div className="flex h-9 items-center pl-2">
                    <Checkbox checked={false} disabled aria-label="Nuovo elemento checklist" />
                  </div>
                  <Input
                    id="initial-checklist-item"
                    value={checklistDraft}
                    onChange={(e) => setChecklistDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addInitialChecklistItem();
                      }
                    }}
                    placeholder="Aggiungi elemento checklist..."
                    className="h-9"
                    maxLength={200}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={addInitialChecklistItem}
                    disabled={!checklistDraft.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Assegna a</Label>
            {/* Mobile: basta il menu qui sotto (dentro ci sono «Nessuno», te e il team). */}
            <div className="hidden sm:grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={assignMode === "me" ? "default" : "outline"}
                className="gap-1.5"
                onClick={() => setAssignMode("me")}
                disabled={!user?.id}
              >
                <User className="h-4 w-4" />
                Per me
              </Button>
              <Button
                type="button"
                variant={assignMode === "team" ? "default" : "outline"}
                className="gap-1.5"
                onClick={() => setAssignMode("team")}
                disabled={onlyAssigned || teamAssigneeOptions.length === 0}
              >
                <Users className="h-4 w-4" />
                Team
              </Button>
              <Button
                type="button"
                variant={assignMode === "unassigned" ? "default" : "outline"}
                className="gap-1.5"
                onClick={() => setAssignMode("unassigned")}
                disabled={onlyAssigned}
              >
                <UserX className="h-4 w-4" />
                Da assegnare
              </Button>
            </div>
            <Select value={assignedTo || "none"} onValueChange={setAssignedTo} disabled={onlyAssigned}>
              <SelectTrigger><SelectValue placeholder="Nessun assegnatario" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuno</SelectItem>
                {assigneeOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.first_name} {u.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:block sm:space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 max-sm:contents">
            <div className="space-y-2">
              <Label>Priorità</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 max-sm:hidden">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setOrderId(""); setStockItemId(""); setCostId(""); setContactId(""); setOpportunityId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={cn("space-y-2", !isEditing && "max-sm:hidden", "max-sm:order-last")}>
              <Label>{isEditing ? "Stato" : "Stato iniziale"}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 max-sm:contents">
            <div className="space-y-2">
              <Label>Scadenza</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "dd/MM/yyyy") : isMobile ? "Data" : "Seleziona data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dueDate} onSelect={setDueDate} locale={it} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2 max-sm:hidden">
              <Label htmlFor="estimated-hours" className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Stima ore
              </Label>
              <Input
                id="estimated-hours"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.25"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                placeholder="Es. 2.5"
              />
            </div>

          </div>
          </div>

          <div className="rounded-md border bg-muted/20">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                Collegamenti e opzioni
              </span>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", advancedOpen && "rotate-180")} />
            </button>
          </div>

          {advancedOpen && (
            <div className="space-y-4 rounded-md border p-3">
              {/* Ripetizione */}
              <div className="space-y-2 border rounded-md p-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 cursor-pointer">
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                Ripetizione
              </Label>
              <button
                type="button"
                role="switch"
                aria-checked={isRecurring}
                onClick={() => setIsRecurring((v) => !v)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  isRecurring ? "bg-primary" : "bg-input"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg transition-transform",
                    isRecurring ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>
            {isRecurring && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ogni</Label>
                  <Select value={recurrenceRule} onValueChange={setRecurrenceRule}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.filter((o) => o.value !== "none").map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Termina il (opz.)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("w-full justify-start font-normal h-8 text-sm", !recurrenceEndDate && "text-muted-foreground")}>
                        <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                        {recurrenceEndDate ? format(recurrenceEndDate, "dd/MM/yy") : "Nessuna fine"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={recurrenceEndDate} onSelect={setRecurrenceEndDate} locale={it} />
                      {recurrenceEndDate && (
                        <div className="p-2 border-t">
                          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setRecurrenceEndDate(undefined)}>
                            Rimuovi data fine
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
              </div>

          {(category === "ordini" || category === "pagamenti") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Ordine collegato</Label>
                {orderId && orderId !== "none" && (
                  <button
                    type="button"
                    onClick={() => { onOpenChange(false); navigate(`/azienda/ordini/${orderId}`); }}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Apri commessa
                  </button>
                )}
              </div>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger><SelectValue placeholder="Seleziona ordine" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_code ? `${o.order_code} - ` : ""}{o.description?.slice(0, 40)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {category === "magazzino" && (
            <div className="space-y-2">
              <Label>Articolo magazzino</Label>
              <Select value={stockItemId} onValueChange={setStockItemId}>
                <SelectTrigger><SelectValue placeholder="Seleziona articolo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {stockItems.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {category === "costi" && (
            <div className="space-y-2">
              <Label>Costo collegato</Label>
              <Select value={costId} onValueChange={setCostId}>
                <SelectTrigger><SelectValue placeholder="Seleziona costo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {costs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} (€{c.amount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Contatto collegato</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger><SelectValue placeholder="Seleziona contatto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {contacts.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.first_name} {c.last_name || ""} {c.email ? `(${c.email})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          <div className="space-y-2">
            <Label>Opportunità collegata</Label>
              <Select value={opportunityId} onValueChange={setOpportunityId}>
                <SelectTrigger><SelectValue placeholder="Seleziona opportunità" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuna</SelectItem>
                  {opportunities.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} {o.value > 0 ? `(€${o.value})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

              {category === "generale" && (
                <p className="text-xs text-muted-foreground">
                  Contatto e opportunità si collegano sempre; per ordine, magazzino e costo scegli la categoria corrispondente.
                </p>
              )}
            </div>
          )}

          {/* v8.6.113 — Custom fields task. Visibile solo in editing. */}
          {isEditing && task?.id && (
            <div className="pt-3 border-t">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Campi personalizzati
              </p>
              <EntityCustomFieldsSection entityType="task" entityId={task.id} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {isEditing && (
            <Button variant="destructive" onClick={handleDelete} disabled={saving} className="sm:mr-auto">
              <Trash2 className="h-4 w-4 mr-2" />
              Elimina
            </Button>
          )}
          <Button variant="outline" className="max-sm:hidden" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : isEditing ? (isMobile ? "Salva" : "Salva modifiche") : "Crea attività"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
