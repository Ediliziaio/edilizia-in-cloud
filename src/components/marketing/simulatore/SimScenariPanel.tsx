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
import { useEffect, useMemo, useRef } from "react";
import { Receipt, CreditCard, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import type { RigaTabellaFinanziamento, RisultatoCalcolo } from "@/lib/finanziamenti/types";
import type {
  ScenariConfig, SimulazioneRisultato, FinanziamentoConfig,
} from "@/lib/simulatore/tipi";

interface SimScenariPanelProps {
  scenari: ScenariConfig;
  risultato: SimulazioneRisultato;
  onChange: (scenari: ScenariConfig) => void;
  /** Notifica la rata mensile calcolata; null se nessun finanziamento valido. */
  onRataChange: (rata: number | null) => void;
}

const ALIQUOTE: Array<4 | 10 | 22> = [4, 10, 22];

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

export function SimScenariPanel({
  scenari,
  risultato,
  onChange,
  onRataChange,
}: SimScenariPanelProps) {
  const patch = (p: Partial<ScenariConfig>) => onChange({ ...scenari, ...p });

  // Prezzo cliente per aliquota di confronto (lookup su confronto_iva).
  const prezzoPerAliquota = new Map(
    risultato.confronto_iva.map((c) => [c.aliquota, c.prezzo_cliente]),
  );

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

        {/* ── Sezione Finanziamento ───────────────────────────────────────── */}
        <section className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-muted-foreground">Finanziamento</h3>
            </div>
            <ToggleGroup
              type="single"
              size="sm"
              value={finOn ? "on" : "off"}
              onValueChange={(v) => {
                if (v === "on" || v === "off") toggleFin(v === "on");
              }}
              className="rounded-lg border bg-secondary/40 p-0.5"
            >
              <ToggleGroupItem value="off" className="h-7 px-3 text-xs data-[state=on]:bg-background">
                Nessuno
              </ToggleGroupItem>
              <ToggleGroupItem value="on" className="h-7 px-3 text-xs data-[state=on]:bg-background">
                Rateizza
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {!finOn ? (
            <p className="text-xs text-muted-foreground">
              Attiva per proporre al cliente una rata mensile basata sulle tabelle
              finanziarie aziendali.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Tabelle non configurate */}
              {tabelle.data && tabelle.data.length === 0 ? (
                <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                  <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  <AlertDescription className="text-amber-900 dark:text-amber-200">
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
                    <p className="text-[10px] text-muted-foreground">
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

              {/* Esito calcolo: rata */}
              {result && result.modalita !== "errore" ? (
                <div
                  className={cn(
                    "rounded-lg border p-3",
                    result.modalita === "esatto"
                      ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
                      : "border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/30",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Rata calcolata
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        result.modalita === "esatto"
                          ? "border-emerald-400 text-emerald-700 dark:text-emerald-300"
                          : "border-sky-400 text-sky-700 dark:text-sky-300",
                      )}
                    >
                      {result.modalita === "esatto" ? "Da tabella" : "Interpolato"}
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
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
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
