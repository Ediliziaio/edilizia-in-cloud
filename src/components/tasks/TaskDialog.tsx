import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarDays, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";

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
  category: string;
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
}

const PRIORITIES = [
  { value: "bassa", label: "Bassa" },
  { value: "normale", label: "Normale" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

const CATEGORIES = [
  { value: "generale", label: "Generale" },
  { value: "ordini", label: "Ordini" },
  { value: "magazzino", label: "Magazzino" },
  { value: "pagamenti", label: "Pagamenti" },
  { value: "costi", label: "Costi" },
  { value: "marketing", label: "Marketing" },
  { value: "contatti", label: "Contatti" },
  { value: "opportunita", label: "Opportunità" },
];

const STATUSES = [
  { value: "da_fare", label: "Da fare" },
  { value: "in_corso", label: "In corso" },
  { value: "completata", label: "Completata" },
];

export function TaskDialog({ open, onOpenChange, task, onSaved, defaultCategory, defaultOrderId, defaultStockItemId, defaultCostId, defaultContactId, defaultOpportunityId }: TaskDialogProps) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const isEditing = !!task?.id;
  const { onlyAssigned } = usePermissions();

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
  const [category, setCategory] = useState("generale");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
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
      setCategory(task.category);
    } else {
      setTitle("");
      setNotes("");
      setStatus("da_fare");
      setPriority("normale");
      setDueDate(undefined);
      setAssignedTo(onlyAssigned && user?.id ? user.id : "");
      setOrderId(defaultOrderId || "");
      setStockItemId(defaultStockItemId || "");
      setCostId(defaultCostId || "");
      setContactId(defaultContactId || "");
      setOpportunityId(defaultOpportunityId || "");
      setCategory(defaultCategory || "generale");
    }
  }, [task, open, defaultCategory, defaultOrderId, defaultStockItemId, defaultCostId, defaultContactId, defaultOpportunityId, onlyAssigned, user?.id]);

  const { data: assignableUsers = [] } = useQuery({
    queryKey: ["assignable-users", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .order("last_name");
      if (!profiles?.length) return [];
      const userIds = profiles.map((p) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      const validUserIds = roles
        ?.filter((r) => r.role === "company_admin" || r.role === "company_staff")
        .map((r) => r.user_id) || [];
      return profiles.filter((p) => validUserIds.includes(p.id));
    },
    enabled: open && !!companyId,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["task-orders", companyId],
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
    queryKey: ["task-stock", companyId],
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
    queryKey: ["task-costs", companyId],
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
    queryKey: ["task-contacts", companyId],
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
    enabled: open && !!companyId && (category === "contatti" || category === "marketing"),
  });

  const { data: opportunities = [] } = useQuery({
    queryKey: ["task-opportunities", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_opportunities")
        .select("id, name, value")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: open && !!companyId && (category === "opportunita" || category === "marketing"),
  });

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Inserisci un titolo", variant: "destructive" });
      return;
    }
    if (!companyId || !user) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        company_id: companyId,
        title: title.trim(),
        notes: notes.trim() || null,
        status,
        priority,
        due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
        assigned_to: assignedTo && assignedTo !== "none" ? assignedTo : null,
        order_id: (category === "ordini" || category === "pagamenti") && orderId && orderId !== "none" ? orderId : null,
        stock_item_id: category === "magazzino" && stockItemId && stockItemId !== "none" ? stockItemId : null,
        cost_id: category === "costi" && costId && costId !== "none" ? costId : null,
        contact_id: (category === "contatti" || category === "marketing") && contactId && contactId !== "none" ? contactId : null,
        opportunity_id: (category === "opportunita" || category === "marketing") && opportunityId && opportunityId !== "none" ? opportunityId : null,
        category,
        completed_at: status === "completata" ? new Date().toISOString() : null,
      };

      if (isEditing && task?.id) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", task.id);
        if (error) throw error;
        toast({ title: "Attività aggiornata" });
      } else {
        payload.created_by = user.id;
        const { error } = await supabase.from("tasks").insert(payload as any);
        if (error) throw error;
        toast({ title: "Attività creata" });
      }

      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
      toast({ title: "Attività eliminata" });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Modifica Attività" : "Nuova Attività"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifica i dettagli dell'attività" : "Compila i campi per creare una nuova attività"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="title">Titolo *</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Ordinare prodotto X" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dettagli aggiuntivi..." rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-4">
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

            <div className="space-y-2">
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Scadenza</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "dd/MM/yyyy") : "Seleziona data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dueDate} onSelect={setDueDate} locale={it} />
                </PopoverContent>
              </Popover>
            </div>

            {isEditing && (
              <div className="space-y-2">
                <Label>Stato</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Assegna a</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo} disabled={onlyAssigned}>
              <SelectTrigger><SelectValue placeholder="Nessun assegnatario" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuno</SelectItem>
                {assignableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.first_name} {u.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(category === "ordini" || category === "pagamenti") && (
            <div className="space-y-2">
              <Label>Ordine collegato</Label>
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

          {(category === "contatti" || category === "marketing") && (
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
          )}

          {(category === "opportunita" || category === "marketing") && (
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
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isEditing && (
            <Button variant="destructive" onClick={handleDelete} disabled={saving} className="sm:mr-auto">
              <Trash2 className="h-4 w-4 mr-2" />
              Elimina
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : isEditing ? "Salva modifiche" : "Crea attività"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
