/**
 * ListinoManutenzione — ImpiantoDialog
 * Estratto da ListinoManutenzione.tsx (MP-IMP-001 Fase 5).
 * Etichette collegate ai campi (il lettore di schermo nomina «Nome», «Ordine», «Attivo»); una modifica che il database
 * ignora senza errore (permesso mancante) non si annuncia più come «aggiornato».
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
import { testoErrore } from "@/lib/impostazioni/testoErrore";
import { ICONE_IMPIANTO } from "../constants";
import type { TipoImpianto } from "../types";

export function ImpiantoDialog({
  open, onClose, editing, companyId, onSaved,
}: {
  open: boolean; onClose: () => void; editing: TipoImpianto | null;
  companyId: string; onSaved: () => void;
}) {
  const idBase = useId();
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
        // .select("id"): un UPDATE che il database filtra (permesso mancante) non dà errore, risponde con zero righe.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("tipi_impianto") as any)
          .update(payload).eq("id", editing.id).eq("company_id", companyId).select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Modifica non salvata: verifica i permessi e riprova.");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("tipi_impianto") as any).insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Tipo di impianto aggiornato" : "Tipo di impianto creato");
      onSaved(); onClose();
    } catch (err: unknown) {
      toast.error(testoErrore(err, "Tipo di impianto non salvato."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica tipo di impianto" : "Nuovo tipo di impianto"}</DialogTitle>
          <DialogDescription>
            Gli impianti che segui in manutenzione (per esempio Caldaia, Condizionatore): a ognuno si collegano i prezzi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor={`${idBase}-nome`}>Nome *</Label>
            <Input
              id={`${idBase}-nome`}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Es. Caldaia"
              aria-required="true"
              className="mt-1.5 max-md:h-11"
            />
          </div>
          <div>
            <Label id={`${idBase}-icona`}>Icona</Label>
            <div className="flex flex-wrap gap-2 mt-1" role="group" aria-labelledby={`${idBase}-icona`}>
              {ICONE_IMPIANTO.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcona(ic)}
                  aria-label={`Icona ${ic}`}
                  aria-pressed={icona === ic}
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
              <Label htmlFor={`${idBase}-ordine`}>Ordine</Label>
              <Input
                id={`${idBase}-ordine`}
                type="number" min="0"
                value={ordine}
                onChange={(e) => setOrdine(e.target.value)}
                placeholder="1"
                className="mt-1.5 max-md:h-11"
              />
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <Label htmlFor={`${idBase}-attivo`}>Attivo</Label>
              <Switch id={`${idBase}-attivo`} checked={attivo} onCheckedChange={setAttivo} />
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
