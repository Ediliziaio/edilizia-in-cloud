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
 * Sezione Finanziamento (Task 13):
 *   - Select tabella (`useTabelleFinanziamentoAttive`) → `finanziamento.tabella_id`.
 *   - Durate disponibili = `numero_rate` distinti dalle righe della tabella.
 *   - Input `anticipo` + `importo_finanziato` (default `prezzo_cliente − anticipo`,
 *     ricalcolato finché l'utente non lo override).
 *   - `calcolaFinanziamento(righe, importo, numero_rate)` → rata/TAN/TAEG/totale
 *     dovuto; gestione errori (durata non disponibile / importo fuori range).
 *   - La rata (`importo_rata`) è notificata via `onRataChange` (null se invalida).
 *
 * Tutte le modifiche passano per `onChange(scenari)` → l'editor ricalcola e
 * autosalva. Numeri sempre arrotondati via `formatCurrency`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Receipt, CreditCard, AlertTriangle, CheckCircle2, SlidersHorizontal, Target, TrendingDown,
  Users, Plus, Trash2, HandCoins,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  useTabelleFinanziamentoAttive,
  useTabellaFinanziamentoRighe,
} from "@/hooks/useTabelleFinanziamento";
import { calcolaFinanziamento } from "@/lib/finanziamenti/calcolaFinanziamento";
import {
  calcolaPrezzoObiettivo, calcolaProvvigione, calcolaMargineObiettivo, round2,
} from "@/lib/simulatore/calcoli";
import type { RigaTabellaFinanziamento, RisultatoCalcolo } from "@/lib/finanziamenti/types";
import type {
  ScenariConfig, SimulazioneRisultato, FinanziamentoConfig,
  ProvvigioneSim, ProvvigioneBase,
} from "@/lib/simulatore/tipi";

interface SimScenariPanelProps {
  scenari: ScenariConfig;
  risultato: SimulazioneRisultato;
  onChange: (scenari: ScenariConfig) => void;
  /** Notifica la rata mensile calcolata; null se nessun finanziamento valido. */
  onRataChange: (rata: number | null) => void;
}

const ALIQUOTE: Array<4 | 10 | 22> = [4, 10, 22];

/** Etichette delle basi di provvigione per la Select. */
const PROVV_BASE_LABEL: Record<ProvvigioneBase, string> = {
  ricavo: "% su ricavo",
  margine: "% su margine",
  fisso: "importo fisso €",
};
const PROVV_BASI: ProvvigioneBase[] = ["ricavo", "margine", "fisso"];

const EMPTY_FINANZIAMENTO: FinanziamentoConfig = {
  tabella_id: null,
  importo_finanziato: 0,
  numero_rate: 0,
  anticipo: 0,
};

/** "10%" — etichetta breve aliquota. */
function pctLabel(n: number): string {
  return `${n.toLocaleString("it-IT")}%`;
}

/** Intero non-negativo da input; fallback 0, mai NaN. */
function parseNonNeg(raw: string): number {
  const n = Math.max(0, Number(raw));
  return Number.isFinite(n) ? n : 0;
}

/** Percentuale 0–100 da input; fallback 0, mai NaN, clamp al 100. */
function parsePct(raw: string): number {
  const n = Math.min(100, Math.max(0, Number(raw)));
  return Number.isFinite(n) ? n : 0;
}

/** "12,3%" — etichetta percentuale arrotondata a 1 decimale. */
function fmtPct(pct: number): string {
  return `${(Math.round(pct * 10) / 10).toLocaleString("it-IT")}%`;
}

