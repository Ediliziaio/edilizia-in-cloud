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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCatalogoCassa } from "@/lib/finance/cassaVoci";
import { ScegliVoceCassa } from "./ScegliVoceCassa";
import { euroIntero } from "@/lib/controlloGestione/formatoCG";

// Colonne nuove (voce di cassa e verso, 15/11/2026) non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Verso = "entrata" | "uscita" | "entrambi";
const VERSI: { value: Verso; label: string }[] = [
  { value: "uscita", label: "Solo uscite" },
  { value: "entrata", label: "Solo entrate" },
  { value: "entrambi", label: "Entrate e uscite" },
];
interface Anteprima { movimenti: number; regole: { regola: string; testo: string; voce: string; codice: string; movimenti: number; cents: number }[]; aggiornati?: number }

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
  cassa_voce_id: null as string | null, verso: "uscita" as Verso,
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
  const [sceltaVoce, setSceltaVoce] = useState(false);
  const [anteprima, setAnteprima] = useState<Anteprima | null>(null);
  const catalogo = useCatalogoCassa(companyId || null);
  const nomeVoce = (id: string | null | undefined) => (id ? catalogo.data?.find((v) => v.id === id)?.nome ?? null : null);

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
      cassa_voce_id: rule.cassa_voce_id ?? null,
      verso: (rule.verso as Verso) ?? "entrambi",
    });
    setShowAdd(true);
  }

  async function handleSave() {
    const value = form.match_value.trim();
    if (!value) { toast.error("Il testo da cercare è obbligatorio"); return; }
    if (!companyId) { toast.error("Azienda non disponibile"); return; }
    if (!Number.isFinite(form.priority) || form.priority < 1) { toast.error("La priorità deve essere almeno 1"); return; }
    if (!form.cassa_voce_id && !editRule) { toast.error("Scegli la voce del cash flow da assegnare"); return; }

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
      cassa_voce_id: form.cassa_voce_id, verso: form.verso,
    };

    setSaving(true);
    try {
      const { error } = editRule
        ? await db.from("bank_categorization_rules").update(payload).eq("id", editRule.id).eq("company_id", companyId)
        : await db.from("bank_categorization_rules").insert(payload);
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

  /** Prima l'anteprima: quanti movimenti senza categoria prenderebbero quale voce. */
  async function applyNow() {
    setApplying(true);
    try {
      const { data, error } = await db.rpc("cassa_regole_applica", { p_company: companyId, p_anteprima: true });
      if (error) throw error;
      setAnteprima(data as Anteprima);
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    } finally {
      setApplying(false);
    }
  }

  async function confermaApplica() {
    setApplying(true);
    try {
      const { data, error } = await db.rpc("cassa_regole_applica", { p_company: companyId, p_anteprima: false });
      if (error) throw error;
      // Le regole solo testuali (senza voce) continuano a scrivere il vecchio testo.
      await supabase.rpc("apply_bank_categorization_rules", { p_company_id: companyId });
      const n = (data as Anteprima).aggiornati ?? 0;
      toast.success(n > 0 ? `${n} moviment${n === 1 ? "o classificato" : "i classificati"} con le regole` : "Nessun movimento da classificare con le regole attuali");
      setAnteprima(null);
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
        Una regola riconosce i movimenti dal testo (descrizione, creditore, debitore) e assegna una voce del cash flow.
        Nelle proposte vale prima di tutto il resto; con «Applica ora» vedi quanti movimenti senza categoria classificherebbe e la applichi.
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
                  <Badge>{nomeVoce(rule.cassa_voce_id) ?? rule.category}</Badge>
                  {!rule.cassa_voce_id && <Badge variant="outline" className="text-xs" title="Scegli una voce del cash flow per farla contare nel cash flow">solo testo</Badge>}
                  {rule.verso && rule.verso !== "entrambi" && <span className="text-xs text-muted-foreground">{rule.verso === "uscita" ? "uscite" : "entrate"}</span>}
                  {rule.is_case_sensitive && <Badge variant="outline" className="text-xs">Aa</Badge>}
                  <span className="text-xs text-muted-foreground">P{rule.priority}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch aria-label={`Applica automaticamente la regola ${rule.match_value}`} checked={rule.auto_apply !== false} disabled={pendingActionId === rule.id} onCheckedChange={() => handleToggle(rule.id, rule.auto_apply !== false)} />
                  <Button variant="ghost" size="icon" disabled={pendingActionId === rule.id} aria-label={`Modifica regola ${rule.match_value}`} onClick={() => openEdit(rule)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={pendingActionId === rule.id} aria-label={`Elimina regola ${rule.match_value}`} onClick={() => setDeleteId(rule.id)}>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Movimenti</Label>
                <Select value={form.verso} onValueChange={(v) => setForm({ ...form, verso: v as Verso })}>
                  <SelectTrigger aria-label="Verso dei movimenti"><SelectValue /></SelectTrigger>
                  <SelectContent>{VERSI.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Voce del cash flow</Label>
                <Popover open={sceltaVoce} onOpenChange={setSceltaVoce}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start truncate font-normal" aria-label={`Voce del cash flow: ${nomeVoce(form.cassa_voce_id) ?? "da scegliere"}`}>
                      {nomeVoce(form.cassa_voce_id) ?? <span className="text-muted-foreground">Scegli la voce</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[26rem] max-w-[calc(100vw-2rem)] p-3">
                    <ScegliVoceCassa
                      catalogo={catalogo.data}
                      importo={form.verso === "entrata" ? 1 : -1}
                      selezionata={form.cassa_voce_id}
                      onScegli={(v) => {
                        setForm({ ...form, cassa_voce_id: v.id, category: v.nome, category_icon: "Tags" });
                        setSceltaVoce(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label>Priorità (basso = prima)</Label>
                <Input type="number" min="1" value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 10 })} />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch aria-label="Distingui maiuscole e minuscole" checked={form.is_case_sensitive} onCheckedChange={(v) => setForm({ ...form, is_case_sensitive: v })} />
                <Label>Maiuscole/minuscole</Label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch aria-label="Applica automaticamente alle sincronizzazioni" checked={form.auto_apply} onCheckedChange={(v) => setForm({ ...form, auto_apply: v })} />
              <Label>Applica automaticamente alle sincronizzazioni</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={saving}>Annulla</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvataggio..." : editRule ? "Salva" : "Crea"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Anteprima di «Applica ora» */}
      <AlertDialog open={!!anteprima} onOpenChange={(o) => !o && setAnteprima(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Applica le regole</AlertDialogTitle>
            <AlertDialogDescription>
              {anteprima?.movimenti
                ? `${anteprima.movimenti} moviment${anteprima.movimenti === 1 ? "o" : "i"} ancora senza categoria prenderanno la voce della prima regola che li riconosce. Quelli già classificati non si toccano.`
                : "Nessun movimento senza categoria corrisponde alle regole con una voce."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!!anteprima?.regole.length && (
            <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
              {anteprima.regole.map((r) => (
                <li key={r.regola} className="flex items-center justify-between gap-3 rounded border px-2 py-1">
                  <span className="min-w-0 truncate"><span className="font-mono text-xs">{r.testo}</span> → {r.voce}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{r.movimenti} · {euroIntero(r.cents / 100)}</span>
                </li>
              ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confermaApplica(); }} disabled={applying}>
              {applying ? "Applicazione..." : anteprima?.movimenti ? `Applica a ${anteprima.movimenti}` : "Applica comunque le regole di solo testo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
