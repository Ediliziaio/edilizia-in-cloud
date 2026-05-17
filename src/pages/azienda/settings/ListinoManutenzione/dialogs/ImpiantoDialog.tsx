/**
 * ListinoManutenzione — ImpiantoDialog
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 */
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ICONE_IMPIANTO } from "../constants";
import type { TipoImpianto } from "../types";

export function ImpiantoDialog({
  open, onClose, editing, companyId, onSaved,
}: {
  open: boolean; onClose: () => void; editing: TipoImpianto | null;
  companyId: string; onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [icona, setIcona] = useState(editing?.icona ?? "🔧");
  const [ordine, setOrdine] = useState(String(editing?.ordine ?? ""));
  const [attivo, setAttivo] = useState(editing?.attivo ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Il nome è obbligatorio"); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        nome: nome.trim(),
        icona: icona || null,
        ordine: ordine.trim() !== "" ? parseInt(ordine, 10) : null,
        attivo,
      };
      if (editing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("tipi_impianto") as any)
          .update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("tipi_impianto") as any).insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Tipo impianto aggiornato" : "Tipo impianto creato");
      onSaved(); onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica tipo impianto" : "Nuovo tipo impianto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Caldaia" />
          </div>
          <div>
            <Label>Icona</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ICONE_IMPIANTO.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcona(ic)}
                  className={`text-xl p-1.5 rounded border-2 transition-colors ${
                    icona === ic ? "border-orange-500 bg-orange-50" : "border-transparent hover:border-gray-200"
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ordine</Label>
              <Input
                type="number" min="0"
                value={ordine}
                onChange={(e) => setOrdine(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <Label>Attivo</Label>
              <Switch checked={attivo} onCheckedChange={setAttivo} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
