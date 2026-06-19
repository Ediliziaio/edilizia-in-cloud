import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tags, Plus, Trash2, Pencil, Wand2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "Stipendi", icon: "Users" },
  { value: "Affitti", icon: "Home" },
  { value: "Fornitori", icon: "Package" },
  { value: "Tasse & Tributi", icon: "FileText" },
  { value: "Utenze", icon: "Zap" },
  { value: "Assicurazioni", icon: "Shield" },
  { value: "Ristorazione", icon: "UtensilsCrossed" },
  { value: "Trasferte", icon: "Plane" },
  { value: "Bancario", icon: "Landmark" },
  { value: "Clienti", icon: "TrendingUp" },
  { value: "Entrata", icon: "ArrowDownLeft" },
];

const MATCH_FIELDS = [
  { value: "any", label: "Ovunque (descrizione, creditore, debitore)" },
  { value: "description", label: "Descrizione" },
  { value: "creditor_name", label: "Creditore" },
  { value: "debtor_name", label: "Debitore" },
];
const MATCH_TYPES = [
  { value: "contains", label: "Contiene" },
  { value: "equals", label: "Uguale a" },
  { value: "starts_with", label: "Inizia con" },
];
const fieldLabel = (v: string) => MATCH_FIELDS.find((f) => f.value === v)?.label.split(" ")[0] ?? "Ovunque";
const typeLabel = (v: string) => MATCH_TYPES.find((t) => t.value === v)?.label ?? "Contiene";

interface Props { companyId: string; }

const EMPTY_FORM = {
  match_value: "", match_field: "any", match_type: "contains",
  category: "Fornitori", category_icon: "Package",
  is_case_sensitive: false, priority: 10, auto_apply: true,
};

