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
import { Tags, Plus, Trash2, Pencil } from "lucide-react";
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
  { value: "Non categorizzata", icon: "HelpCircle" },
];

interface Props {
  companyId: string;
}

export default function CategorizationRules({ companyId }: Props) {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [form, setForm] = useState({
    pattern: "",
    category: "Fornitori",
    category_icon: "Package",
    is_case_sensitive: false,
    priority: 10,
  });

  useEffect(() => {
    if (companyId) void loadRules();
    else {
      setRules([]);
      setLoading(false);
    }
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
    setForm({ pattern: "", category: "Fornitori", category_icon: "Package", is_case_sensitive: false, priority: 10 });
    setShowAdd(true);
  }

  function openEdit(rule: any) {
    setEditRule(rule);
    setForm({
      pattern: rule.pattern,
      category: rule.category,
      category_icon: rule.category_icon || "HelpCircle",
      is_case_sensitive: rule.is_case_sensitive || false,
      priority: rule.priority || 10,
    });
    setShowAdd(true);
  }

  async function handleSave() {
    if (!form.pattern.trim()) {
      toast.error("Il pattern è obbligatorio");
      return;
    }
    if (!companyId) {
      toast.error("Azienda non disponibile");
      return;
    }
    if (!Number.isFinite(form.priority) || form.priority < 1) {
      toast.error("La priorità deve essere almeno 1");
      return;
    }

    const pattern = form.pattern.trim();
    const duplicated = rules.some((rule) =>
      rule.id !== editRule?.id
      && String(rule.pattern || "").toLocaleLowerCase() === pattern.toLocaleLowerCase()
    );
    if (duplicated) {
      toast.error("Esiste già una regola con questo pattern");
      return;
    }

    const payload = {
      company_id: companyId,
      pattern,
      category: form.category,
      category_icon: form.category_icon,
      is_case_sensitive: form.is_case_sensitive,
      priority: form.priority,
      is_active: true,
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

  async function handleToggle(id: string, isActive: boolean) {
    setPendingActionId(id);
    try {
      const { error } = await supabase
        .from("bank_categorization_rules")
        .update({ is_active: !isActive })
        .eq("id", id)
        .eq("company_id", companyId);
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
        .delete()
        .eq("id", deleteId)
        .eq("company_id", companyId);
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

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold flex items-center gap-2">
          <Tags className="h-4 w-4" /> Regole di Categorizzazione
        </h3>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" /> Nuova Regola
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Crea regole personalizzate per categorizzare automaticamente le transazioni in base al testo della descrizione o del creditore.
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
            Nessuna regola personalizzata. Le transazioni usano la categorizzazione automatica di default.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id} className={!rule.is_active ? "opacity-50" : ""}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="font-mono text-xs">{rule.pattern}</Badge>
                  <span className="text-sm">→</span>
                  <Badge>{rule.category}</Badge>
                  {rule.is_case_sensitive && (
                    <Badge variant="outline" className="text-xs">Case-sensitive</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">Priorità: {rule.priority}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={rule.is_active} disabled={pendingActionId === rule.id} onCheckedChange={() => handleToggle(rule.id, rule.is_active)} />
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
            <div>
              <Label>Pattern (testo da cercare nella descrizione)</Label>
              <Input
                placeholder="Es: ENEL ENERGIA, FORNITORE XYZ"
                value={form.pattern}
                onChange={(e) => setForm({ ...form, pattern: e.target.value })}
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select
                value={form.category}
                onValueChange={(v) => {
                  const cat = CATEGORIES.find((c) => c.value === v);
                  setForm({ ...form, category: v, category_icon: cat?.icon || "HelpCircle" });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priorità (numero basso = più prioritario)</Label>
              <Input
                type="number"
                min="1"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 10 })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_case_sensitive}
                onCheckedChange={(v) => setForm({ ...form, is_case_sensitive: v })}
              />
              <Label>Case-sensitive</Label>
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
