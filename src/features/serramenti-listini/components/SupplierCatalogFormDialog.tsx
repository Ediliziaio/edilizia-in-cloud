/**
 * SupplierCatalogFormDialog — crea/modifica fornitore serramenti.
 *
 * Modalità:
 *  - Create: initial è undefined
 *  - Edit:   initial è SupplierCatalog esistente
 *
 * Validazione lato client:
 *  - nome: richiesto (trim, min 2 char)
 *  - sconto_default: 0..1 (UI accetta %: input 0..100, convertito /100 prima del submit)
 *  - codice_interno: opzionale
 *
 * UX:
 *  - Submit disabilita il bottone + mostra Loader2
 *  - Errori toast gestiti dall'hook
 *  - Chiusura via onOpenChange; in loading non si può chiudere
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useSupplierCatalogMutations } from "../hooks/useSupplierCatalogs";
import type { SupplierCatalog } from "../types";

interface SupplierCatalogFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: SupplierCatalog | null;
  onSaved?: (supplier: SupplierCatalog) => void;
}

interface FormState {
  nome: string;
  codice_interno: string;
  /** Percentuale UI (0..100). Convertita in 0..1 prima del submit. */
  scontoPct: string;
  note: string;
  attivo: boolean;
}

const EMPTY_FORM: FormState = {
  nome: "",
  codice_interno: "",
  scontoPct: "0",
  note: "",
  attivo: true,
};

function formFromSupplier(s: SupplierCatalog): FormState {
  return {
    nome: s.nome,
    codice_interno: s.codice_interno ?? "",
    scontoPct: ((s.sconto_default ?? 0) * 100).toFixed(2).replace(/\.?0+$/, ""),
    note: s.note ?? "",
    attivo: s.attivo,
  };
}

export function SupplierCatalogFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: SupplierCatalogFormDialogProps) {
  const mutations = useSupplierCatalogMutations();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Sync form con initial (apertura/passaggio ad un altro fornitore)
  useEffect(() => {
    if (open) {
      setForm(initial ? formFromSupplier(initial) : EMPTY_FORM);
    }
  }, [open, initial]);

  const isPending = mutations.create.isPending || mutations.update.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = form.nome.trim();
    if (nome.length < 2) {
      toast.error("Il nome del fornitore deve avere almeno 2 caratteri");
      return;
    }
    const scontoNum = parseFloat(form.scontoPct.replace(",", "."));
    if (Number.isNaN(scontoNum) || scontoNum < 0 || scontoNum > 100) {
      toast.error("Lo sconto deve essere un numero tra 0 e 100");
      return;
    }
    const payload = {
      nome,
      codice_interno: form.codice_interno.trim() || null,
      sconto_default: scontoNum / 100,
      note: form.note.trim() || null,
      attivo: form.attivo,
    };
    try {
      const saved = isEdit
        ? await mutations.update.mutateAsync({ id: initial!.id, patch: payload })
        : await mutations.create.mutateAsync(payload);
      toast.success(isEdit ? "Fornitore aggiornato" : "Fornitore creato");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        isEdit ? "Errore aggiornamento fornitore" : "Errore creazione fornitore",
        { description: err instanceof Error ? err.message : undefined },
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!isPending) onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Modifica fornitore" : "Nuovo fornitore"}
            </DialogTitle>
            <DialogDescription>
              Configura un fornitore infissi (es. Veka, Finstral, Schüco). Lo
              sconto di default verrà applicato ai prezzi di listino.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="nome">
                Nome fornitore <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Es. Veka, Finstral, Schüco"
                autoFocus
                required
                minLength={2}
                maxLength={120}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="codice_interno">Codice interno (opzionale)</Label>
              <Input
                id="codice_interno"
                value={form.codice_interno}
                onChange={(e) =>
                  setForm({ ...form, codice_interno: e.target.value })
                }
                placeholder="Es. VEKA-01"
                maxLength={60}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sconto">Sconto di default (%)</Label>
              <Input
                id="sconto"
                type="number"
                min={0}
                max={100}
                step="0.01"
                inputMode="decimal"
                value={form.scontoPct}
                onChange={(e) => setForm({ ...form, scontoPct: e.target.value })}
                placeholder="Es. 55 (= −55% sul listino)"
              />
              <p className="text-xs text-muted-foreground">
                Sconto applicato ai prezzi scritti sul listino fornitore. Valore
                percentuale 0–100 (es. 55 = −55%, l'azienda paga il 45%).
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="note">Note (opzionale)</Label>
              <Textarea
                id="note"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Contatti, condizioni di pagamento, lead time..."
                rows={3}
                maxLength={2000}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="attivo" className="font-medium">
                  Fornitore attivo
                </Label>
                <p className="text-xs text-muted-foreground">
                  Se disattivato, non apparirà nel wizard preventivo.
                </p>
              </div>
              <Switch
                id="attivo"
                checked={form.attivo}
                onCheckedChange={(c) => setForm({ ...form, attivo: c })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              {isEdit ? "Salva modifiche" : "Crea fornitore"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
