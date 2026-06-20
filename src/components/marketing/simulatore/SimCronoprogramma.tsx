/**
 * SimCronoprogramma — cronoprogramma fasi della simulazione (gantt semplice).
 *
 * Due parti:
 *   1. Lista fasi editabili: nome, durata (settimane), inizio (offset settimane),
 *      giorni-uomo. "Aggiungi fase" accoda una `FaseSim` (crypto.randomUUID,
 *      `ordine` in coda); ogni fase ha un pulsante elimina.
 *   2. Barre proporzionali tipo gantt: per ogni fase una barra con larghezza
 *      ∝ durata e margine-sinistra ∝ inizio_offset, su una scala = durata totale
 *      del progetto. Etichetta "N sett · M gg-uomo" + costo manodopera (da
 *      `risultatoFasi.perFase`).
 *
 * Tutte le modifiche passano per `onChangeFasi(fasi)` → l'editor ricalcola e
 * autosalva. Numeri arrotondati in visualizzazione.
 */
import { CalendarRange, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { FaseCalcolata } from "@/lib/simulatore/calcoli";
import type { FaseSim, VoceSim } from "@/lib/simulatore/tipi";

interface SimCronoprogrammaProps {
  fasi: FaseSim[];
  voci: VoceSim[];
  onChangeFasi: (fasi: FaseSim[]) => void;
  risultatoFasi: { perFase: FaseCalcolata[]; durata_settimane: number };
}

/** Prossimo `ordine` libero (coda): max(ordine)+1, o 0 se vuoto. */
function nextOrdine(fasi: FaseSim[]): number {
  return fasi.length ? Math.max(...fasi.map((f) => f.ordine)) + 1 : 0;
}

/** Crea una fase nuova con default sensati. */
function makeFase(fasi: FaseSim[]): FaseSim {
  const ordine = nextOrdine(fasi);
  return {
    id: crypto.randomUUID(),
    nome: `Fase ${ordine + 1}`,
    ordine,
    durata_settimane: 1,
    inizio_offset_settimane: 0,
    giorni_uomo: 0,
    note: null,
  };
}

/** Parsa un intero non-negativo da input; fallback 0, mai NaN. */
function parseNonNeg(raw: string): number {
  const n = Math.max(0, Number(raw.replace(",", ".")));
  return Number.isFinite(n) ? n : 0;
}

/** "1 sett" / "3 sett" — etichetta breve settimane. */
function settLabel(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r.toLocaleString("it-IT")} sett`;
}

export function SimCronoprogramma({
  fasi,
  voci: _voci,
  onChangeFasi,
  risultatoFasi,
}: SimCronoprogrammaProps) {
  const ordered = [...fasi].sort((a, b) => a.ordine - b.ordine);
  const totale = risultatoFasi.durata_settimane;
  // Scala del gantt: almeno 1 per evitare divisioni per zero / barre a larghezza 0.
  const scala = totale > 0 ? totale : 1;

  const costoByFase = new Map(risultatoFasi.perFase.map((p) => [p.fase_id, p]));

  const patchFase = (id: string, patch: Partial<FaseSim>) => {
    onChangeFasi(fasi.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeFase = (id: string) => {
    onChangeFasi(fasi.filter((f) => f.id !== id));
  };

  const addFase = () => {
    onChangeFasi([...fasi, makeFase(fasi)]);
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Cronoprogramma</h3>
            {totale > 0 ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                {settLabel(totale)} totali
              </span>
            ) : null}
          </div>
          <Button variant="outline" size="sm" onClick={addFase} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Aggiungi fase
          </Button>
        </div>

        {ordered.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            size="sm"
            title="Nessuna fase"
            description="Aggiungi le fasi del lavoro per costruire il cronoprogramma e ripartire i costi."
            action={{ label: "Aggiungi fase", onClick: addFase, icon: Plus }}
          />
        ) : (
          <div className="space-y-2.5">
            {ordered.map((fase) => {
              const calc = costoByFase.get(fase.id);
              const manodopera = calc?.manodopera_costo ?? 0;
              // Geometria barra: offset/larghezza in % rispetto alla durata totale.
              const leftPct = Math.min(100, (fase.inizio_offset_settimane / scala) * 100);
              const widthPct = Math.max(
                2,
                Math.min(100 - leftPct, (fase.durata_settimane / scala) * 100),
              );

              return (
                <div
                  key={fase.id}
                  className="rounded-lg border bg-card p-3 transition-colors hover:border-input"
                >
                  {/* Riga campi editabili */}
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[160px] flex-1 space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Nome fase</Label>
                      <Input
                        value={fase.nome}
                        onChange={(e) => patchFase(fase.id, { nome: e.target.value })}
                        placeholder="Nome fase"
                        className="h-8"
                      />
                    </div>
                    <div className="w-[92px] space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Durata (sett)</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={String(fase.durata_settimane)}
                        onChange={(e) =>
                          patchFase(fase.id, { durata_settimane: parseNonNeg(e.target.value) })
                        }
                        className="h-8 text-right tabular-nums"
                      />
                    </div>
                    <div className="w-[92px] space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Inizio (sett)</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={String(fase.inizio_offset_settimane)}
                        onChange={(e) =>
                          patchFase(fase.id, {
                            inizio_offset_settimane: parseNonNeg(e.target.value),
                          })
                        }
                        className="h-8 text-right tabular-nums"
                      />
                    </div>
                    <div className="w-[92px] space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Giorni-uomo</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={String(fase.giorni_uomo)}
                        onChange={(e) =>
                          patchFase(fase.id, { giorni_uomo: parseNonNeg(e.target.value) })
                        }
                        className="h-8 text-right tabular-nums"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFase(fase.id)}
                      className="h-8 w-8 text-muted-foreground transition hover:text-rose-600"
                      aria-label="Elimina fase"
                      title="Elimina fase"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Barra gantt proporzionale */}
                  <div className="mt-2.5">
                    <div className="relative h-7 w-full overflow-hidden rounded-md bg-secondary/50">
                      <div
                        className={cn(
                          "absolute inset-y-0 flex items-center rounded-md px-2",
                          "bg-primary/85 text-primary-foreground",
                        )}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      >
                        <span className="truncate text-[11px] font-medium tabular-nums">
                          {settLabel(fase.durata_settimane)}
                          {fase.giorni_uomo > 0
                            ? ` · ${Math.round(fase.giorni_uomo).toLocaleString("it-IT")} gg-uomo`
                            : ""}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        inizio sett. {Math.round(fase.inizio_offset_settimane).toLocaleString("it-IT")}
                      </span>
                      {manodopera > 0 ? (
                        <span className="tabular-nums">
                          Manodopera {formatCurrency(manodopera)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
