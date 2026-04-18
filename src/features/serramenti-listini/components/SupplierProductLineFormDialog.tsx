/**
 * SupplierProductLineFormDialog — crea/modifica linea prodotto fornitore.
 *
 * Validazione:
 *  - nome richiesto
 *  - materiale ∈ enum (coincide con CHECK DB)
 *  - ricarico_default: percentuale 0..N (UI mostra %, convertito /100)
 *  - sconto_override: opzionale 0..100 (null se vuoto)
 *  - manodopera_tariffa_id: opzionale (FK tariffe_aziendali.id)
 *
 * Note: il selettore manodopera è presentato come input libero UUID perché la
 * lista tariffe è gestita dal modulo tariffe_aziendali. In futuro (STEP 6)
 * potremmo aggiungere un picker dedicato.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSupplierProductLineMutations } from "../hooks/useSupplierProductLines";
import type { MaterialeProfilo, SupplierProductLine } from "../types";

const MATERIALI: Array<{ value: MaterialeProfilo; label: string }> = [
  { value: "pvc", label: "PVC" },
  { value: "alluminio", label: "Alluminio" },
  { value: "legno", label: "Legno" },
  { value: "legno_alluminio", label: "Legno-alluminio" },
  { value: "acciaio", label: "Acciaio" },
];

interface SupplierProductLineFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fornitore padre (fisso in creazione, ereditato in edit). */
  supplierCatalogId: string;
  initial?: SupplierProductLine | null;
  onSaved?: (line: SupplierProductLine) => void;
}

interface FormState {
  nome: string;
  materiale: MaterialeProfilo;
  ricaricoPct: string;
  scontoOverridePct: string; // vuoto = null
  manodoperaTariffaId: string; // vuoto = null
  note: string;
  attivo: boolean;
}

const EMPTY_FORM: FormState = {
  nome: "",
  materiale: "pvc",
  ricaricoPct: "0",
  scontoOverridePct: "",
  manodoperaTariffaId: "",
  note: "",
  attivo: true,
};

function formFromLine(l: SupplierProductLine): FormState {
  const trimTrailingZero = (n: number) =>
    n.toFixed(2).replace(/\.?0+$/, "") || "0";
  return {
    nome: l.nome,
    materiale: l.materiale,
    ricaricoPct: trimTrailingZero((l.ricarico_default ?? 0) * 100),
    scontoOverridePct:
      l.sconto_override == null
        ? ""
        : trimTrailingZero((l.sconto_override ?? 0) * 100),
    manodoperaTariffaId: l.manodopera_tariffa_id ?? "",
    note: l.note ?? "",
    attivo: l.attivo,
  };
}

export function SupplierProductLineFormDialog({
  open,
  onOpenChange,
  supplierCatalogId,
  initial,
  onSaved,
}: SupplierProductLineFormDialogProps) {
  const mutations = useSupplierProductLineMutations();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setForm(initial ? formFromLine(initial) : EMPTY_FORM);
    }
  }, [open, initial]);

  const isPending = mutations.create.isPending || mutations.update.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = form.nome.trim();
    if (nome.length < 2) {
      toast.error("Il nome della linea deve avere almeno 2 caratteri");
      return;
    }
    const ricarico = parseFloat(form.ricaricoPct.replace(",", "."));
    if (Number.isNaN(ricarico) || ricarico < 0) {
      toast.error("Il ricarico deve essere un numero ≥ 0");
      return;
    }
    let scontoOverride: number | null = null;
    if (form.scontoOverridePct.trim() !== "") {
      const n = parseFloat(form.scontoOverridePct.replace(",", "."));
      if (Number.isNaN(n) || n < 0 || n > 100) {
        toast.error("Lo sconto override deve essere 0–100 o vuoto");
        return;
      }
      scontoOverride = n / 100;
    }
    const manodoperaId = form.manodoperaTariffaId.trim() || null;
    // Validazione formato UUID minimale (non blocca se l'utente sa quel che fa)
    if (manodoperaId && !/^[0-9a-f-]{32,}$/i.test(manodoperaId)) {
      toast.error("ID tariffa manodopera non valido (atteso UUID)");
      return;
    }

    const payload = {
      supplier_catalog_id: supplierCatalogId,
      nome,
      materiale: form.materiale,
      ricarico_default: ricarico / 100,
      sconto_override: scontoOverride,
      manodopera_tariffa_id: manodoperaId,
      note: form.note.trim() || null,
      attivo: form.attivo,
    };

    try {
      const saved = isEdit
        ? await mutations.update.mutateAsync({
            id: initial!.id,
            supplierCatalogId,
            patch: payload,
          })
        : await mutations.create.mutateAsync(payload);
      toast.success(
        isEdit ? "Linea prodotto aggiornata" : "Linea prodotto creata",
      );
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        isEdit ? "Errore aggiornamento linea" : "Errore creazione linea",
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
              {isEdit ? "Modifica linea prodotto" : "Nuova linea prodotto"}
            </DialogTitle>
            <DialogDescription>
              Una linea è un profilo del fornitore (es. Veka 70, Veka 76, Veka
              82). Ricarico e sconto sono applicati al prezzo di listino.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="nome">
                Nome linea <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Es. Veka 70, Finstral ClassicLine"
                autoFocus
                required
                minLength={2}
                maxLength={120}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="materiale">Materiale profilo</Label>
              <Select
                value={form.materiale}
                onValueChange={(v) =>
                  setForm({ ...form, materiale: v as MaterialeProfilo })
                }
              >
                <SelectTrigger id="materiale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERIALI.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ricarico">Ricarico azienda (%)</Label>
              <Input
                id="ricarico"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={form.ricaricoPct}
                onChange={(e) =>
                  setForm({ ...form, ricaricoPct: e.target.value })
                }
                placeholder="Es. 100 (= raddoppia il costo)"
              />
              <p className="text-xs text-muted-foreground">
                Ricarico applicato al costo d'acquisto. Es. 100 = vendi a 2×
                costo. 50 = vendi a 1.5× costo.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sconto_override">
                Sconto override fornitore (%)
              </Label>
              <Input
                id="sconto_override"
                type="number"
                min={0}
                max={100}
                step="0.01"
                inputMode="decimal"
                value={form.scontoOverridePct}
                onChange={(e) =>
                  setForm({ ...form, scontoOverridePct: e.target.value })
                }
                placeholder="Lascia vuoto per usare lo sconto del fornitore"
              />
              <p className="text-xs text-muted-foreground">
                Solo per questa linea. Lascia vuoto per usare lo sconto di
                default del fornitore.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="manodopera">Manodopera — ID tariffa (opzionale)</Label>
              <Input
                id="manodopera"
                value={form.manodoperaTariffaId}
                onChange={(e) =>
                  setForm({ ...form, manodoperaTariffaId: e.target.value })
                }
                placeholder="UUID tariffa (da tariffe_aziendali)"
              />
              <p className="text-xs text-muted-foreground">
                Lega una tariffa manodopera di default a questa linea.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="note">Note (opzionale)</Label>
              <Textarea
                id="note"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Caratteristiche tecniche, trasmittanza, certificazioni..."
                rows={3}
                maxLength={2000}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="attivo" className="font-medium">
                  Linea attiva
                </Label>
                <p className="text-xs text-muted-foreground">
                  Se disattivata, non apparirà nel wizard preventivo.
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
              {isEdit ? "Salva modifiche" : "Crea linea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
