/**
 * ListinoManutenzione — ListinoDialog (tariffa CRUD)
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UNITA_OPTIONS, IVA_OPTIONS, UNITA_LABEL } from "../constants";
import type { ListinoPrezzo, TipoImpianto, TipoIntervento } from "../types";

export function ListinoDialog({
  open, onClose, editing, companyId, tipiImpianto, tipiIntervento, onSaved,
}: {
  open: boolean; onClose: () => void; editing: ListinoPrezzo | null;
  companyId: string;
  tipiImpianto: TipoImpianto[];
  tipiIntervento: TipoIntervento[];
  onSaved: () => void;
}) {
  const [impiantoId, setImpiantoId] = useState(editing?.tipo_impianto_id ?? "");
  const [interventoId, setInterventoId] = useState(editing?.tipo_intervento_id ?? "");
  const [prezzo, setPrezzo] = useState(String(editing?.prezzo_base ?? ""));
  const [iva, setIva] = useState(String(editing?.iva_percentuale ?? "22"));
  const [unita, setUnita] = useState(editing?.unita ?? "intervento");
  const [attivo, setAttivo] = useState(editing?.attivo ?? true);
  const [note, setNote] = useState(editing?.note ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!impiantoId) { toast.error("Seleziona un tipo impianto"); return; }
    if (!interventoId) { toast.error("Seleziona un tipo intervento"); return; }
    if (!prezzo.trim() || isNaN(parseFloat(prezzo))) { toast.error("Inserisci un prezzo valido"); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        tipo_impianto_id: impiantoId,
        tipo_intervento_id: interventoId,
        prezzo_base: parseFloat(prezzo),
        iva_percentuale: parseInt(iva, 10),
        unita,
        attivo,
        note: note.trim() || null,
      };
      if (editing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("listino_prezzi") as any)
          .update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("listino_prezzi") as any).insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Tariffa aggiornata" : "Tariffa creata");
      onSaved(); onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica tariffa" : "Nuova tariffa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo impianto *</Label>
            <Select value={impiantoId} onValueChange={setImpiantoId} disabled={!!editing}>
              <SelectTrigger><SelectValue placeholder="Seleziona impianto..." /></SelectTrigger>
              <SelectContent>
                {tipiImpianto.filter((t) => t.attivo).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.icona ? `${t.icona} ` : ""}{t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo intervento *</Label>
            <Select value={interventoId} onValueChange={setInterventoId} disabled={!!editing}>
              <SelectTrigger><SelectValue placeholder="Seleziona intervento..." /></SelectTrigger>
              <SelectContent>
                {tipiIntervento.filter((t) => t.attivo).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Prezzo €</Label>
              <Input
                type="number" min="0" step="0.01"
                value={prezzo}
                onChange={(e) => setPrezzo(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>IVA %</Label>
              <Select value={iva} onValueChange={setIva}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IVA_OPTIONS.map((v) => (
                    <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unità</Label>
              <Select value={unita} onValueChange={setUnita}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITA_OPTIONS.map((u) => (
                    <SelectItem key={u} value={u}>{UNITA_LABEL[u]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Note (opzionale)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Es. tariffa valida solo fuori orario"
            />
          </div>
          <div className="flex items-center gap-3">
            <Label>Tariffa attiva</Label>
            <Switch checked={attivo} onCheckedChange={setAttivo} />
            <span className="text-xs text-muted-foreground">
              {attivo ? "Visibile in preventivi e interventi" : "Nascosta (bozza)"}
            </span>
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
