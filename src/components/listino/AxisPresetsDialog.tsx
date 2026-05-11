/**
 * AxisPresetsDialog — selettore di preset di assi per bootstrap rapido.
 *
 * UX target: da "15-20 click per configurare 4 assi" a "3 click".
 *
 *  1. Apri dialog (bottone principale "Applica preset")
 *  2. Seleziona uno o più pack / singoli assi (multi-select con checkbox)
 *  3. Click "Applica": bulk create assi + valori (una transazione client-side)
 *
 * Organizzazione:
 *  - Tab per categoria (Serramenti / Porte / Oscuranti) per non affollare
 *    la UI quando aggiungiamo nuovi ambiti.
 *  - Ogni tab mostra i suoi pack + la lista degli assi singoli non-hidden.
 *  - Gli assi "hidden" (es. wasistas_colore) non compaiono nella sezione
 *    "Singoli assi" ma sono visibili nei badge del pack che li usa.
 *
 * Il dialog distingue chiaramente:
 *  - ASSI GIÀ PRESENTI nella famiglia (per codice) → disabilitati
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ALL_PRESET_AXES,
  PRESET_CATEGORIE,
  PRESET_PACKS,
  PUBLIC_PRESET_AXES,
  type PresetAxis,
  type PresetCategoria,
} from "@/lib/axisPresets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Codici degli assi già configurati nella famiglia (per disabilitare). */
  existingCodici: string[];
  /** Chiamata all'applicazione: riceve gli assi scelti da persistere. */
  onApply: (axes: PresetAxis[]) => void | Promise<void>;
  saving?: boolean;
  /**
   * Categoria iniziale da aprire. Il parent (FamilyEditor) può suggerire
   * quella più coerente con la famiglia corrente in base alla categoria DB
   * (serramento/porta/oscurante).
   */
  defaultCategoria?: PresetCategoria;
}

