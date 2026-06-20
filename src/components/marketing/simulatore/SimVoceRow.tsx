/**
 * SimVoceRow — una riga editabile della griglia voci del simulatore.
 *
 * Input inline per: descrizione, quantità, UM (select), costo unitario,
 * ricarico %, IVA (select 4/10/22), prezzo unitario (editabile, override).
 * Il TOTALE è read-only = `calcolaVoce(voce).imponibile_ricavo` (formatCurrency).
 *
 * Regola prezzo↔costo (semplice e robusta): quando l'utente modifica costo o
 * ricarico, ricalcoliamo il prezzo da `round2(costo × (1 + ricarico/100))`.
 * Quando l'utente modifica direttamente il prezzo, lo lasciamo invariato (è un
 * override esplicito). Il ricarico NON viene ricalcolato dal prezzo: resta un
 * input indipendente, così il modello è prevedibile.
 *
 * Props: `voce`, `onChange(patch)`, `onRemove`. Tutte le scritture passano per
 * `onChange` → l'editor ricalcola i KPI e autosalva.
 */
import { Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/formatters";
import { calcolaVoce, round2 } from "@/lib/simulatore/calcoli";
import type { VoceSim, FaseSim, AliquotaIva, ScenariConfig } from "@/lib/simulatore/tipi";

/** Valore sentinella del Select "Fase" per "nessuna fase" (fase_id = null). */
const NESSUNA_FASE = "__none__";

/** Unità di misura — stessi valori usati in `tariffe_aziendali` (UM_FATTURAZIONE). */
const SIM_UM_VALUES = ["pz", "mq", "ml", "mc", "h", "gg", "a_corpo", "km"] as const;

/** Aliquote IVA selezionabili a livello di riga (Tappa A). */
const SIM_VAT_RATES: AliquotaIva[] = [4, 10, 22];

/** Numero → stringa per gli input controllati (vuoto se 0 e non in focus? no: mostriamo 0). */
function numToStr(n: number): string {
  return Number.isFinite(n) ? String(n) : "0";
}

/** Parsa un input numerico tollerando virgola decimale; fallback 0, mai NaN. */
function parseNum(raw: string): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Controlli di riordino (frecce ↑↓), opzionali: omessi → niente frecce. */
interface ReorderControls {
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

interface SimVoceRowProps {
  voce: VoceSim;
  onChange: (patch: Partial<VoceSim>) => void;
  onRemove: () => void;
  reorder?: ReorderControls;
  /** Fasi disponibili per l'assegnazione della voce; omesso → niente colonna Fase. */
  fasi?: FaseSim[];
  /** Modalità IVA corrente: in 'mista' compaiono i controlli "bene significativo". */
  ivaMode?: ScenariConfig["iva_mode"];
}

export function SimVoceRow({ voce, onChange, onRemove, reorder, fasi, ivaMode = "singola" }: SimVoceRowProps) {
  const { imponibile_ricavo } = calcolaVoce(voce);

  // Quando cambia il costo: ricalcola il prezzo da costo×(1+ricarico/100).
  const handleCosto = (raw: string) => {
    const costo_unitario = parseNum(raw);
    onChange({
      costo_unitario,
      prezzo_unitario: round2(costo_unitario * (1 + voce.ricarico_pct / 100)),
    });
  };

  // Quando cambia il ricarico: ricalcola il prezzo da costo×(1+ricarico/100).
  const handleRicarico = (raw: string) => {
    const ricarico_pct = parseNum(raw);
    onChange({
      ricarico_pct,
      prezzo_unitario: round2(voce.costo_unitario * (1 + ricarico_pct / 100)),
    });
  };

  // Override esplicito del prezzo: non tocca costo/ricarico.
  const handlePrezzo = (raw: string) => {
    onChange({ prezzo_unitario: parseNum(raw) });
  };

  return (
    <TableRow className="group transition-colors hover:bg-muted/30">
      {/* Descrizione (+ controlli bene significativo in IVA mista) */}
      <TableCell className="min-w-[200px] align-top">
        <Input
          value={voce.descrizione}
          onChange={(e) => onChange({ descrizione: e.target.value })}
          placeholder="Descrizione voce"
          className="h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input focus-visible:border-input"
        />
        {ivaMode === "mista" ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 px-2">
            <Label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
              <Checkbox
                checked={voce.bene_significativo}
                onCheckedChange={(c) =>
                  onChange(
                    c === true
                      ? { bene_significativo: true }
                      : { bene_significativo: false, valore_posa_associata: null },
                  )
                }
                className="h-3.5 w-3.5"
                aria-label="Bene significativo"
              />
              Bene significativo
            </Label>
            {voce.bene_significativo ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Posa €</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={numToStr(voce.valore_posa_associata ?? 0)}
                  onChange={(e) =>
                    onChange({ valore_posa_associata: parseNum(e.target.value) })
                  }
                  className="h-7 w-24 px-2 text-right tabular-nums"
                  aria-label="Valore posa"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </TableCell>

      {/* Fase (opzionale) */}
      {fasi ? (
        <TableCell className="w-[140px]">
          <Select
            value={voce.fase_id ?? NESSUNA_FASE}
            onValueChange={(v) =>
              onChange({ fase_id: v === NESSUNA_FASE ? null : v })
            }
          >
            <SelectTrigger className="h-8 px-2">
              <SelectValue placeholder="— nessuna —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NESSUNA_FASE}>— nessuna —</SelectItem>
              {fasi.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome || "Fase senza nome"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
      ) : null}

      {/* Quantità */}
      <TableCell className="w-[88px]">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={numToStr(voce.quantita)}
          onChange={(e) => onChange({ quantita: parseNum(e.target.value) })}
          className="h-8 px-2 text-right tabular-nums"
        />
      </TableCell>

      {/* UM */}
      <TableCell className="w-[84px]">
        <Select value={voce.unita} onValueChange={(v) => onChange({ unita: v })}>
          <SelectTrigger className="h-8 px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIM_UM_VALUES.map((u) => (
              <SelectItem key={u} value={u}>
                {u === "a_corpo" ? "a corpo" : u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      {/* Costo unitario */}
      <TableCell className="w-[112px]">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={numToStr(voce.costo_unitario)}
          onChange={(e) => handleCosto(e.target.value)}
          className="h-8 px-2 text-right tabular-nums"
        />
      </TableCell>

      {/* Ricarico % */}
      <TableCell className="w-[88px]">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          value={numToStr(voce.ricarico_pct)}
          onChange={(e) => handleRicarico(e.target.value)}
          className="h-8 px-2 text-right tabular-nums"
        />
      </TableCell>

      {/* IVA */}
      <TableCell className="w-[76px]">
        <Select
          value={String(voce.vat_rate)}
          onValueChange={(v) => onChange({ vat_rate: Number(v) as AliquotaIva })}
        >
          <SelectTrigger className="h-8 px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIM_VAT_RATES.map((r) => (
              <SelectItem key={r} value={String(r)}>
                {r}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      {/* Prezzo unitario (override) */}
      <TableCell className="w-[112px]">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={numToStr(voce.prezzo_unitario)}
          onChange={(e) => handlePrezzo(e.target.value)}
          className="h-8 px-2 text-right font-medium tabular-nums"
        />
      </TableCell>

      {/* Totale (read-only) — colonna in risalto */}
      <TableCell className="w-[120px] text-right font-bold tabular-nums text-foreground">
        {formatCurrency(imponibile_ricavo)}
      </TableCell>

      {/* Azioni: riordino (opzionale) + elimina */}
      <TableCell className="w-[88px]">
        <div className="flex items-center justify-end gap-0.5">
          {reorder ? (
            <div className="flex flex-col">
              <button
                type="button"
                onClick={reorder.onMoveUp}
                disabled={reorder.isFirst}
                className="text-muted-foreground transition hover:text-foreground disabled:opacity-30"
                aria-label="Sposta su"
                title="Sposta su"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={reorder.onMoveDown}
                disabled={reorder.isLast}
                className="text-muted-foreground transition hover:text-foreground disabled:opacity-30"
                aria-label="Sposta giù"
                title="Sposta giù"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-8 w-8 text-muted-foreground opacity-60 transition hover:text-destructive group-hover:opacity-100"
            aria-label="Elimina riga"
            title="Elimina riga"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
