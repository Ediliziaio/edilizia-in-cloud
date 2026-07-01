import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCompanyEmailTemplates, type CompanyEmailTemplate } from "@/hooks/useCompanyEmailTemplates";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, X, Check } from "lucide-react";

export interface TemplateManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_OPTIONS = [
  { value: "generale", label: "Generale" },
  { value: "preventivo", label: "Preventivo" },
  { value: "sollecito", label: "Sollecito pagamento" },
  { value: "benvenuto", label: "Benvenuto" },
  { value: "appuntamento", label: "Appuntamento" },
];

const CATEGORY_COLORS: Record<string, string> = {
  generale: "bg-slate-100 text-slate-700",
  preventivo: "bg-blue-100 text-blue-700",
  sollecito: "bg-amber-100 text-amber-700",
  benvenuto: "bg-green-100 text-green-700",
  appuntamento: "bg-violet-100 text-violet-700",
};

interface FormState {
  name: string;
  category: string;
  subject: string;
  body_text: string;
}

const EMPTY_FORM: FormState = { name: "", category: "generale", subject: "", body_text: "" };

export function TemplateManagerDialog({ open, onOpenChange }: TemplateManagerDialogProps) {
  const { templates, isLoading, isError, createMutation, updateMutation, deleteMutation } = useCompanyEmailTemplates();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<CompanyEmailTemplate | null>(null);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (t: CompanyEmailTemplate) => {
    setEditingId(t.id);
    setForm({ name: t.name, category: t.category, subject: t.subject, body_text: t.body_text });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Il nome del template è obbligatorio"); return; }
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...form });
        toast.success("Template aggiornato");
      } else {
        await createMutation.mutateAsync(form);
        toast.success("Template creato");
      }
      cancelForm();
    } catch (e) {
      toast.error("Errore salvataggio", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success("Template eliminato");
    } catch (e) {
      toast.error("Errore eliminazione", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setDeleteTarget(null);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-base">Gestione template email</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {/* Form nuovo/modifica */}
            {showForm ? (
              <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
                <p className="text-sm font-medium text-slate-700">
                  {editingId ? "Modifica template" : "Nuovo template"}
                </p>
                <div className="space-y-1">
                  <Label className="text-xs">Nome *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Es. Invio preventivo"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Categoria</Label>
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Oggetto</Label>
                  <Input
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    placeholder="Oggetto del messaggio"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Testo</Label>
                  <Textarea
                    value={form.body_text}
                    onChange={(e) => setForm((f) => ({ ...f, body_text: e.target.value }))}
                    placeholder="Scrivi il testo del template…"
                    rows={8}
                    className="text-sm resize-y"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {editingId ? "Aggiorna" : "Crea template"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelForm} disabled={isSaving}>
                    <X className="h-3.5 w-3.5 mr-1" /> Annulla
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={openNew} className="gap-1.5 w-full">
                <Plus className="h-3.5 w-3.5" /> Nuovo template
              </Button>
            )}

            {!showForm && <Separator />}

            {/* Lista template */}
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <p className="text-xs text-muted-foreground italic">Impossibile caricare i template.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => qc.invalidateQueries({ queryKey: ["company_email_templates"] })}
                >
                  Riprova
                </Button>
              </div>
            ) : templates.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-4">
                Nessun template ancora — clicca «Nuovo template» per crearne uno.
              </p>
            ) : (
              <ul className="space-y-2">
                {templates.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 rounded-lg border bg-white p-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium truncate">{t.name}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.generale}`}>
                          {CATEGORY_OPTIONS.find((o) => o.value === t.category)?.label ?? t.category}
                        </Badge>
                      </div>
                      {t.subject && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{t.subject}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(t)}
                        title="Modifica"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                        onClick={() => setDeleteTarget(t)}
                        title="Elimina"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina template</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il template «{deleteTarget?.name}»?
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
