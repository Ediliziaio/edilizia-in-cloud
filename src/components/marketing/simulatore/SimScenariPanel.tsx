/**
 * SimScenariPanel — pannello "scenari di offerta" dell'editor simulazione.
 *
 * Sezione IVA (Task 12):
 *   - Segmented `iva_mode` "Singola" | "Mista".
 *   - In SINGOLA: select aliquota (4/10/22) → `scenari.iva_rate_singola`.
 *   - 3 colonne di confronto (4/10/22) col prezzo cliente da
 *     `risultato.confronto_iva`; la colonna dell'aliquota attiva (solo in
 *     singola) è evidenziata col bordo info.
 *   - In MISTA: tabellina riepilogo per aliquota (imponibile → imposta) da
 *     `risultato.riepilogo_iva` + totale IVA.
 *
 * Tutte le modifiche passano per `onChange(scenari)` → l'editor ricalcola e
 * autosalva. Numeri sempre arrotondati via `formatCurrency`.
 */
import { Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { ScenariConfig, SimulazioneRisultato } from "@/lib/simulatore/tipi";

interface SimScenariPanelProps {
  scenari: ScenariConfig;
  risultato: SimulazioneRisultato;
  onChange: (scenari: ScenariConfig) => void;
  /** Notifica la rata mensile calcolata (Task 13); null se nessun finanziamento valido. */
  onRataChange: (rata: number | null) => void;
}

const ALIQUOTE: Array<4 | 10 | 22> = [4, 10, 22];

/** "10%" — etichetta breve aliquota. */
function pctLabel(n: number): string {
  return `${n.toLocaleString("it-IT")}%`;
}

export function SimScenariPanel({
  scenari,
  risultato,
  onChange,
  onRataChange: _onRataChange,
}: SimScenariPanelProps) {
  const patch = (p: Partial<ScenariConfig>) => onChange({ ...scenari, ...p });

  // Prezzo cliente per aliquota di confronto (lookup su confronto_iva).
  const prezzoPerAliquota = new Map(
    risultato.confronto_iva.map((c) => [c.aliquota, c.prezzo_cliente]),
  );

  return (
    <Card>
      <CardContent className="space-y-5 p-4">
        {/* ── Sezione IVA ─────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-muted-foreground">IVA</h3>
            </div>
            <ToggleGroup
              type="single"
              size="sm"
              value={scenari.iva_mode}
              onValueChange={(v) => {
                if (v === "singola" || v === "mista") patch({ iva_mode: v });
              }}
              className="rounded-lg border bg-secondary/40 p-0.5"
            >
              <ToggleGroupItem value="singola" className="h-7 px-3 text-xs data-[state=on]:bg-background">
                Singola
              </ToggleGroupItem>
              <ToggleGroupItem value="mista" className="h-7 px-3 text-xs data-[state=on]:bg-background">
                Mista 10/22
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* In singola: select aliquota unica. */}
          {scenari.iva_mode === "singola" ? (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Aliquota</Label>
              <Select
                value={String(scenari.iva_rate_singola)}
                onValueChange={(v) =>
                  patch({ iva_rate_singola: Number(v) as 4 | 10 | 22 })
                }
              >
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALIQUOTE.map((a) => (
                    <SelectItem key={a} value={String(a)}>
                      {pctLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              IVA per riga (10% beni significativi e posa, 22% sull&apos;eccedenza). Il
              prezzo cliente somma le aliquote effettive delle voci.
            </p>
          )}

          {/* Confronto prezzo cliente per le 3 aliquote. */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Confronto prezzo cliente
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ALIQUOTE.map((a) => {
                // Evidenzia solo in singola, sulla colonna dell'aliquota attiva.
                const attiva =
                  scenari.iva_mode === "singola" && scenari.iva_rate_singola === a;
                const prezzo = prezzoPerAliquota.get(a);
                return (
                  <div
                    key={a}
                    className={cn(
                      "rounded-lg border bg-card p-2.5 text-center transition-colors",
                      attiva
                        ? "border-sky-400 ring-1 ring-sky-400/40 dark:border-sky-500"
                        : "border-border",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[11px] font-medium",
                        attiva ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground",
                      )}
                    >
                      IVA {pctLabel(a)}
                    </p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums">
                      {prezzo != null ? formatCurrency(prezzo) : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* In mista: riepilogo per aliquota dalle voci. */}
          {scenari.iva_mode === "mista" && risultato.riepilogo_iva.length > 0 ? (
            <div className="rounded-lg border bg-secondary/30 p-3">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Riepilogo IVA mista
              </p>
              <div className="space-y-1 text-sm">
                {[...risultato.riepilogo_iva]
                  .sort((a, b) => a.aliquota - b.aliquota)
                  .map((r) => (
                    <div
                      key={r.aliquota}
                      className="flex items-center justify-between gap-3 tabular-nums"
                    >
                      <span className="text-muted-foreground">
                        Imponibile {pctLabel(r.aliquota)}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          {formatCurrency(r.imponibile)}
                        </span>
                        <span className="w-24 text-right font-medium">
                          {formatCurrency(r.imposta)}
                        </span>
                      </span>
                    </div>
                  ))}
                <div className="mt-1 flex items-center justify-between border-t pt-1.5 font-semibold tabular-nums">
                  <span>Totale IVA</span>
                  <span>{formatCurrency(risultato.iva_totale)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}
