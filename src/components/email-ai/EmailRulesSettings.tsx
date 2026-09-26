/**
 * EmailRulesSettings — MP-EMAIL-AI-05 · UI gestione regole instradamento
 *
 * Lista regole + editor (condizioni AND/OR → azioni multiple).
 * Le regole girano in L1 (costo zero) PRIMA di mittenti_noti e regex.
 * Da montare in una tab delle impostazioni email.
 */

import { useState } from "react";
import {
  useEmailRegole, useSaveEmailRegola, useDeleteEmailRegola, useToggleEmailRegola,
  type EmailRegola,
} from "@/lib/email-ai/hooks";
import type { Condizione, Azione, CampoCondizione, OperatoreCondizione, TipoAzione } from "@/lib/email-ai/rules-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Pencil, Zap, GitBranch } from "lucide-react";
import { CATEGORIA_LABELS, type EmailCategoria } from "@/lib/email-ai/types";

const CAMPI: { value: CampoCondizione; label: string }[] = [
  { value: "indirizzo", label: "Indirizzo mittente" },
  { value: "dominio", label: "Dominio mittente" },
  { value: "destinatario", label: "Destinatario (a/cc)" },
  { value: "oggetto", label: "Oggetto" },
  { value: "corpo", label: "Corpo" },
  { value: "allegato", label: "Ha allegato" },
  { value: "casella", label: "Casella ricevente" },
];
const OPERATORI: { value: OperatoreCondizione; label: string }[] = [
  { value: "e", label: "è" },
  { value: "contiene", label: "contiene" },
  { value: "termina_con", label: "termina con" },
  { value: "inizia_con", label: "inizia con" },
  { value: "regex", label: "regex" },
];
// Le esegue il server (email-ai-cascade.ts, applicaEffettiRegola): silenzia =
// letta, marca da fare = stella, priorità = ai_priority che l'AI non cambia.
const TIPI_AZIONE: { value: TipoAzione; label: string }[] = [
  { value: "categoria", label: "Assegna categoria" },
  { value: "priorita", label: "Imposta priorità" },
  { value: "silenzia", label: "Silenzia (segna come letta)" },
  { value: "marca_da_fare", label: "Marca da fare (stella)" },
];

const emptyRegola = (): Partial<EmailRegola> => ({
  nome: "", priorita: 100, combinatore: "AND",
  condizioni: [{ campo: "indirizzo", operatore: "e", valore: "" }],
  azioni: [{ tipo: "categoria", valore: "fornitore" }],
  stato: "attiva",
});