export default function CategorizationRules({ companyId }: Props) {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    if (companyId) void loadRules();
    else { setRules([]); setLoading(false); }
  }, [companyId]);

  async function loadRules() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("bank_categorization_rules")
        .select("*")
        .eq("company_id", companyId)
        .order("priority", { ascending: true });
      if (error) throw error;
      setRules(data || []);
    } catch (e: any) {
      setLoadError(e.message || "Impossibile caricare le regole");
      toast.error("Errore caricamento regole di categorizzazione");
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditRule(null);
    setForm({ ...EMPTY_FORM });
    setShowAdd(true);
  }

  function openEdit(rule: any) {
    setEditRule(rule);
    setForm({
      match_value: rule.match_value ?? "",
      match_field: rule.match_field ?? "any",
      match_type: rule.match_type ?? "contains",
      category: rule.category,
      category_icon: rule.category_icon || "HelpCircle",
      is_case_sensitive: rule.is_case_sensitive || false,
      priority: rule.priority || 10,
      auto_apply: rule.auto_apply !== false,
    });
    setShowAdd(true);
  }

  async function handleSave() {
    const value = form.match_value.trim();
    if (!value) { toast.error("Il testo da cercare è obbligatorio"); return; }
    if (!companyId) { toast.error("Azienda non disponibile"); return; }
    if (!Number.isFinite(form.priority) || form.priority < 1) { toast.error("La priorità deve essere almeno 1"); return; }

    const duplicated = rules.some((rule) =>
      rule.id !== editRule?.id
      && String(rule.match_value || "").toLocaleLowerCase() === value.toLocaleLowerCase()
      && rule.match_field === form.match_field,
    );
    if (duplicated) { toast.error("Esiste già una regola con questo testo e campo"); return; }

    const payload = {
      company_id: companyId,
      match_value: value, match_field: form.match_field, match_type: form.match_type,
      category: form.category, category_icon: form.category_icon,
      is_case_sensitive: form.is_case_sensitive, priority: form.priority, auto_apply: form.auto_apply,
    };

    setSaving(true);
    try {
      const { error } = editRule
        ? await supabase.from("bank_categorization_rules").update(payload).eq("id", editRule.id).eq("company_id", companyId)
        : await supabase.from("bank_categorization_rules").insert(payload);
      if (error) throw error;
      toast.success(editRule ? "Regola aggiornata" : "Regola creata");
      setShowAdd(false);
      await loadRules();
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, autoApply: boolean) {
    setPendingActionId(id);
    try {
      const { error } = await supabase
        .from("bank_categorization_rules")
        .update({ auto_apply: !autoApply })
        .eq("id", id).eq("company_id", companyId);
      if (error) throw error;
      await loadRules();
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setPendingActionId(deleteId);
    try {
      const { error } = await supabase
        .from("bank_categorization_rules")
        .delete().eq("id", deleteId).eq("company_id", companyId);
      if (error) throw error;
      toast.success("Regola eliminata");
      setDeleteId(null);
      await loadRules();
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    } finally {
      setPendingActionId(null);
    }
  }

  async function applyNow() {
    setApplying(true);
    try {
      const { data, error } = await supabase.rpc("apply_bank_categorization_rules", { p_company_id: companyId });
      if (error) throw error;
      const n = (data as number) ?? 0;
      toast.success(n > 0 ? `${n} transazion${n === 1 ? "e" : "i"} categorizzat${n === 1 ? "a" : "e"}` : "Nessuna transazione da categorizzare con le regole attuali");
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <Tags className="h-4 w-4" /> Regole di Categorizzazione
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={applyNow} disabled={applying || rules.length === 0}>
            {applying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />} Applica ora
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Nuova Regola
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Crea regole per categorizzare automaticamente le transazioni in base al testo di descrizione, creditore o debitore.
        Le regole si applicano a ogni sincronizzazione; con "Applica ora" le riapplichi subito ai movimenti non categorizzati.
      </p>

      {loadError && (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => loadRules()}>Riprova</Button>
          </CardContent>
        </Card>
      )}

      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nessuna regola. Creane una (es. "ENEL" → Utenze) oppure usa <b>Categorizza con AI</b> dalle Transazioni.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id} className={rule.auto_apply === false ? "opacity-50" : ""}>
              <CardContent className="flex items-center justify-between py-3 gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-xs text-muted-foreground">{fieldLabel(rule.match_field)} {typeLabel(rule.match_type).toLowerCase()}</span>
                  <Badge variant="secondary" className="font-mono text-xs">{rule.match_value}</Badge>
                  <span className="text-sm">→</span>
                  <Badge>{rule.category}</Badge>
                  {rule.is_case_sensitive && <Badge variant="outline" className="text-xs">Aa</Badge>}
                  <span className="text-xs text-muted-foreground">P{rule.priority}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={rule.auto_apply !== false} disabled={pendingActionId === rule.id} onCheckedChange={() => handleToggle(rule.id, rule.auto_apply !== false)} />
                  <Button variant="ghost" size="icon" disabled={pendingActionId === rule.id} onClick={() => openEdit(rule)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={pendingActionId === rule.id} onClick={() => setDeleteId(rule.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editRule ? "Modifica Regola" : "Nuova Regola"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Campo</Label>
                <Select value={form.match_field} onValueChange={(v) => setForm({ ...form, match_field: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MATCH_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Condizione</Label>
                <Select value={form.match_type} onValueChange={(v) => setForm({ ...form, match_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MATCH_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Testo da cercare</Label>
              <Input placeholder="Es: ENEL ENERGIA, AGENZIA ENTRATE" value={form.match_value}
                onChange={(e) => setForm({ ...form, match_value: e.target.value })} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={(v) => {
                const cat = CATEGORIES.find((c) => c.value === v);
                setForm({ ...form, category: v, category_icon: cat?.icon || "HelpCircle" });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label>Priorità (basso = prima)</Label>
                <Input type="number" min="1" value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 10 })} />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch checked={form.is_case_sensitive} onCheckedChange={(v) => setForm({ ...form, is_case_sensitive: v })} />
                <Label>Maiuscole/minuscole</Label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.auto_apply} onCheckedChange={(v) => setForm({ ...form, auto_apply: v })} />
              <Label>Applica automaticamente alle sincronizzazioni</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={saving}>Annulla</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvataggio..." : editRule ? "Salva" : "Crea"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina regola</AlertDialogTitle>
            <AlertDialogDescription>La regola verrà eliminata definitivamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={!!pendingActionId}>
              {pendingActionId ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
