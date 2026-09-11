/**
 * WhatsApp Locale — gestione REGOLE automatiche.
 *
 * Ogni regola: trigger sul testo in arrivo (parole chiave / primo contatto /
 * fuori orario) → azioni (auto-risposta, tag, notifica email, blocco). Le regole
 * si applicano a un numero specifico o a tutti. Valutate per priorità nel webhook.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Zap } from "lucide-react";

interface RuleRow {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  number_id: string | null;
  match_type: string;
  match_keywords: string[];
  only_first_contact: boolean;
  only_outside_hours: boolean;
  reply_text: string | null;
  add_tags: string[];
  notify_email: string | null;
  block: boolean;
}

interface NumberOpt { id: string; display_name: string | null; numero: string | null }

const MATCH_LABELS: Record<string, string> = {
  any: "Qualsiasi messaggio",
  contains: "Contiene",
  equals: "È esattamente",
  starts_with: "Inizia con",
};

function emptyDraft(): Partial<RuleRow> {
  return {
    name: "Nuova regola", enabled: true, priority: 100, number_id: null,
    match_type: "contains", match_keywords: [], only_first_contact: false, only_outside_hours: false,
    reply_text: "", add_tags: [], notify_email: "", block: false,
  };
}

export default function RulesManager({ numbers }: { numbers: NumberOpt[] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Partial<RuleRow> | null>(null);

  const rulesQuery = useQuery({
    queryKey: ["openwa", "rules"],
    queryFn: async () => {
      // Solo le regole generali: quelle di una campagna si gestiscono dalla
      // campagna (Marketing → WhatsApp Locale → Campagne → Quando risponde).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("openwa_rules")
        .select("*")
        .is("campagna_id", null)
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RuleRow[];
    },
  });
  const rules = rulesQuery.data ?? [];

  const numberLabel = (id: string | null) => {
    if (!id) return "Tutti i numeri";
    const n = numbers.find((x) => x.id === id);
    return n ? (n.display_name || n.numero || "Numero") : "Numero rimosso";
  };

  const saveRule = useMutation({
    mutationFn: async (draft: Partial<RuleRow>) => {
      const payload = {
        name: draft.name?.trim() || "Regola",
        enabled: draft.enabled ?? true,
        priority: Number(draft.priority) || 100,
        number_id: draft.number_id || null,
        match_type: draft.match_type || "contains",
        match_keywords: draft.match_keywords ?? [],
        only_first_contact: draft.only_first_contact ?? false,
        only_outside_hours: draft.only_outside_hours ?? false,
        reply_text: draft.reply_text?.trim() || null,
        add_tags: draft.add_tags ?? [],
        notify_email: draft.notify_email?.trim() || null,
        block: draft.block ?? false,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = (supabase as any).from("openwa_rules");
      const { error } = draft.id
        ? await table.update(payload).eq("id", draft.id)
        : await table.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regola salvata");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["openwa", "rules"] });
    },
    onError: () => toast.error("Salvataggio regola non riuscito"),
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("openwa_rules").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["openwa", "rules"] }),
    onError: (e: Error) => toast.error("Regola non aggiornata", { description: e.message }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("openwa_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regola eliminata");
      queryClient.invalidateQueries({ queryKey: ["openwa", "rules"] });
    },
    onError: (e: Error) => toast.error("Regola non eliminata", { description: e.message }),
  });

  function actionsSummary(r: RuleRow): string {
    const parts: string[] = [];
    if (r.block) parts.push("Blocca");
    if (r.reply_text) parts.push("Risponde");
    if (r.add_tags?.length) parts.push(`Tag: ${r.add_tags.join(", ")}`);
    if (r.notify_email) parts.push("Notifica");
    return parts.join(" · ") || "Nessuna azione";
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" /> Regole automatiche
        </CardTitle>
        <Button size="sm" onClick={() => setEditing(emptyDraft())}>
          <Plus className="mr-2 h-4 w-4" /> Nuova regola
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Quando arriva un messaggio, le regole attive vengono applicate in ordine di priorità:
          risposta automatica, tag/assegnazione, notifica o blocco. Valgono per tutte le chat;
          cosa fare quando risponde il destinatario di una campagna si decide dentro la campagna.
        </p>
        {rulesQuery.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna regola. Creane una per automatizzare le risposte.</p>
        ) : (
          rules.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <Badge variant="outline" className="text-[10px]">{numberLabel(r.number_id)}</Badge>
                  {r.block && <Badge variant="destructive" className="text-[10px]">blocco</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {MATCH_LABELS[r.match_type]}{r.match_type !== "any" && r.match_keywords?.length ? ` “${r.match_keywords.join(", ")}”` : ""}
                  {" → "}{actionsSummary(r)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Switch checked={r.enabled} onCheckedChange={(v) => toggleRule.mutate({ id: r.id, enabled: v })} />
                <Button variant="ghost" size="sm" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => { if (window.confirm("Eliminare questa regola?")) deleteRule.mutate(r.id); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      {editing && (
        <RuleEditorDialog
          draft={editing}
          numbers={numbers}
          onClose={() => setEditing(null)}
          onSave={(d) => saveRule.mutate(d)}
          saving={saveRule.isPending}
        />
      )}
    </Card>
  );
}

function RuleEditorDialog({
  draft, numbers, onClose, onSave, saving,
}: {
  draft: Partial<RuleRow>;
  numbers: NumberOpt[];
  onClose: () => void;
  onSave: (d: Partial<RuleRow>) => void;
  saving: boolean;
}) {
  const [d, setD] = useState<Partial<RuleRow>>(draft);
  const [keywordsText, setKeywordsText] = useState((draft.match_keywords ?? []).join(", "));
  const [tagsText, setTagsText] = useState((draft.add_tags ?? []).join(", "));
  const set = (patch: Partial<RuleRow>) => setD((prev) => ({ ...prev, ...patch }));

  function submit() {
    onSave({
      ...d,
      match_keywords: keywordsText.split(",").map((k) => k.trim()).filter(Boolean),
      add_tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Modifica regola" : "Nuova regola"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={d.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Si applica a</Label>
              <Select value={d.number_id ?? "all"} onValueChange={(v) => set({ number_id: v === "all" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i numeri</SelectItem>
                  {numbers.map((n) => (
                    <SelectItem key={n.id} value={n.id}>{n.display_name || n.numero || "Numero"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priorità (più basso = prima)</Label>
              <Input type="number" value={String(d.priority ?? 100)} onChange={(e) => set({ priority: Number(e.target.value) })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Quando il messaggio…</Label>
            <Select value={d.match_type ?? "contains"} onValueChange={(v) => set({ match_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(MATCH_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {d.match_type !== "any" && (
            <div className="space-y-1.5">
              <Label>Parole chiave (separate da virgola)</Label>
              <Input placeholder="es. prezzo, preventivo, info" value={keywordsText} onChange={(e) => setKeywordsText(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Maiuscole, accenti e punteggiatura non contano. Una parola vale solo intera («no» non scatta dentro «buongiorno»).
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={d.only_first_contact ?? false} onCheckedChange={(v) => set({ only_first_contact: v })} />
              Solo al primo messaggio
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={d.only_outside_hours ?? false} onCheckedChange={(v) => set({ only_outside_hours: v })} />
              Solo fuori orario
            </label>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Azioni</p>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={d.block ?? false} onCheckedChange={(v) => set({ block: v })} />
              Blocca/ignora (spam) — ferma ogni altra azione
            </label>
            {!d.block && (
              <>
                <div className="space-y-1.5">
                  <Label>Risposta automatica (opzionale)</Label>
                  <Textarea
                    rows={2}
                    placeholder="Ciao! {Grazie per il messaggio|Ti rispondiamo a breve}."
                    value={d.reply_text ?? ""}
                    onChange={(e) => set({ reply_text: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">Puoi variare il testo con {"{opzione1|opzione2}"} (anti-blocco).</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Aggiungi tag al contatto (opzionale)</Label>
                  <Input placeholder="es. interessato, da-richiamare" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Notifica email (opzionale)</Label>
                  <Input type="email" placeholder="team@tuodominio.it" value={d.notify_email ?? ""} onChange={(e) => set({ notify_email: e.target.value })} />
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvataggio…" : "Salva regola"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