export function EmailRulesSettings() {
  const { data: regole, isLoading } = useEmailRegole();
  const save = useSaveEmailRegola();
  const del = useDeleteEmailRegola();
  const toggle = useToggleEmailRegola();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Partial<EmailRegola> | null>(null);
  const [open, setOpen] = useState(false);

  const openEditor = (r?: EmailRegola) => {
    setEditing(r ? { ...r } : emptyRegola());
    setOpen(true);
  };

  const handleSave = async () => {
    if (!editing || !editing.nome?.trim()) return;
    try {
      await save.mutateAsync(editing);
    } catch {
      return; // l'errore lo mostra il toast di useSaveEmailRegola; il dialogo resta aperto
    }
    setOpen(false);
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-violet-500" />
            Regole di smistamento
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quando un'email corrisponde alle condizioni, applica le azioni. Girano a costo zero (Livello 1).
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => openEditor()} className="gap-1.5">
              <Plus className="h-4 w-4" /> Nuova regola
            </Button>
          </DialogTrigger>
          <RuleEditorDialog editing={editing} setEditing={setEditing} onSave={handleSave} saving={save.isPending} />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : !regole || regole.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nessuna regola. Creane una per smistare automaticamente le email (es. fornitore con più indirizzi).
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {regole.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <Switch
                  checked={r.stato === "attiva"}
                  onCheckedChange={(c) => toggle.mutate({ id: r.id, stato: c ? "attiva" : "disattivata" })}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{r.nome}</span>
                    {r.origine === "auto" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">auto</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">priorità {r.priorita}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.condizioni.length} condizion{r.condizioni.length === 1 ? "e" : "i"} ({r.combinatore}) → {r.azioni.length} azion{r.azioni.length === 1 ? "e" : "i"}
                    {r.match_count > 0 && <span className="ml-1 text-emerald-600">· {r.match_count} match</span>}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditor(r)} aria-label="Modifica">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Eliminare la regola email?",
                        description: `La regola "${r.nome}" verrà rimossa definitivamente e non verrà più applicata alle email in arrivo.`,
                        confirmLabel: "Elimina",
                        variant: "destructive",
                      })
                    ) {
                      del.mutate(r.id);
                    }
                  }}
                  aria-label={`Elimina regola ${r.nome}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RuleEditorDialog({
  editing, setEditing, onSave, saving,
}: {
  editing: Partial<EmailRegola> | null;
  setEditing: (r: Partial<EmailRegola>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  if (!editing) return null;
  const condizioni = editing.condizioni ?? [];
  const azioni = editing.azioni ?? [];

  const upd = (patch: Partial<EmailRegola>) => setEditing({ ...editing, ...patch });
  const updCond = (i: number, patch: Partial<Condizione>) =>
    upd({ condizioni: condizioni.map((c, idx) => idx === i ? { ...c, ...patch } : c) });
  const updAz = (i: number, patch: Partial<Azione>) =>
    upd({ azioni: azioni.map((a, idx) => idx === i ? { ...a, ...patch } : a) });

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-violet-500" />
          {editing.id ? "Modifica regola" : "Nuova regola"}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Nome regola</label>
            <Input value={editing.nome ?? ""} onChange={(e) => upd({ nome: e.target.value })}
              placeholder="es. Preventivi Edil Forniture" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Priorità (basso = prima)</label>
            <Input type="number" value={editing.priorita ?? 100} onChange={(e) => upd({ priorita: Number(e.target.value) })} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Combinatore condizioni</label>
            <Select value={editing.combinatore ?? "AND"} onValueChange={(v) => upd({ combinatore: v as "AND" | "OR" })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">Tutte (AND)</SelectItem>
                <SelectItem value="OR">Almeno una (OR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Condizioni */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Se l'email…</label>
            <Button variant="ghost" size="sm" className="h-7 gap-1"
              onClick={() => upd({ condizioni: [...condizioni, { campo: "oggetto", operatore: "contiene", valore: "" }] })}>
              <Plus className="h-3.5 w-3.5" /> Condizione
            </Button>
          </div>
          <div className="space-y-2">
            {condizioni.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={c.campo} onValueChange={(v) => updCond(i, { campo: v as CampoCondizione })}>
                  <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{CAMPI.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={c.operatore} onValueChange={(v) => updCond(i, { operatore: v as OperatoreCondizione })}>
                  <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{OPERATORI.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={c.valore} onChange={(e) => updCond(i, { valore: e.target.value })} placeholder="valore" className="h-9 flex-1" />
                {condizioni.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive shrink-0"
                    onClick={() => upd({ condizioni: condizioni.filter((_, idx) => idx !== i) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Azioni */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">…allora fai</label>
              <p className="text-[11px] text-muted-foreground">Senza «Assegna categoria» la categoria la sceglie la classificazione automatica.</p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1"
              onClick={() => upd({ azioni: [...azioni, { tipo: "priorita", valore: "alta" }] })}>
              <Plus className="h-3.5 w-3.5" /> Azione
            </Button>
          </div>
          <div className="space-y-2">
            {azioni.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={a.tipo} onValueChange={(v) => updAz(i, { tipo: v as TipoAzione, valore: defaultAzValue(v as TipoAzione) })}>
                  <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPI_AZIONE.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                {a.tipo === "categoria" ? (
                  <Select value={String(a.valore ?? "fornitore")} onValueChange={(v) => updAz(i, { valore: v })}>
                    <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CATEGORIA_LABELS) as EmailCategoria[]).map((cat) =>
                        <SelectItem key={cat} value={cat}>{CATEGORIA_LABELS[cat]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : a.tipo === "priorita" ? (
                  <Select value={String(a.valore ?? "alta")} onValueChange={(v) => updAz(i, { valore: v })}>
                    <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="media">Media</SelectItem>
                      <SelectItem value="bassa">Bassa</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="flex-1 text-xs text-muted-foreground px-2">nessun parametro</span>
                )}
                {azioni.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive shrink-0"
                    onClick={() => upd({ azioni: azioni.filter((_, idx) => idx !== i) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button onClick={onSave} disabled={saving || !editing.nome?.trim()}>
          {saving ? "Salvataggio…" : "Salva regola"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function defaultAzValue(tipo: TipoAzione): unknown {
  switch (tipo) {
    case "categoria": return "fornitore";
    case "priorita": return "alta";
    default: return undefined;
  }
}
