/**
 * AxisPresetsDialog — selettore di preset di assi per bootstrap rapido.
 *
 * UX target: da "15-20 click per configurare 4 assi" a "3 click".
 *
 *  1. Apri dialog (bottone principale "Applica preset")
 *  2. Seleziona uno o più pack / singoli assi (multi-select con checkbox)
 *  3. Click "Applica": bulk create assi + valori (una transazione client-side)
 *
 * Il dialog distingue chiaramente:
 *  - ASSI GIÀ PRESENTI nella famiglia → disabilitati (tooltip "già configurato")
 *  - ASSI NUOVI → selezionabili
 *
 * Non esegue side-effects lui stesso: restituisce la selezione al parent che
 * decide come persisterla (typicamente via useFamilyMutations.bulkInsertAxes).
 */

import { useMemo, useState } from "react";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ALL_PRESET_AXES,
  PRESET_PACKS,
  type PresetAxis,
} from "@/lib/axisPresets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Codici degli assi già configurati nella famiglia (per disabilitare). */
  existingCodici: string[];
  /** Chiamata all'applicazione: riceve gli assi scelti da persistere. */
  onApply: (axes: PresetAxis[]) => void | Promise<void>;
  saving?: boolean;
}

export function AxisPresetsDialog({
  open,
  onOpenChange,
  existingCodici,
  onApply,
  saving = false,
}: Props) {
  // Set di codici asse selezionati
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const existingSet = useMemo(() => new Set(existingCodici), [existingCodici]);

  // Un asse è "disponibile" se il suo codice non è già in famiglia.
  const isAvailable = (ax: PresetAxis) => !existingSet.has(ax.codice);

  const toggleAxis = (ax: PresetAxis) => {
    if (!isAvailable(ax)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ax.id)) next.delete(ax.id);
      else next.add(ax.id);
      return next;
    });
  };

  const applyPack = (assiIds: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of assiIds) {
        const ax = ALL_PRESET_AXES.find((a) => a.id === id);
        if (ax && isAvailable(ax)) next.add(id);
      }
      return next;
    });
  };

  const clearAll = () => setSelected(new Set());

  const selectedAxes = useMemo(
    () => ALL_PRESET_AXES.filter((ax) => selected.has(ax.id)),
    [selected],
  );

  // Conteggi per il recap nel bottone di conferma
  const totaleValori = selectedAxes.reduce(
    (acc, ax) => acc + ax.values.length,
    0,
  );

  const handleApply = async () => {
    if (selectedAxes.length === 0) return;
    await onApply(selectedAxes);
    // Reset selezione solo al successo (il parent chiude il dialog via saving→false
    // + onOpenChange(false)). Se il parent vuole conservare la selezione può non
    // chiudere.
    setSelected(new Set());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return;
        onOpenChange(o);
        if (!o) setSelected(new Set());
      }}
    >
      <DialogContent className="w-[96vw] sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sparkles
              className="h-5 w-5 text-primary"
              aria-hidden="true"
            />
            Applica preset di assi
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Aggiungi in un colpo solo le varianti tipiche del mercato serramenti
            (colore, vetro, apertura, ferramenta, …). Tutti i valori e le
            maggiorazioni sono modificabili dopo l'applicazione.
          </DialogDescription>
        </DialogHeader>

        {/* ── Pack rapidi ────────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h4 className="text-sm font-medium">Pack rapidi</h4>
          <p className="text-xs text-muted-foreground">
            Un click aggiunge alla selezione tutti gli assi del pack (gli
            eventuali già presenti vengono saltati).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PRESET_PACKS.map((pack) => {
              const packAvailable = pack.assiIds.some((id) => {
                const ax = ALL_PRESET_AXES.find((a) => a.id === id);
                return ax && isAvailable(ax);
              });
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => applyPack(pack.assiIds)}
                  disabled={!packAvailable || saving}
                  className="text-left border rounded-lg p-3 hover:border-primary hover:bg-primary/5 transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex items-center gap-2 font-medium text-sm mb-1">
                    <span aria-hidden="true">{pack.icona}</span>
                    {pack.nome}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {pack.descrizione}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {pack.assiIds.map((id) => {
                      const ax = ALL_PRESET_AXES.find((a) => a.id === id);
                      if (!ax) return null;
                      const already = existingSet.has(ax.codice);
                      return (
                        <Badge
                          key={id}
                          variant={already ? "outline" : "secondary"}
                          className="text-[10px]"
                        >
                          {ax.icona} {ax.nome}
                          {already ? " ✓" : ""}
                        </Badge>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Selezione singola ──────────────────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Singoli assi</h4>
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={clearAll}
                disabled={saving}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Deseleziona tutto
              </button>
            ) : null}
          </div>
          <ul className="space-y-1.5">
            {ALL_PRESET_AXES.map((ax) => {
              const disabled = !isAvailable(ax) || saving;
              const active = selected.has(ax.id);
              return (
                <li key={ax.id}>
                  <label
                    htmlFor={`preset-ax-${ax.id}`}
                    className={`flex items-start gap-2 p-2.5 rounded-md border transition cursor-pointer ${
                      disabled
                        ? "opacity-50 cursor-not-allowed bg-muted/20"
                        : active
                          ? "border-primary bg-primary/5"
                          : "hover:border-foreground/30"
                    }`}
                  >
                    <Checkbox
                      id={`preset-ax-${ax.id}`}
                      checked={active}
                      disabled={disabled}
                      onCheckedChange={() => toggleAxis(ax)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                        <span aria-hidden="true" className="text-base">
                          {ax.icona}
                        </span>
                        <span className="font-medium text-sm">{ax.nome}</span>
                        {ax.obbligatorio ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px]"
                          >
                            obbligatorio
                          </Badge>
                        ) : null}
                        {!isAvailable(ax) ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] gap-0.5"
                          >
                            <Check className="h-3 w-3" aria-hidden="true" />
                            già presente
                          </Badge>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          ({ax.values.length} valori)
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {ax.sintesi}
                      </p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-10 w-full sm:w-auto"
          >
            Annulla
          </Button>
          <Button
            onClick={handleApply}
            disabled={selected.size === 0 || saving}
            className="h-10 w-full sm:w-auto"
          >
            {saving ? (
              <>
                <Loader2
                  className="h-4 w-4 mr-2 animate-spin"
                  aria-hidden="true"
                />
                Creazione in corso…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
                Applica {selected.size > 0 ? selected.size : ""} ass
                {selected.size === 1 ? "e" : "i"}
                {totaleValori > 0 ? ` · ${totaleValori} valori` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
