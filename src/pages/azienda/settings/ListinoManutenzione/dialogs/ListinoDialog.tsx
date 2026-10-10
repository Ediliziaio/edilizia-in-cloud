/**
 * ListinoManutenzione — ListinoDialog (un prezzo di manutenzione: impianto + intervento)
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 * Etichette collegate ai campi; una modifica che il database ignora senza errore non si annuncia più come «aggiornata».
 */
import { useId, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { testoErrore } from "@/lib/impostazioni/testoErrore";
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
  const idBase = useId();
  const [impiantoId, setImpiantoId] = useState(editing?.tipo_impianto_id ?? "");
  const [interventoId, setInterventoId] = useState(editing?.tipo_intervento_id ?? "");
  const [prezzo, setPrezzo] = useState(String(editing?.prezzo_base ?? ""));
  const [iva, setIva] = useState(String(editing?.iva_percentuale ?? "22"));
  const [unita, setUnita] = useState(editing?.unita ?? "intervento");
  const [attivo, setAttivo] = useState(editing?.attivo ?? true);
  const [note, setNote] = useState(editing?.note ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!impiantoId) { toast.error("Scegli un tipo di impianto"); return; }
    if (!interventoId) { toast.error("Scegli un tipo di intervento"); return; }
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
        // .select("id"): un UPDATE che il database filtra (permesso mancante) non dà errore, risponde con zero righe.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("listino_prezzi") as any)
          .update(payload).eq("id", editing.id).eq("company_id", companyId).select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Modifica non salvata: verifica i permessi e riprova.");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("listino_prezzi") as any).insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Prezzo aggiornato" : "Prezzo creato");
      onSaved(); onClose();
    } catch (err: unknown) {
      toast.error(testoErrore(err, "Prezzo non salvato."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica prezzo di manutenzione" : "Nuovo prezzo di manutenzione"}</DialogTitle>
          <DialogDescription>
            Il prezzo di un intervento su un impianto (per esempio Manutenzione ordinaria su una Caldaia).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor={`${idBase}-impianto`}>Tipo di impianto *</Label>
            <Select value={impiantoId} onValueChange={setImpiantoId} disabled={!!editing}>
              <SelectTrigger id={`${idBase}-impianto`} className="mt-1.5 max-md:h-11"><SelectValue placeholder="Scegli l'impianto…" /></SelectTrigger>
              <SelectContent>
                {tipiImpianto.filter((t) => t.attivo || t.id === impiantoId).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.icona ? `${t.icona} ` : ""}{t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${idBase}-intervento`}>Tipo di intervento *</Label>
            <Select value={interventoId} onValueChange={setInterventoId} disabled={!!editing}>
              <SelectTrigger id={`${idBase}-intervento`} className="mt-1.5 max-md:h-11"><SelectValue placeholder="Scegli l'intervento…" /></SelectTrigger>
              <SelectContent>
                {tipiIntervento.filter((t) => t.attivo || t.id === interventoId).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor={`${idBase}-prezzo`}>Prezzo €</Label>
              <Input
                id={`${idBase}-prezzo`}
                type="number" min="0" step="0.01"
                value={prezzo}
                onChange={(e) => setPrezzo(e.target.value)}
                placeholder="0.00"
                className="mt-1.5 max-md:h-11"
              />
            </div>
            <div>
              <Label htmlFor={`${idBase}-iva`}>IVA %</Label>
              <Select value={iva} onValueChange={setIva}>
                <SelectTrigger id={`${idBase}-iva`} className="mt-1.5 max-md:h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IVA_OPTIONS.map((v) => (
                    <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`${idBase}-unita`}>Unità</Label>
              <Select value={unita} onValueChange={setUnita}>
                <SelectTrigger id={`${idBase}-unita`} className="mt-1.5 max-md:h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITA_OPTIONS.map((u) => (
                    <SelectItem key={u} value={u}>{UNITA_LABEL[u]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor={`${idBase}-note`}>Note (opzionale)</Label>
            <Input
              id={`${idBase}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Es. prezzo valido solo fuori orario"
              className="mt-1.5 max-md:h-11"
            />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor={`${idBase}-attivo`}>Prezzo attivo</Label>
            <Switch id={`${idBase}-attivo`} aria-describedby={`${idBase}-attivo-testo`} checked={attivo} onCheckedChange={setAttivo} />
            <span id={`${idBase}-attivo-testo`} className="text-xs text-muted-foreground">
              {attivo ? "Visibile in preventivi e interventi" : "Nascosto (bozza)"}
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
