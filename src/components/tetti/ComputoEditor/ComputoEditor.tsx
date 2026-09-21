/**
 * ComputoEditor — il cuore del verticale: editor del computo metrico.
 *
 * Assembla le `CapitoloSection` raggruppando le `TetComputoVoce[]` per
 * `capitolo_nome`, con un pannello riepilogo STICKY che ricalcola live
 * (imponibile, IVA, totale, margine, n° voci) via `calcTotaliComputo`.
 *
 * Contratto: stato controllato `value: TetComputoVoce[]` + `onChange`. I capitoli
 * "vuoti" (creati ma senza voci) non possono vivere nel flat array → li teniamo
 * in uno stato locale di soli NOMI (`emptyCapitoli`) così restano visibili e
 * ordinati finché non ricevono la prima voce.
 *
 * Purezza React: il modello a capitoli e i totali sono `useMemo`; nessun setState
 * in effect/render; gli id draft (nuove voci/capitoli) nascono solo da handler.
 */
import { useMemo, useState, useCallback } from "react";
import { Plus, Calculator, Sparkles, Eye, EyeOff, ListChecks, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { calcTotaliComputo, type ComputoRigaInput } from "@/lib/tetti/calcoli";
import type { TetComputoVoce } from "@/types/tetti";
import { toast } from "sonner";
import { chiaviCapitoli, esitoRinomina, passaChiave } from "@/lib/moduli/capitoliComputo";
import CapitoloSection from "./CapitoloSection";
import AddVocePicker from "./AddVocePicker";
import { pickedToComputoVoce, type PickedVoce } from "./types";

interface Props {
  value: TetComputoVoce[];
  onChange: (voci: TetComputoVoce[]) => void;
  progettoId: string;
  companyId: string;
  /** Sconto globale % (dallo step Economia) — riflesso nel riepilogo. */
  scontoPct?: number;
  /** IVA % (dallo step Economia) — riflessa nel riepilogo. */
  ivaPct?: number;
  /** Prezzo scritto a mano in Economia: prende il posto della somma delle righe. */
  prezzoManuale?: number | null;
}

/** Capitolo derivato (raggruppamento per nome, ordine preservato). */
interface CapitoloGroup {
  nome: string;
  voci: TetComputoVoce[];
}

const DEFAULT_CAPITOLO = "Generale";

export default function ComputoEditor({
  value, onChange, progettoId, companyId, scontoPct = 0, ivaPct = 22, prezzoManuale = null,
}: Props) {
  const [showMargine, setShowMargine] = useState(false);
  const [globalPickerOpen, setGlobalPickerOpen] = useState(false);
  // Capitoli creati ma ancora senza voci (solo nomi, ordine d'inserimento).
  const [emptyCapitoli, setEmptyCapitoli] = useState<string[]>([]);

  // ─── Modello a capitoli (derivato, ordine = prima apparizione) ────────────
  const capitoli = useMemo<CapitoloGroup[]>(() => {
    const order: string[] = [];
    const map = new Map<string, TetComputoVoce[]>();
    for (const v of value) {
      const k = v.capitolo_nome || DEFAULT_CAPITOLO;
      if (!map.has(k)) { map.set(k, []); order.push(k); }
      map.get(k)!.push(v);
    }
    // Capitoli vuoti (in coda, se non già presenti tra quelli con voci).
    for (const name of emptyCapitoli) {
      if (!map.has(name)) { map.set(name, []); order.push(name); }
    }
    return order.map((nome) => ({ nome, voci: map.get(nome) ?? [] }));
  }, [value, emptyCapitoli]);

  // Chiave React per capitolo. Non la posizione (eliminarne uno passava lo stato
  // della sezione a quello dopo) e non il solo nome (rinominarlo rimonterebbe la
  // sezione): un capitolo rinominato tiene la chiave che aveva.
  const [chiaviEreditate, setChiaviEreditate] = useState<ReadonlyMap<string, string>>(() => new Map());
  const chiavi = useMemo(
    () => chiaviCapitoli(capitoli.map((c) => c.nome), chiaviEreditate),
    [capitoli, chiaviEreditate],
  );

  // ─── Totali live ──────────────────────────────────────────────────────────
  const totali = useMemo(() => {
    const righe: ComputoRigaInput[] = value.map((v) => ({
      capitolo_nome: v.capitolo_nome || DEFAULT_CAPITOLO,
      quantita: v.quantita,
      prezzo_unitario: v.prezzo_unitario,
      sconto_pct: v.sconto_pct,
      costo_materiali: v.costo_materiali,
      costo_manodopera: v.costo_manodopera,
    }));
    return calcTotaliComputo(righe, { sconto_pct: scontoPct, iva_pct: ivaPct, prezzo_manuale: prezzoManuale });
  }, [value, scontoPct, ivaPct, prezzoManuale]);

  const nVoci = value.length;
  // Prezzo pieno prima dello sconto globale: la somma delle righe, o il prezzo
  // scritto a mano in Economia. Le quote per capitolo restano sulle righe.
  const imponibileLordo = totali.imponibileLordo;

  // ─── Mutazioni capitoli ────────────────────────────────────────────────────

  /** Sostituisce le voci di un capitolo nel flat array (preserva l'ordine). */
  const replaceCapitoloVoci = useCallback(
    (nome: string, nextVoci: TetComputoVoce[]) => {
      // Ricostruisce il flat array: per ogni capitolo nell'ordine corrente,
      // usa le nuove voci se è quello toccato, altrimenti le esistenti.
      const order: string[] = [];
      const seen = new Set<string>();
      for (const v of value) {
        const k = v.capitolo_nome || DEFAULT_CAPITOLO;
        if (!seen.has(k)) { seen.add(k); order.push(k); }
      }
      if (!seen.has(nome)) order.push(nome);
      const out: TetComputoVoce[] = [];
      for (const k of order) {
        if (k === nome) {
          out.push(...nextVoci.map((v) => ({ ...v, capitolo_nome: nome })));
        } else {
          out.push(...value.filter((v) => (v.capitolo_nome || DEFAULT_CAPITOLO) === k));
        }
      }
      // Se il capitolo è diventato vuoto, mantienilo visibile (lista nomi).
      setEmptyCapitoli((prev) => {
        const hasVoci = nextVoci.length > 0;
        if (hasVoci) return prev.filter((n) => n !== nome);
        return prev.includes(nome) ? prev : [...prev, nome];
      });
      onChange(out.map((v, i) => ({ ...v, ordine: i })));
    },
    [value, onChange],
  );

  const addCapitolo = useCallback(() => {
    // Nome univoco "Nuovo capitolo (n)".
    const existing = new Set([
      ...value.map((v) => v.capitolo_nome || DEFAULT_CAPITOLO),
      ...emptyCapitoli,
    ]);
    const base = "Nuovo capitolo";
    let name = base;
    let i = 2;
    while (existing.has(name)) { name = `${base} ${i}`; i += 1; }
    setEmptyCapitoli((prev) => [...prev, name]);
  }, [value, emptyCapitoli]);

  // Arriva a fine scrittura (uscita dal campo o Invio), non a ogni tasto.
  const renameCapitolo = useCallback(
    (oldName: string, newName: string) => {
      const esito = esitoRinomina(oldName, newName, capitoli.map((c) => c.nome));
      if (esito.tipo === "doppione") {
        toast.error(`Esiste già un capitolo «${esito.nome}»`, {
          description: "Il capitolo tiene il nome di prima: le voci si sarebbero unite.",
        });
        return;
      }
      // Vuoto o invariato: resta il nome di prima, e il campo torna a mostrarlo.
      if (esito.tipo !== "rinomina") return;
      const target = esito.nome;
      const chiave = chiavi[capitoli.findIndex((c) => c.nome === oldName)];
      // Aggiorna le voci del capitolo.
      onChange(
        value.map((v) =>
          (v.capitolo_nome || DEFAULT_CAPITOLO) === oldName
            ? { ...v, capitolo_nome: target }
            : v,
        ),
      );
      // Aggiorna anche la lista dei capitoli vuoti.
      setEmptyCapitoli((prev) => prev.map((n) => (n === oldName ? target : n)));
      if (chiave) setChiaviEreditate((prev) => passaChiave(prev, oldName, target, chiave));
    },
    [value, onChange, capitoli, chiavi],
  );

  const deleteCapitolo = useCallback(
    (nome: string) => {
      setEmptyCapitoli((prev) => prev.filter((n) => n !== nome));
      onChange(
        value
          .filter((v) => (v.capitolo_nome || DEFAULT_CAPITOLO) !== nome)
          .map((v, i) => ({ ...v, ordine: i })),
      );
    },
    [value, onChange],
  );

  // Picker globale: aggiunge la voce nel suo capitolo suggerito (o "Generale").
  const handleGlobalPick = useCallback(
    (picked: PickedVoce) => {
      const cap = picked.capitolo_nome?.trim() || DEFAULT_CAPITOLO;
      const voce = pickedToComputoVoce(picked, {
        progetto_id: progettoId,
        company_id: companyId,
        capitolo_nome: cap,
        ordine: value.length,
      });
      setEmptyCapitoli((prev) => prev.filter((n) => n !== cap));
      onChange([...value, voce].map((v, i) => ({ ...v, ordine: i })));
    },
    [value, onChange, progettoId, companyId],
  );

  const isEmpty = capitoli.length === 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
      {/* ─── Colonna principale: capitoli ─────────────────────────────────── */}
      <div className="min-w-0 space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <Calculator className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Computo metrico</h3>
              <p className="text-[11px] text-muted-foreground">
                {nVoci > 0
                  ? `${nVoci} ${nVoci === 1 ? "voce" : "voci"} · ${capitoli.length} ${capitoli.length === 1 ? "capitolo" : "capitoli"}`
                  : "Componi capitoli e voci dai listini"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMargine((s) => !s)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                showMargine
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {showMargine ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              Margini
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setGlobalPickerOpen(true)}
              className="h-8 gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5 text-orange-500" /> Cerca voce
            </Button>
          </div>
        </div>

        {isEmpty ? (
          <EmptyState onAddCapitolo={addCapitolo} onSearch={() => setGlobalPickerOpen(true)} />
        ) : (
          <div className="space-y-3">
            {capitoli.map((cap, idx) => (
              // Chiave stabile (vedi chiaviCapitoli): il nome si scrive dentro la
              // sezione e si applica all'uscita dal campo, senza rimontarla.
              <CapitoloSection
                key={chiavi[idx]}
                nome={cap.nome}
                voci={cap.voci}
                accentIndex={idx}
                progettoId={progettoId}
                companyId={companyId}
                showMargine={showMargine}
                onChange={(next) => replaceCapitoloVoci(cap.nome, next)}
                onRename={(newName) => renameCapitolo(cap.nome, newName)}
                onDeleteCapitolo={() => deleteCapitolo(cap.nome)}
              />
            ))}

            <Button
              variant="outline"
              onClick={addCapitolo}
              className="w-full gap-1.5 border-dashed text-muted-foreground hover:border-orange-300 hover:text-orange-700"
            >
              <Plus className="h-4 w-4" /> Aggiungi capitolo
            </Button>
          </div>
        )}
      </div>

      {/* ─── Pannello riepilogo sticky ────────────────────────────────────── */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-b bg-gradient-to-br from-slate-50 to-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" /> Riepilogo computo
            </p>
          </div>
          <div className="space-y-2.5 p-4">
            {/* Righe imponibile / IVA */}
            <div className="space-y-1.5 text-sm">
              <Row
                label={totali.prezzoManuale ? "Prezzo scritto a mano" : "Imponibile"}
                value={formatCurrency(scontoPct > 0 ? imponibileLordo : totali.imponibile)}
              />
              {scontoPct > 0 && (
                <Row
                  label={`Sconto ${scontoPct}%`}
                  value={`−${formatCurrency(imponibileLordo - totali.imponibile)}`}
                  muted
                />
              )}
              <Row label={`IVA ${ivaPct}%`} value={formatCurrency(totali.iva)} muted />
            </div>

            {/* Totale grande */}
            <div className="rounded-xl bg-orange-50/70 px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-orange-700/80">Totale preventivo</p>
              <p className="text-2xl font-bold tabular-nums text-orange-700">{formatCurrency(totali.totale)}</p>
            </div>

            {/* Margine (mostra solo se richiesto) */}
            {showMargine && (
              <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                  <TrendingUp className="h-3.5 w-3.5" /> Margine
                </span>
                <span className="text-right tabular-nums">
                  <span className="block text-sm font-bold text-emerald-700">{formatCurrency(totali.margineEur)}</span>
                  <span className="block text-[10px] text-emerald-600">{totali.marginePct.toFixed(1)}% · costo {formatCurrency(totali.costoTot)}</span>
                </span>
              </div>
            )}

            {/* Mini-breakdown per capitolo */}
            {totali.perCapitolo.length > 0 && (
              <div className="space-y-1 border-t pt-2.5">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Per capitolo</p>
                {totali.perCapitolo.map((c) => {
                  const quota = totali.sommaVoci > 0 ? (c.imponibile / totali.sommaVoci) * 100 : 0;
                  return (
                    <div key={c.nome} className="space-y-0.5">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate text-slate-600">{c.nome}</span>
                        <span className="shrink-0 tabular-nums font-medium text-slate-700">{formatCurrency(c.imponibile)}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-orange-300" style={{ width: `${Math.min(100, Math.max(2, quota))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Conteggio voci */}
            <div className="flex items-center justify-between border-t pt-2.5 text-[11px] text-muted-foreground">
              <span>Voci totali</span>
              <Badge variant="outline" className="tabular-nums">{nVoci}</Badge>
            </div>
          </div>
        </div>
      </aside>

      {/* Picker globale */}
      <AddVocePicker
        open={globalPickerOpen}
        onOpenChange={setGlobalPickerOpen}
        onPick={handleGlobalPick}
      />
    </div>
  );
}

/** Riga label/valore del riepilogo. */
function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-[13px]", muted ? "text-muted-foreground" : "text-slate-600")}>{label}</span>
      <span className={cn("tabular-nums", muted ? "text-[13px] text-muted-foreground" : "font-medium text-slate-800")}>{value}</span>
    </div>
  );
}

/** Empty-state premium e guidato. */
function EmptyState({ onAddCapitolo, onSearch }: { onAddCapitolo: () => void; onSearch: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-gradient-to-b from-muted/30 to-transparent px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
        <Calculator className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">Costruisci il computo</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Organizza il lavoro in capitoli (Demolizioni, Impianti, Finiture…) e pesca le voci
        dai tuoi listini: lavorazioni, prodotti e manodopera. Tutto si somma in tempo reale.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onAddCapitolo} className="gap-1.5 bg-orange-500 hover:bg-orange-600">
          <Plus className="h-4 w-4" /> Aggiungi capitolo
        </Button>
        <Button variant="outline" onClick={onSearch} className="gap-1.5">
          <Sparkles className="h-4 w-4 text-orange-500" /> Cerca nei listini
        </Button>
      </div>
    </div>
  );
}