export function AxisPresetsDialog({
  open,
  onOpenChange,
  existingCodici,
  onApply,
  saving = false,
  defaultCategoria = "serramenti",
}: Props) {
  // Set di codici asse selezionati (per id asse, non codice DB)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoria, setCategoria] =
    useState<PresetCategoria>(defaultCategoria);

  const existingSet = useMemo(() => new Set(existingCodici), [existingCodici]);

  // Un asse è "disponibile" se il suo CODICE DB non è già in famiglia.
  // Anche se due preset hanno lo stesso codice (es. colore + wasistas_colore),
  // ne può essere applicato uno solo per famiglia.
  const isAvailable = (ax: PresetAxis) => !existingSet.has(ax.codice);

  // Tra i selezionati, anche i conflitti INTERNI al dialog (stesso codice):
  // se l'utente seleziona "colore" e "wasistas_colore" insieme, mostriamo
  // warning perché entrambi userebbero la stessa slot di codice.
  const selectedCodici = useMemo(() => {
    const map = new Map<string, number>();
    for (const id of selected) {
      const ax = ALL_PRESET_AXES.find((a) => a.id === id);
      if (!ax) continue;
      map.set(ax.codice, (map.get(ax.codice) ?? 0) + 1);
    }
    return map;
  }, [selected]);
  const duplicatedCodici = useMemo(() => {
    const dup: string[] = [];
    for (const [codice, count] of selectedCodici.entries()) {
      if (count > 1) dup.push(codice);
    }
    return dup;
  }, [selectedCodici]);

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
      // Prima deseleziono eventuali preset "concorrenti" sullo stesso codice
      // per lasciare spazio al pack (es. se "colore" generico è selezionato
      // e applico pack Wasistas, tolgo "colore" e metto "wasistas_colore").
      const packCodici = new Set<string>();
      for (const id of assiIds) {
        const ax = ALL_PRESET_AXES.find((a) => a.id === id);
        if (ax) packCodici.add(ax.codice);
      }
      for (const id of Array.from(next)) {
        const ax = ALL_PRESET_AXES.find((a) => a.id === id);
        if (ax && packCodici.has(ax.codice)) next.delete(id);
      }
      // Ora aggiungo gli assi del pack (solo quelli disponibili).
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
    if (duplicatedCodici.length > 0) return; // hard-block sui conflitti
    await onApply(selectedAxes);
    setSelected(new Set());
  };

  // Pack + assi pubblici della categoria corrente
  const packsCategoria = useMemo(
    () => PRESET_PACKS.filter((p) => p.categoria === categoria),
    [categoria],
  );
  const axesCategoria = useMemo(() => {
    // Gli assi pubblici sono taggati implicitamente via i pack che li usano.
    // Per semplicità: un asse appartiene a una categoria se è referenziato da
    // almeno un pack di quella categoria. Se referenziato da più categorie
    // (raro: es. "colore" generico) compare in tutte.
    const ids = new Set<string>();
    for (const p of PRESET_PACKS.filter((pp) => pp.categoria === categoria)) {
      for (const id of p.assiIds) ids.add(id);
    }
    return PUBLIC_PRESET_AXES.filter((ax) => ids.has(ax.id));
  }, [categoria]);

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
            Applica preset di variabili
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Bootstrap rapido delle dimensioni di variazione della famiglia.
            Scegli un pack preconfezionato (un click) o seleziona singole variabili.
            Tutti i valori e le maggiorazioni sono modificabili dopo
            l'applicazione.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={categoria}
          onValueChange={(v) => setCategoria(v as PresetCategoria)}
          className="w-full"
        >
          <TabsList className="grid grid-cols-3 w-full h-auto">
            {PRESET_CATEGORIE.map((cat) => (
              <TabsTrigger
                key={cat.id}
                value={cat.id}
                className="text-xs sm:text-sm py-2 px-1 h-auto"
              >
                <span aria-hidden="true" className="mr-1">
                  {cat.icona}
                </span>
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {PRESET_CATEGORIE.map((cat) => (
            <TabsContent
              key={cat.id}
              value={cat.id}
              className="space-y-4 mt-3"
            >
              <p className="text-xs text-muted-foreground">
                {cat.descrizione}
              </p>

              {/* Pack rapidi della categoria */}
              <section className="space-y-2">
                <h4 className="text-sm font-medium">Pack rapidi</h4>
                <p className="text-xs text-muted-foreground">
                  Un click aggiunge tutte le variabili del pack (le eventuali già
                  presenti vengono saltati).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PRESET_PACKS.filter((p) => p.categoria === cat.id).map(
                    (pack) => {
                      const packAvailable = pack.assiIds.some((id) => {
                        const ax = ALL_PRESET_AXES.find((a) => a.id === id);
                        return ax && isAvailable(ax);
                      });
                      const totValuesInPack = pack.assiIds.reduce(
                        (acc, id) => {
                          const ax = ALL_PRESET_AXES.find((a) => a.id === id);
                          return acc + (ax?.values.length ?? 0);
                        },
                        0,
                      );
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
                            <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                              {pack.assiIds.length} variabili · {totValuesInPack}{" "}
                              valori
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            {pack.descrizione}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {pack.assiIds.map((id) => {
                              const ax = ALL_PRESET_AXES.find(
                                (a) => a.id === id,
                              );
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
                    },
                  )}
                  {packsCategoria.length === 0 ? (
                    <p className="text-xs text-muted-foreground col-span-full">
                      Nessun pack disponibile per questa categoria.
                    </p>
                  ) : null}
                </div>
              </section>

              {/* Selezione singola degli assi non-hidden */}
              {axesCategoria.length > 0 ? (
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Singole variabili</h4>
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
                    {axesCategoria.map((ax) => {
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
                                <span
                                  aria-hidden="true"
                                  className="text-base"
                                >
                                  {ax.icona}
                                </span>
                                <span className="font-medium text-sm">
                                  {ax.nome}
                                </span>
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
                                    <Check
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
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
              ) : null}
            </TabsContent>
          ))}
        </Tabs>

        {duplicatedCodici.length > 0 ? (
          <div
            className="rounded-md border border-destructive bg-destructive/10 p-2 text-xs text-destructive"
            role="alert"
          >
            <strong>Conflitto codice:</strong> hai selezionato più preset con
            lo stesso codice DB ({duplicatedCodici.join(", ")}). Deseleziona
            quelli in sovrapposizione prima di applicare.
          </div>
        ) : null}

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
            disabled={
              selected.size === 0 || saving || duplicatedCodici.length > 0
            }
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
                <Sparkles
                  className="h-4 w-4 mr-2"
                  aria-hidden="true"
                />
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