export function SimScenariPanel({
  scenari,
  risultato,
  onChange,
  onRataChange,
}: SimScenariPanelProps) {
  const patch = (p: Partial<ScenariConfig>) => onChange({ ...scenari, ...p });

  // ── Provvigioni (commerciale, segnalatore, ecc.) ──────────────────────────
  const provvigioni = scenari.provvigioni ?? [];
  // Margine OPERATIVO (PRE-provvigioni): base per le provvigioni "% su margine"
  // e per il calcolo per-riga in UI (coerente con calcolaSimulazione).
  const marginePre = risultato.margine_netto_valore;

  const addProvvigione = () => {
    const nuova: ProvvigioneSim = {
      id: crypto.randomUUID(),
      nome: "",
      base: "ricavo",
      valore: 0,
    };
    patch({ provvigioni: [...provvigioni, nuova] });
  };

  const updateProvvigione = (id: string, p: Partial<ProvvigioneSim>) => {
    patch({
      provvigioni: provvigioni.map((x) => (x.id === id ? { ...x, ...p } : x)),
    });
  };

  const removeProvvigione = (id: string) => {
    patch({ provvigioni: provvigioni.filter((x) => x.id !== id) });
  };

  // Prezzo cliente per aliquota di confronto (lookup su confronto_iva).
  const prezzoPerAliquota = new Map(
    risultato.confronto_iva.map((c) => [c.aliquota, c.prezzo_cliente]),
  );

  // ── Obiettivo (calcolo inverso) ──────────────────────────────────────────
  // Due modalità: "prezzo" (prezzo netto → sconto + margine) e "margine"
  // (margine desiderato → prezzo a cui vendere). Stringhe locali per non
  // forzare valori finché l'utente non digita.
  const [obiettivoMode, setObiettivoMode] = useState<"prezzo" | "margine">("prezzo");

  // Modalità "prezzo": prezzo netto desiderato → sconto% necessario + margine.
  const [prezzoObiettivo, setPrezzoObiettivo] = useState("");
  const obiettivoNetto = Number(prezzoObiettivo);
  const obiettivoValido = prezzoObiettivo !== "" && Number.isFinite(obiettivoNetto) && obiettivoNetto >= 0;
  const obiettivo = obiettivoValido
    ? calcolaPrezzoObiettivo(risultato.costo_pieno, risultato.ricavo_lordo, obiettivoNetto)
    : null;

  // Modalità "margine": margine desiderato (% o €) → ricavo/prezzo necessari.
  const [margineTargetType, setMargineTargetType] = useState<"pct" | "euro">("pct");
  const [margineTarget, setMargineTarget] = useState("");
  const margineTargetNum = Number(margineTarget);
  const margineTargetValido =
    margineTarget !== "" && Number.isFinite(margineTargetNum) && margineTargetNum >= 0;
  // IVA effettiva: aliquota media dal risultato (iva/ricavo), fallback all'aliquota
  // singola se non c'è ancora ricavo netto su cui mediare.
  const ivaEffettivaPct =
    risultato.ricavo_netto > 0
      ? (risultato.iva_totale / risultato.ricavo_netto) * 100
      : scenari.iva_rate_singola;
  const margineObiettivo = margineTargetValido
    ? calcolaMargineObiettivo({
        costoPieno: risultato.costo_pieno,
        provvigioni,
        ivaEffettivaPct,
        target: margineTargetNum,
        targetType: margineTargetType,
      })
    : null;

  // Margine netto vs utile atteso: verde se raggiunge il target, warning sotto.
  const utileTarget = risultato.utile_target;
  const margineOk = risultato.margine_netto_valore >= utileTarget;

  // ── Finanziamento ───────────────────────────────────────────────────────
  const fin = scenari.finanziamento;
  const finOn = !!fin;

  const tabelle = useTabelleFinanziamentoAttive();
  const righeQ = useTabellaFinanziamentoRighe(fin?.tabella_id ?? null);
  // Riferimento stabile fra i render (evita di invalidare i useMemo a valle).
  const righe = useMemo(() => righeQ.data ?? [], [righeQ.data]);

  // Durate disponibili = numero_rate distinti (ordinati).
  const durate = useMemo(
    () => Array.from(new Set(righe.map((r) => r.numero_rate))).sort((a, b) => a - b),
    [righe],
  );

  const patchFin = (p: Partial<FinanziamentoConfig>) => {
    const base = fin ?? EMPTY_FINANZIAMENTO;
    patch({ finanziamento: { ...base, ...p } });
  };

  const toggleFin = (on: boolean) => {
    if (on) {
      const anticipo = 0;
      patch({
        finanziamento: {
          tabella_id: null,
          anticipo,
          importo_finanziato: Math.max(0, risultato.prezzo_cliente - anticipo),
          numero_rate: 0,
        },
      });
    } else {
      patch({ finanziamento: null });
    }
  };

  // `importo_finanziato` segue `prezzo_cliente − anticipo` finché l'utente non
  // lo modifica manualmente (override). Traccia l'override fra i render.
  const importoOverridden = useRef(false);
  useEffect(() => {
    if (!fin) {
      importoOverridden.current = false;
      return;
    }
    if (importoOverridden.current) return;
    const atteso = Math.max(0, Math.round((risultato.prezzo_cliente - fin.anticipo) * 100) / 100);
    if (fin.importo_finanziato !== atteso) {
      patchFin({ importo_finanziato: atteso });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [risultato.prezzo_cliente, fin?.anticipo, fin?.tabella_id]);

  // Calcolo rata via tabella reale del finanziatore.
  const result: RisultatoCalcolo | null = useMemo(() => {
    if (!fin || !fin.tabella_id || !fin.numero_rate || fin.importo_finanziato <= 0) return null;
    if (righe.length === 0) return null;
    return calcolaFinanziamento({
      importo: fin.importo_finanziato,
      numero_rate: fin.numero_rate,
      // Le righe del hook (RigaFinanziamento) sono compatibili nei campi usati
      // dal calcolatore; bridge di tipo verso RigaTabellaFinanziamento.
      righe: righe as unknown as RigaTabellaFinanziamento[],
    });
  }, [fin, righe]);

  // Notifica la rata al parent (effetto, non durante il render).
  const rata =
    result && result.modalita !== "errore" ? result.importo_rata ?? null : null;
  useEffect(() => {
    onRataChange(finOn ? rata : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rata, finOn]);

  return (
    <Card className="rounded-xl">
      <CardContent className="space-y-5 p-4">
        {/* ── Sezione Economia & Trattativa ───────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold">Economia &amp; trattativa</h3>
          </div>

          {/* Telefono: le tre percentuali in riga, senza la riga dei valori sotto. */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 max-sm:grid-cols-3 max-sm:gap-2">
            {/* Spese generali % */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground"><span className="max-sm:hidden">Spese generali (%)</span><span className="sm:hidden">Spese gen. %</span></Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.5"
                value={String(scenari.spese_generali_pct)}
                onChange={(e) => patch({ spese_generali_pct: parsePct(e.target.value) })}
                className="h-8 text-right tabular-nums"
              />
              <p className="text-[10px] text-muted-foreground tabular-nums max-sm:hidden max-md:text-[11px]">
                {formatCurrency(risultato.spese_generali)} · costo pieno{" "}
                {formatCurrency(risultato.costo_pieno)}
              </p>
            </div>

            {/* Utile d'impresa % */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground"><span className="max-sm:hidden">Utile d&apos;impresa (%)</span><span className="sm:hidden">Utile %</span></Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.5"
                value={String(scenari.utile_pct)}
                onChange={(e) => patch({ utile_pct: parsePct(e.target.value) })}
                className="h-8 text-right tabular-nums"
              />
              <p className="text-[10px] text-muted-foreground tabular-nums max-sm:hidden max-md:text-[11px]">
                target {formatCurrency(risultato.utile_target)}
              </p>
            </div>

            {/* Sconto % */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground"><span className="max-sm:hidden">Sconto cliente (%)</span><span className="sm:hidden">Sconto %</span></Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.5"
                value={String(scenari.sconto_pct)}
                onChange={(e) => patch({ sconto_pct: parsePct(e.target.value) })}
                className="h-8 text-right tabular-nums"
              />
              <p className="text-[10px] text-muted-foreground tabular-nums max-sm:hidden max-md:text-[11px]">
                −{formatCurrency(risultato.sconto_valore)} · netto{" "}
                {formatCurrency(risultato.ricavo_netto)}
              </p>
            </div>
          </div>

          {/* Esito margine netto vs utile target — semaforo: verde (chart-2) se
              raggiunge il target, arancio (chart-3) di avviso sotto soglia. */}
          {(() => {
            const margineVar = margineOk ? "var(--chart-2)" : "var(--chart-3)";
            return (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
            style={{
              borderColor: `hsl(${margineVar} / 0.30)`,
              backgroundColor: `hsl(${margineVar} / 0.08)`,
            }}
          >
            <span className="flex items-center gap-1.5 font-medium">
              {margineOk ? (
                <CheckCircle2 className="h-4 w-4" style={{ color: `hsl(${margineVar})` }} />
              ) : (
                <AlertTriangle className="h-4 w-4" style={{ color: `hsl(${margineVar})` }} />
              )}
              Margine netto
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              <span className="font-bold" style={{ color: `hsl(${margineVar})` }}>
                {formatCurrency(risultato.margine_netto_valore)} ({fmtPct(risultato.margine_netto_pct)})
              </span>
              {utileTarget > 0 ? (
                <span className="text-[11px] text-muted-foreground">
                  / utile target {formatCurrency(utileTarget)}
                </span>
              ) : null}
            </span>
          </div>
            );
          })()}

          {/* Obiettivo (calcolo inverso): per prezzo o per margine */}
          <div className="rounded-xl border bg-card p-3 shadow-sm space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Obiettivo
                </p>
              </div>
              <ToggleGroup
                type="single"
                size="sm"
                value={obiettivoMode}
                onValueChange={(v) => {
                  if (v === "prezzo" || v === "margine") setObiettivoMode(v);
                }}
                className="rounded-lg border bg-muted/40 p-0.5"
              >
                <ToggleGroupItem value="prezzo" className="h-7 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  Per prezzo
                </ToggleGroupItem>
                <ToggleGroupItem value="margine" className="h-7 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  Per margine
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {obiettivoMode === "prezzo" ? (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Prezzo netto desiderato (€)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="100"
                      placeholder={String(Math.round(risultato.ricavo_netto))}
                      value={prezzoObiettivo}
                      onChange={(e) => setPrezzoObiettivo(e.target.value)}
                      className="h-8 w-44 text-right tabular-nums"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    disabled={!obiettivo}
                    onClick={() => {
                      if (!obiettivo) return;
                      patch({ sconto_pct: Math.max(0, obiettivo.sconto_pct_necessario) });
                    }}
                  >
                    <TrendingDown className="h-3.5 w-3.5" />
                    Applica sconto
                  </Button>
                </div>
                {obiettivo ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
                    <span className="text-muted-foreground">
                      Sconto necessario:{" "}
                      <strong className="text-foreground">{fmtPct(obiettivo.sconto_pct_necessario)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Margine:{" "}
                      <strong style={{ color: obiettivo.margine_valore >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--chart-5))" }}>
                        {formatCurrency(obiettivo.margine_valore)} ({fmtPct(obiettivo.margine_pct)})
                      </strong>
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground max-sm:hidden">
                    Inserisci un prezzo netto per calcolare lo sconto necessario e il margine risultante.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <ToggleGroup
                    type="single"
                    size="sm"
                    value={margineTargetType}
                    onValueChange={(v) => {
                      if (v === "pct" || v === "euro") setMargineTargetType(v);
                    }}
                    className="rounded-lg border bg-muted/40 p-0.5"
                  >
                    <ToggleGroupItem value="pct" className="h-8 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                      %
                    </ToggleGroupItem>
                    <ToggleGroupItem value="euro" className="h-8 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                      €
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      {margineTargetType === "pct" ? "Margine desiderato (%)" : "Margine desiderato (€)"}
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step={margineTargetType === "pct" ? "0.5" : "100"}
                      placeholder={margineTargetType === "pct" ? "20" : "300"}
                      value={margineTarget}
                      onChange={(e) => setMargineTarget(e.target.value)}
                      className="h-8 w-44 text-right tabular-nums"
                    />
                  </div>
                </div>
                {margineObiettivo ? (
                  margineObiettivo.fattibile ? (
                    <div className="space-y-1.5">
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-sm">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
                          Dovresti vendere a
                        </p>
                        <p className="mt-0.5 font-bold tabular-nums text-foreground">
                          {formatCurrency(margineObiettivo.ricavo_netto_necessario ?? 0)}{" "}
                          <span className="text-[11px] font-normal text-muted-foreground">imponibile</span>{" "}
                          <span className="text-muted-foreground">→</span>{" "}
                          {formatCurrency(margineObiettivo.prezzo_cliente_necessario ?? 0)}{" "}
                          <span className="text-[11px] font-normal text-muted-foreground">IVA inclusa</span>
                        </p>
                      </div>
                      {(() => {
                        const diff = round2(
                          (margineObiettivo.ricavo_netto_necessario ?? 0) - risultato.ricavo_netto,
                        );
                        return (
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            Rispetto all&apos;attuale ({formatCurrency(risultato.ricavo_netto)}):{" "}
                            <strong
                              style={{ color: diff > 0 ? "hsl(var(--chart-3))" : "hsl(var(--chart-2))" }}
                            >
                              {diff >= 0 ? "+" : "−"}
                              {formatCurrency(Math.abs(diff))}
                            </strong>
                          </p>
                        );
                      })()}
                    </div>
                  ) : (
                    <p
                      className="rounded-lg border p-2.5 text-xs font-medium"
                      style={{
                        borderColor: "hsl(var(--chart-3) / 0.30)",
                        backgroundColor: "hsl(var(--chart-3) / 0.08)",
                        color: "hsl(var(--chart-3))",
                      }}
                    >
                      Margine non raggiungibile con questi costi/provvigioni.
                    </p>
                  )
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Inserisci il margine desiderato per calcolare il prezzo a cui vendere.
                  </p>
                )}
              </>
            )}
          </div>

          {/* ── Provvigioni (commerciale, segnalatore, ecc.) ──────────────── */}
          <div className="rounded-xl border bg-card p-3 shadow-sm space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Provvigioni
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={addProvvigione}
              >
                <Plus className="h-3.5 w-3.5" />
                Aggiungi provvigione
              </Button>
            </div>

            {provvigioni.length === 0 ? (
              <p className="text-[11px] text-muted-foreground max-sm:hidden">
                Aggiungi i costi di provvigione (commerciale, segnalatore, ecc.): erodono il
                margine ma non cambiano il prezzo al cliente.
              </p>
            ) : (
              <div className="space-y-2">
                {provvigioni.map((p) => {
                  const valoreRiga = calcolaProvvigione(p, risultato.ricavo_netto, marginePre);
                  return (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-2"
                    >
                      {/* Nome */}
                      <div className="min-w-[8rem] flex-1 space-y-1">
                        <Label className="text-[10px] text-muted-foreground max-md:text-[11px]">Beneficiario</Label>
                        <Input
                          value={p.nome}
                          placeholder="Es. Commerciale"
                          onChange={(e) => updateProvvigione(p.id, { nome: e.target.value })}
                          className="h-8"
                        />
                      </div>

                      {/* Base */}
                      <div className="w-[9.5rem] space-y-1">
                        <Label className="text-[10px] text-muted-foreground max-md:text-[11px]">Base</Label>
                        <Select
                          value={p.base}
                          onValueChange={(v) =>
                            updateProvvigione(p.id, { base: v as ProvvigioneBase })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROVV_BASI.map((b) => (
                              <SelectItem key={b} value={b}>
                                {PROVV_BASE_LABEL[b]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Valore (% o €) */}
                      <div className="w-[6.5rem] space-y-1">
                        <Label className="text-[10px] text-muted-foreground max-md:text-[11px]">
                          {p.base === "fisso" ? "Importo (€)" : "Valore (%)"}
                        </Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step={p.base === "fisso" ? "10" : "0.5"}
                          value={String(p.valore)}
                          onChange={(e) =>
                            updateProvvigione(p.id, { valore: parseNonNeg(e.target.value) })
                          }
                          className="h-8 text-right tabular-nums"
                        />
                      </div>

                      {/* Valore calcolato (read-only) */}
                      <div className="w-[6rem] space-y-1">
                        <Label className="text-[10px] text-muted-foreground max-md:text-[11px]">Costo</Label>
                        <div className="flex h-8 items-center justify-end rounded-md border bg-muted/30 px-2 text-sm font-medium tabular-nums">
                          {formatCurrency(valoreRiga)}
                        </div>
                      </div>

                      {/* Elimina */}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Elimina provvigione"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeProvvigione(p.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}

                {/* Totale provvigioni + margine operativo vs finale */}
                <div className="rounded-md border bg-muted/30 p-2.5 space-y-1.5 text-sm tabular-nums">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <HandCoins className="h-3.5 w-3.5" />
                      Totale provvigioni
                    </span>
                    <span className="font-semibold" style={{ color: "hsl(var(--chart-5))" }}>
                      −{formatCurrency(risultato.provvigioni_totale)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                    <span>Margine operativo</span>
                    <span>
                      {formatCurrency(risultato.margine_netto_valore)} ({fmtPct(risultato.margine_netto_pct)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t pt-1.5 font-medium">
                    <span>Margine finale</span>
                    <span style={{ color: risultato.margine_valore >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--chart-5))" }}>
                      {formatCurrency(risultato.margine_valore)} ({fmtPct(risultato.margine_pct)})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Sezione IVA ─────────────────────────────────────────────────── */}
        <section className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Receipt className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-semibold">IVA</h3>
            </div>
            <ToggleGroup
              type="single"
              size="sm"
              value={scenari.iva_mode}
              onValueChange={(v) => {
                if (v === "singola" || v === "mista") patch({ iva_mode: v });
              }}
              className="rounded-lg border bg-muted/40 p-0.5"
            >
              <ToggleGroupItem value="singola" className="h-7 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                Singola
              </ToggleGroupItem>
              <ToggleGroupItem value="mista" className="h-7 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
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
            <p className="text-xs text-muted-foreground max-sm:hidden">
              IVA per riga (10% beni significativi e posa, 22% sull&apos;eccedenza). Il
              prezzo cliente somma le aliquote effettive delle voci.
            </p>
          )}

          {/* Confronto prezzo cliente per le 3 aliquote. In mista è solo una
              simulazione "what-if" ad aliquota unica: il prezzo reale è il
              totale del riepilogo IVA, non queste 3 ipotesi. */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {scenari.iva_mode === "mista"
                ? "Confronto ipotesi ad aliquota unica"
                : "Confronto prezzo cliente"}
            </p>
            <div className={cn("grid grid-cols-3 gap-2", scenari.iva_mode === "mista" && "opacity-60")}>
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
                        ? "border-primary ring-1 ring-primary/40"
                        : "border-border",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[11px] font-medium",
                        attiva ? "text-primary" : "text-muted-foreground",
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
            {scenari.iva_mode === "mista" ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Ipotesi se tutto l&apos;imponibile fosse a un&apos;unica aliquota. In
                mista il prezzo reale è il <strong>Totale IVA</strong> del riepilogo
                qui sotto.
              </p>
            ) : null}
          </div>

          {/* In mista: riepilogo per aliquota dalle voci. */}
          {scenari.iva_mode === "mista" && risultato.riepilogo_iva.length > 0 ? (
            <div className="rounded-xl border bg-card p-3 shadow-sm">
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

        {/* ── Sezione Finanziamento ───────────────────────────────────────── */}
        <section className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CreditCard className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-semibold">Finanziamento</h3>
            </div>
            <ToggleGroup
              type="single"
              size="sm"
              value={finOn ? "on" : "off"}
              onValueChange={(v) => {
                if (v === "on" || v === "off") toggleFin(v === "on");
              }}
              className="rounded-lg border bg-muted/40 p-0.5"
            >
              <ToggleGroupItem value="off" className="h-7 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                Nessuno
              </ToggleGroupItem>
              <ToggleGroupItem value="on" className="h-7 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                Rateizza
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {!finOn ? (
            <p className="text-xs text-muted-foreground max-sm:hidden">
              Attiva per proporre al cliente una rata mensile basata sulle tabelle
              finanziarie aziendali.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Tabelle non configurate */}
              {tabelle.data && tabelle.data.length === 0 ? (
                <Alert
                  style={{
                    borderColor: "hsl(var(--chart-3) / 0.40)",
                    backgroundColor: "hsl(var(--chart-3) / 0.08)",
                  }}
                >
                  <AlertTriangle className="h-4 w-4" style={{ color: "hsl(var(--chart-3))" }} />
                  <AlertDescription style={{ color: "hsl(var(--chart-3))" }}>
                    <strong>Nessuna tabella finanziamento configurata.</strong>{" "}
                    <a
                      href="/azienda/impostazioni/finanziamenti"
                      className="underline underline-offset-2"
                    >
                      Vai a Impostazioni → Finanziamenti
                    </a>{" "}
                    per aggiungerne una.
                  </AlertDescription>
                </Alert>
              ) : null}

              {tabelle.isLoading ? <Skeleton className="h-9 w-full" /> : null}

              {tabelle.data && tabelle.data.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {/* Tabella */}
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px] text-muted-foreground">Prodotto finanziario</Label>
                    <Select
                      value={fin?.tabella_id ?? ""}
                      onValueChange={(v) =>
                        patchFin({ tabella_id: v || null, numero_rate: 0 })
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Seleziona tabella…" />
                      </SelectTrigger>
                      <SelectContent>
                        {tabelle.data.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nome_prodotto}
                            {t.tan_base != null ? ` · TAN ${t.tan_base.toFixed(2)}%` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Numero rate */}
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Numero rate</Label>
                    <Select
                      value={fin?.numero_rate ? String(fin.numero_rate) : ""}
                      onValueChange={(v) => patchFin({ numero_rate: Number(v) })}
                      disabled={!fin?.tabella_id || (righeQ.isLoading || durate.length === 0)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Durata…" />
                      </SelectTrigger>
                      <SelectContent>
                        {durate.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} rate ({Math.round((d / 12) * 10) / 10} anni)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Anticipo */}
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Anticipo (€)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="100"
                      value={String(fin?.anticipo ?? 0)}
                      onChange={(e) => patchFin({ anticipo: parseNonNeg(e.target.value) })}
                      className="h-8 text-right tabular-nums"
                    />
                  </div>

                  {/* Importo finanziato */}
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px] text-muted-foreground">Importo da finanziare (€)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="100"
                      value={String(fin?.importo_finanziato ?? 0)}
                      onChange={(e) => {
                        importoOverridden.current = true;
                        patchFin({ importo_finanziato: parseNonNeg(e.target.value) });
                      }}
                      className="h-8 text-right tabular-nums"
                    />
                    <p className="text-[10px] text-muted-foreground max-md:text-[11px]">
                      Default: prezzo cliente − anticipo ={" "}
                      {formatCurrency(Math.max(0, risultato.prezzo_cliente - (fin?.anticipo ?? 0)))}.
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Esito calcolo: errore */}
              {result && result.modalita === "errore" ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{result.messaggio}</strong>
                    {result.durate_disponibili && result.durate_disponibili.length > 0 ? (
                      <p className="mt-1 text-xs">
                        Durate disponibili: {result.durate_disponibili.join(", ")} rate
                      </p>
                    ) : null}
                    {result.importo_min !== undefined && result.importo_max !== undefined ? (
                      <p className="mt-1 text-xs">
                        Range importi: {formatCurrency(result.importo_min)} –{" "}
                        {formatCurrency(result.importo_max)}
                      </p>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              {/* Esito calcolo: rata. Esatto (da tabella) = verde chart-2;
                  interpolato = accento brand primary (informativo, non allarme). */}
              {result && result.modalita !== "errore" ? (
                (() => {
                  const esatto = result.modalita === "esatto";
                  const rataVar = esatto ? "var(--chart-2)" : "var(--primary)";
                  return (
                <div
                  className="rounded-lg border p-3"
                  style={{
                    borderColor: `hsl(${rataVar} / 0.30)`,
                    backgroundColor: `hsl(${rataVar} / 0.08)`,
                  }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <CheckCircle2 className="h-4 w-4" style={{ color: "hsl(var(--chart-2))" }} />
                      Rata calcolata
                    </p>
                    <Badge
                      variant="outline"
                      className="text-[10px] max-md:text-[11px]"
                      style={{ borderColor: `hsl(${rataVar} / 0.50)`, color: `hsl(${rataVar})` }}
                    >
                      {esatto ? "Da tabella" : "Interpolato"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <FinStat
                      label="Rata mensile"
                      value={formatCurrency(result.importo_rata ?? 0)}
                      highlight
                    />
                    <FinStat label="Durata" value={`${result.numero_rate} rate`} />
                    <FinStat
                      label="Totale dovuto"
                      value={formatCurrency(result.importo_totale_dovuto ?? 0)}
                    />
                    <FinStat
                      label="TAN / TAEG"
                      value={`${result.tan != null ? result.tan.toFixed(2) : "—"}% / ${
                        result.taeg != null ? result.taeg.toFixed(2) : "—"
                      }%`}
                    />
                  </div>
                </div>
                  );
                })()
              ) : null}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function FinStat({
  label, value, highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground max-md:text-[11px]">{label}</p>
      <p
        className={cn(
          "mt-0.5 tabular-nums",
          highlight ? "text-lg font-extrabold text-primary" : "text-sm font-semibold",
        )}
      >
        {value}
      </p>
    </div>
  );
}
