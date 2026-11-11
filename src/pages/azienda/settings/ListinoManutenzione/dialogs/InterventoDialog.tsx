/**
 * ListinoManutenzione — InterventoDialog
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 * Etichette collegate ai campi; una modifica che il database ignora senza errore non si annuncia più come «aggiornato».
 */
import { useId, useState, useRef } from "react";
import { useDialogFocusReturn } from "@/hooks/useDialogFocusReturn";
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
import { CATEGORIE_INTERVENTO } from "../constants";
import type { CategoriaIntervento, TipoIntervento } from "../types";

export function InterventoDialog({
  open, onClose, editing, companyId, onSaved,
}: {
  open: boolean; onClose: () => void; editing: TipoIntervento | null;
  companyId: string; onSaved: () => void;
}) {
  const idBase = useId();
  const focusReturn = useDialogFocusReturn();
  const pendingRef = useRef(false);
  const handleClose = () => { if (!pendingRef.current) onClose(); };
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [categoria, setCategoria] = useState<CategoriaIntervento>(editing?.categoria ?? "manutenzione_ordinaria");
  const [durata, setDurata] = useState(String(editing?.durata_stimata_h ?? ""));
  const [attivo, setAttivo] = useState(editing?.attivo ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (pendingRef.current) return;
    if (!nome.trim()) { toast.error("Il nome è obbligatorio"); return; }
    pendingRef.current = true;
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        nome: nome.trim(),
        categoria,
        durata_stimata_h: durata.trim() !== "" ? parseFloat(durata) : null,
        attivo,
      };
      if (editing) {
        // .select("id"): un UPDATE che il database filtra (permesso mancante) non dà errore, risponde con zero righe.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("tipi_intervento") as any)
          .update(payload).eq("id", editing.id).eq("company_id", companyId).select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Modifica non salvata: verifica i permessi e riprova.");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("tipi_intervento") as any).insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Tipo di intervento aggiornato" : "Tipo di intervento creato");
      pendingRef.current = false;
      onSaved(); onClose();
    } catch (err: unknown) {
      toast.error(testoErrore(err, "Tipo di intervento non salvato."));
    } finally {
      pendingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) handleClose(); }}>
      <DialogContent {...focusReturn} className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica tipo di intervento" : "Nuovo tipo di intervento"}</DialogTitle>
          <DialogDescription>
            I lavori che fai in manutenzione (per esempio Manutenzione ordinaria, Riparazione guasto): a ognuno si collegano i prezzi.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={saving} className="min-w-0 space-y-4">
          <div>
            <Label htmlFor={`${idBase}-nome`}>Nome *</Label>
            <Input
              id={`${idBase}-nome`}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Es. Manutenzione ordinaria"
              aria-required="true"
              className="mt-1.5 max-md:h-11"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`${idBase}-categoria`}>Categoria</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaIntervento)}>
                <SelectTrigger id={`${idBase}-categoria`} className="mt-1.5 max-md:h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIE_INTERVENTO.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`${idBase}-durata`}>Durata stimata (h)</Label>
              <Input
                id={`${idBase}-durata`}
                type="number" min="0" step="0.5"
                value={durata}
                onChange={(e) => setDurata(e.target.value)}
                placeholder="2"
                className="mt-1.5 max-md:h-11"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor={`${idBase}-attivo`}>Attivo</Label>
            <Switch id={`${idBase}-attivo`} checked={attivo} onCheckedChange={setAttivo} />
          </div>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={handleClose}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
