/**
 * Editor del Processo standard commessa (per-azienda, per mestiere).
 *
 * Gestisce le righe di `order_task_template`: le attività standard che, applicate
 * a una commessa, generano task reali con scadenza relativa alla data commessa.
 * Dialog (niente route nuove). Salvataggio = replace delle righe del vertical
 * corrente (lista piccola, come i bundle).
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getOrderPlaybook, PLAYBOOK_LABELS } from "@/lib/orderPlaybook";

interface PlaybookEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  vertical?: string | null;
  onSaved?: () => void;
}

interface Row {
  _key: string;
  titolo: string;
  giorni_offset: number;
  priorita: "bassa" | "normale" | "alta" | "urgente";
  attivo: boolean;
}

const PRIORITA = ["bassa", "normale", "alta", "urgente"] as const;

function newKey() {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PlaybookEditorDialog({ open, onOpenChange, companyId, vertical, onSaved }: PlaybookEditorDialogProps) {
  const v = vertical ?? null;
  const playbookKey = getOrderPlaybook(vertical).key;
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [autoApply, setAutoApply] = useState(false);

  const { data: autoApplyData } = useQuery({
    queryKey: ["company-playbook-auto-apply", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("playbook_auto_apply")
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw error;
      return (data as { playbook_auto_apply?: boolean } | null)?.playbook_auto_apply ?? false;
    },
  });
  useEffect(() => { if (open) setAutoApply(!!autoApplyData); }, [autoApplyData, open]);

  const toggleAutoApply = async (val: boolean) => {
    setAutoApply(val);
    const { error } = await supabase.from("companies").update({ playbook_auto_apply: val } as never).eq("id", companyId);
    if (error) { setAutoApply(!val); toast.error("Non riesco a salvare l'interruttore: " + error.message); }
  };

  const { data: dbRows, isLoading, refetch } = useQuery({
    queryKey: ["order-task-template", companyId, v],
    enabled: open && !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("order_task_template")
        .select("id, titolo, giorni_offset, priorita, attivo, sort_order")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true });
      q = v === null ? q.is("vertical", null) : q.eq("vertical", v);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    setRows(
      (dbRows ?? []).map((r: { titolo: string; giorni_offset: number; priorita: string; attivo: boolean }) => ({
        _key: newKey(),
        titolo: r.titolo,
        giorni_offset: Number(r.giorni_offset) || 0,
        priorita: (r.priorita as Row["priorita"]) ?? "normale",
        attivo: r.attivo ?? true,
      })),
    );
  }, [dbRows, open]);

  const importaStandard = () => {
    const { steps } = getOrderPlaybook(vertical);
    setRows(steps.map((s) => ({ _key: newKey(), titolo: s.titolo, giorni_offset: s.giorni_offset, priorita: s.priorita, attivo: true })));
    toast.info("Flusso standard importato — modificalo e salva.");
  };

  const addRow = () => setRows((p) => [...p, { _key: newKey(), titolo: "", giorni_offset: 0, priorita: "normale", attivo: true }]);
  const updateRow = (key: string, patch: Partial<Row>) => setRows((p) => p.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) => setRows((p) => p.filter((r) => r._key !== key));

  const handleSave = async () => {
    setSaving(true);
    try {
      const valid = rows.filter((r) => r.titolo.trim());
      // replace: cancella le righe del vertical corrente, reinserisci.
      let del = supabase.from("order_task_template").delete().eq("company_id", companyId);
      del = v === null ? del.is("vertical", null) : del.eq("vertical", v);
      const { error: delErr } = await del;
      if (delErr) throw delErr;

      if (valid.length > 0) {
        const payload = valid.map((r, idx) => ({
          company_id: companyId,
          vertical: v,
          sort_order: idx,
          titolo: r.titolo.trim(),
          giorni_offset: Number(r.giorni_offset) || 0,
          priorita: r.priorita,
          attivo: r.attivo,
        }));
        const { error: insErr } = await supabase.from("order_task_template").insert(payload as never);
        if (insErr) throw insErr;
      }
      toast.success("Processo standard salvato.");
      refetch();
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error("Errore salvataggio: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-500" />
            Processo standard commessa · {PLAYBOOK_LABELS[playbookKey]}
          </DialogTitle>
          <DialogDescription>
            Le attività standard del tuo flusso. Quando le applichi a una commessa diventano task reali,
            con scadenza calcolata dalla data della commessa (giorni). Le assegni poi alle persone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">Applica automaticamente alle nuove commesse</p>
            <p className="text-xs text-muted-foreground">Ogni nuova commessa parte già con queste attività.</p>
          </div>
          <Switch checked={autoApply} onCheckedChange={toggleAutoApply} />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Caricamento…</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 border rounded-md">
            <p className="text-sm text-muted-foreground mb-3">Nessun processo standard personalizzato per questo mestiere.</p>
            <Button variant="outline" size="sm" onClick={importaStandard}>
              <Sparkles className="h-4 w-4 mr-1.5" /> Importa il flusso standard {PLAYBOOK_LABELS[playbookKey]}
            </Button>
            <p className="text-xs text-muted-foreground mt-3">…oppure aggiungi le tue attività una a una.</p>
            <Button variant="ghost" size="sm" className="mt-1" onClick={addRow}>
              <Plus className="h-4 w-4 mr-1" /> Aggiungi attività
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[1fr_90px_120px_56px_36px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Attività</span><span>Giorni</span><span>Priorità</span><span>Attiva</span><span></span>
            </div>
            {rows.map((r) => (
              <div key={r._key} className="grid grid-cols-[1fr_90px_120px_56px_36px] gap-2 items-center">
                <Input
                  value={r.titolo}
                  onChange={(e) => updateRow(r._key, { titolo: e.target.value })}
                  placeholder="Es. Ordine al fornitore"
                  className="h-9"
                />
                <Input
                  type="number" min={0} inputMode="numeric"
                  value={r.giorni_offset}
                  onChange={(e) => updateRow(r._key, { giorni_offset: Number(e.target.value) || 0 })}
                  className="h-9"
                  title="Giorni dalla data della commessa"
                />
                <Select value={r.priorita} onValueChange={(val) => updateRow(r._key, { priorita: val as Row["priorita"] })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITA.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex justify-center">
                  <Switch checked={r.attivo} onCheckedChange={(val) => updateRow(r._key, { attivo: val })} />
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => removeRow(r._key)} aria-label="Rimuovi">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={addRow}>
                <Plus className="h-4 w-4 mr-1" /> Aggiungi attività
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={importaStandard}>
                <Sparkles className="h-4 w-4 mr-1" /> Reimporta standard
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvataggio…" : "Salva processo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
