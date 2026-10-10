/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.5
 *
 * Editor matrice L × H per famiglie in modalità prezzo 'griglia'.
 * Ogni cella = { prezzo_vendita, prezzo_acquisto }.
 *
 * Strategia di salvataggio (hardened post-stabilization):
 *  1. Upsert delle celle "nuove o modificate" preservando `id` per quelle
 *     già esistenti (update-in-place) e inserendo le nuove.
 *  2. Delete ESCLUSIVAMENTE delle celle rimosse dall'utente (diff su ids),
 *     non più dell'intera famiglia.
 *
 * Garanzie:
 *  - Nessuna finestra vuota: se l'upsert fallisce, nulla è stato toccato;
 *    se il delete fallisce, il grid contiene valori validi (più eventuali
 *    celle stale — l'utente rilancia il salvataggio).
 *  - Preserva axis_config di celle aggiunte da editor avanzati (MatriceEditor
 *    STEP 4): il delete filtra per `axis_config IS NULL` e scope per id.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Save, Loader2, Upload, Download, FileUp, History } from "lucide-react";
import { toast } from "sonner";
import { messaggioErroreListino } from "@/lib/listinoErrors";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { captureVelocityError } from "@/lib/velocity/sentry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  GridBulkImportDialog,
  campoImportoGriglia,
  type BulkParsedPayload,
} from "./GridBulkImportDialog";
import { applyMarkup, applyScontiFornitore } from "@/lib/priceMarkup";
import { formatCurrency } from "@/lib/formatters";
import { round2 } from "@/hooks/usePreventivoCosti";
import { invalidaListinoNelPreventivatore } from "@/lib/serramenti/cacheListino";
import type { MarkupTipo } from "@/types/articleFamily";

import { useIsMobile } from "@/hooks/use-mobile";
interface Cell {
  prezzo_vendita: number;
  prezzo_acquisto: number;
}

interface GridRow {
  id: string;
  family_id: string | null;
  valore_x: number;
  valore_y: number;
  prezzo_vendita: number;
  prezzo_acquisto: number;
}

interface Props {
  familyId: string;
  asseXLabel: string;
  asseYLabel: string;
  /**
   * Modalità prezzo della famiglia. Quando è "acquisto_markup" nascondiamo
   * l'input del prezzo di vendita (viene derivato dal markup configurato),
   * mostrando solo il prezzo di acquisto — riduce rumore visivo e DOM
   * (266 celle × 1 input invece di × 2).
   * Default: "vendita" per compat con chiamate storiche.
   */
  prezzoBaseMode?: "vendita" | "acquisto_markup";
  /**
   * Sconti fornitore in cascata (solo mode=acquisto_markup). Se almeno uno
   * è > 0, il prezzo_acquisto di ogni cella è trattato come LORDO di listino
   * e si calcola: netto = lordo × (1-s1/100) × (1-s2/100); vendita = netto × markup.
   * Se 0/0, retrocompat: input = netto, vendita = netto × markup.
   */
  scontoFornitore1?: number;
  scontoFornitore2?: number;
  /** Tipo markup applicato all'acquisto netto. Default "none" (vendita = netto). */
  markupTipo?: MarkupTipo;
  /** Valore markup (% se markupTipo="percentuale", €/pz se "fisso_pz"). */
  markupValore?: number;
  /**
   * Invocata PRIMA di salvare la griglia: permette al parent di persistere i
   * parametri prezzo/sconti della famiglia se il form ha modifiche non salvate
   * (M-10 audit) — altrimenti le celle verrebbero calcolate con parametri
   * diversi da quelli in DB. Ritorna false per bloccare il salvataggio.
   */
  onEnsureFamilySaved?: () => Promise<boolean>;
}

// Riferimento stabile per lo stato "dati non ancora arrivati": senza questo,
// `data: rows = []` crea un array nuovo ad ogni render e l'effect di
// bootstrap (deps [rows]) girerebbe in loop durante il caricamento.
const EMPTY_ROWS: GridRow[] = [];

type ModoPrezzo = "vendita" | "acquisto_markup";

/**
 * Le misure della griglia sono colonne INTEGER (listino_griglia.valore_x/y):
 * fino al 05/10/2026 l'editor accettava 62,5 e il salvataggio falliva con un
 * errore del database. Null se la misura va bene.
 */
export function problemaMisuraGriglia(v: number): string | null {
  if (!Number.isFinite(v) || v <= 0) return "Scrivi una misura maggiore di zero, in millimetri.";
  if (!Number.isInteger(v)) {
    return `Le misure vanno in millimetri interi: ${v.toLocaleString("it-IT")} non si può salvare.`;
  }
  return null;
}

/**
 * Netto e vendita di una cella dal prezzo di acquisto scritto (LORDO di
 * listino se ci sono sconti fornitore, altrimenti netto). La vendita è al
 * centesimo come nei motori dei preventivi (05/10/2026): prima si salvava con
 * 4 decimali (es. 133,3330) e il preventivo serramenti, che legge la vendita
 * salvata, partiva da un prezzo diverso da quello mostrato qui.
 */
export function prezziCellaDaAcquisto(
  prezzoAcquisto: number,
  p: { scontoFornitore1: number; scontoFornitore2: number; markupTipo: MarkupTipo; markupValore: number },
): { netto: number; vendita: number } {
  const netto =
    p.scontoFornitore1 > 0 || p.scontoFornitore2 > 0
      ? applyScontiFornitore(prezzoAcquisto, p.scontoFornitore1, p.scontoFornitore2)
      : Math.max(0, prezzoAcquisto);
  const vendita = round2(
    applyMarkup({ prezzoAcquisto: netto, markupTipo: p.markupTipo, markupValore: p.markupValore })
      .prezzoVendita,
  );
  return { netto, vendita };
}

export interface EsitoCsvGriglia {
  /** Celle attuali con quelle del file sopra. */
  celle: Map<string, Cell>;
  /** Misure (mm) delle righe importate, ordinate. */
  xs: number[];
  ys: number[];
  importate: number;
  /** Righe illeggibili o senza il prezzo che il prodotto usa. */
  scartate: number;
  /** Solo «acquisto_markup»: righe senza prezzo di acquisto. */
  senzaAcquisto: number;
  /** Testo delle misure non intere scartate (es. «62,5»). */
  misureNonIntere: string[];
  /** Niente righe oltre l'intestazione. */
  vuoto: boolean;
}

/**
 * Legge il CSV della griglia (il formato di «Esporta CSV»: misura X, misura Y,
 * prezzo_vendita, prezzo_acquisto) e lo unisce alle celle attuali.
 *
 * L'acquisto che manca resta mancante (05/10/2026): senza la quarta colonna
 * diventava uguale alla vendita — margine zero nei prodotti a prezzo di
 * vendita e, in quelli che ricavano la vendita dal listino del fornitore, la
 * vendita presa per listino e ricaricata una seconda volta al salvataggio.
 * Ora l'acquisto assente lascia quello che c'era (0 in una cella nuova); in
 * «acquisto_markup», che legge solo l'acquisto, la riga senza acquisto non
 * entra. Le misure non intere si scartano: il database le rifiuterebbe.
 */
export function leggiCsvGriglia(
  testo: string,
  modo: ModoPrezzo,
  celleAttuali: ReadonlyMap<string, Cell>,
): EsitoCsvGriglia {
  const righe = testo.split(/\r?\n/).filter((l) => l.trim());
  const esito: EsitoCsvGriglia = {
    celle: new Map(celleAttuali),
    xs: [],
    ys: [],
    importate: 0,
    scartate: 0,
    senzaAcquisto: 0,
    misureNonIntere: [],
    vuoto: righe.length < 2,
  };
  if (esito.vuoto) return esito;
  // M-P (audit): i CSV di Excel italiano usano ';' come separatore e la
  // virgola decimale ("120,50"): separatore dall'header, decimali normalizzati
  // (virgola → punto, punto migliaia rimosso).
  const sep = righe[0].includes(";") ? ";" : righe[0].includes("\t") ? "\t" : ",";
  const numero = (raw: string | undefined): number => {
    let s = (raw ?? "").trim();
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    return parseFloat(s);
  };
  // Cella vuota, testo o negativo = prezzo assente.
  const importo = (raw: string | undefined): number | null => {
    const n = numero(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const xs = new Set<number>();
  const ys = new Set<number>();
  // La prima riga è l'intestazione.
  for (let i = 1; i < righe.length; i++) {
    const parti = righe[i].split(sep).map((p) => p.trim());
    if (parti.length < 3) {
      esito.scartate++;
      continue;
    }
    const x = numero(parti[0]);
    const y = numero(parti[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) {
      esito.scartate++;
      continue;
    }
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      esito.misureNonIntere.push(Number.isInteger(x) ? parti[1] : parti[0]);
      continue;
    }
    const vendita = importo(parti[2]);
    const acquisto = importo(parti[3]);
    const chiave = `${x}_${y}`;
    const attuale = esito.celle.get(chiave);
    if (modo === "acquisto_markup") {
      if (acquisto === null) {
        esito.senzaAcquisto++;
        continue;
      }
      // La vendita qui è solo cache: al salvataggio si ricalcola dall'acquisto.
      esito.celle.set(chiave, {
        prezzo_vendita: vendita ?? attuale?.prezzo_vendita ?? 0,
        prezzo_acquisto: acquisto,
      });
    } else {
      if (vendita === null) {
        esito.scartate++;
        continue;
      }
      esito.celle.set(chiave, {
        prezzo_vendita: vendita,
        prezzo_acquisto: acquisto ?? attuale?.prezzo_acquisto ?? 0,
      });
    }
    xs.add(x);
    ys.add(y);
    esito.importate++;
  }
  esito.xs = Array.from(xs).sort((a, b) => a - b);
  esito.ys = Array.from(ys).sort((a, b) => a - b);
  return esito;
}

export function FamilyGridEditor({
  familyId,
  asseXLabel,
  asseYLabel,
  prezzoBaseMode = "vendita",
  scontoFornitore1 = 0,
  scontoFornitore2 = 0,
  markupTipo = "none",
  markupValore = 0,
  onEnsureFamilySaved,
}: Props) {
  const isMobile = useIsMobile();
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  const { data: rows = EMPTY_ROWS, isLoading } = useQuery({
    // Chiave sua (05/10/2026): sotto grid(id) poteva esserci prima la cache
    // del simulatore (righe senza `id`) e il salvataggio aggiornava id undefined.
    queryKey: queryKeys.articleFamilies.gridView(familyId, "editor"),
    enabled: !!companyId && !!familyId,
    queryFn: async (): Promise<GridRow[]> => {
      // Filtra per axis_config IS NULL: questo editor gestisce solo celle "flat"
      // (L × H senza fascia). Le celle multi-fascia sono di competenza esclusiva
      // di MatriceEditor (STEP 4) e NON devono essere mostrate né toccate qui.
      const { data, error } = await supabase
        .from("listino_griglia")
        .select("id, family_id, valore_x, valore_y, prezzo_vendita, prezzo_acquisto")
        .eq("family_id", familyId)
        .eq("company_id", companyId!)
        .is("axis_config", null)
        .order("valore_x", { ascending: true })
        .order("valore_y", { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as GridRow[]);
    },
    staleTime: 60 * 1000,
  });

  // Stato locale: assi + matrice
  const [xAxis, setXAxis] = useState<number[]>([]);
  const [yAxis, setYAxis] = useState<number[]>([]);
  // cells indicizzata da `${x}_${y}`
  const [cells, setCells] = useState<Map<string, Cell>>(new Map());
  const [newX, setNewX] = useState("");
  const [newY, setNewY] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);

  // Modifiche locali non salvate. Il ref specchia lo stato per farlo leggere
  // all'effect di bootstrap senza inserirlo nelle deps (un rebuild al toggle
  // di dirty mostrerebbe per un attimo la cache stale pre-salvataggio).
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const markDirty = () => {
    dirtyRef.current = true;
    setDirty(true);
  };
  const clearDirty = () => {
    dirtyRef.current = false;
    setDirty(false);
  };

  // #12 — Export CSV
  const handleExportCSV = () => {
    // M-24 (audit): le label assi sono libere — una virgola o virgolette
    // nell'header rompevano il CSV esportato. Quoting RFC 4180.
    const q = (s: string) =>
      /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    const header = `${q(asseXLabel)},${q(asseYLabel)},prezzo_vendita,prezzo_acquisto`;
    const lines: string[] = [header];
    for (const x of xAxis) {
      for (const y of yAxis) {
        const c = cells.get(`${x}_${y}`);
        if (c) {
          lines.push(`${x},${y},${c.prezzo_vendita},${c.prezzo_acquisto}`);
        }
      }
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `listino-griglia-${familyId.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Esportate ${lines.length - 1} celle`);
  };

  // #12 — Import CSV
  const handleImportCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const esito = leggiCsvGriglia(String(e.target?.result || ""), prezzoBaseMode, cells);
        if (esito.vuoto) {
          toast.error("CSV vuoto o senza dati");
          return;
        }
        const note: string[] = [];
        if (esito.scartate > 0) {
          note.push(`${esito.scartate} righe ignorate (valori mancanti o non numerici).`);
        }
        if (esito.senzaAcquisto > 0) {
          note.push(`${esito.senzaAcquisto} righe senza prezzo di acquisto ignorate.`);
        }
        if (esito.misureNonIntere.length > 0) {
          const esempi = esito.misureNonIntere.slice(0, 3).map((m) => `«${m}»`).join(", ");
          note.push(`Misure non intere scartate (${esempi}): servono millimetri interi.`);
        }
        if (esito.importate === 0) {
          if (prezzoBaseMode === "acquisto_markup" && esito.senzaAcquisto > 0) {
            toast.error("Nel file manca il prezzo di acquisto", {
              description:
                "Questo prodotto ricava la vendita dal listino del fornitore: serve la colonna prezzo_acquisto (la quarta).",
            });
          } else {
            toast.error("Nessuna cella importata", { description: note.join(" ") || undefined });
          }
          return;
        }
        setXAxis(Array.from(new Set([...xAxis, ...esito.xs])).sort((a, b) => a - b));
        setYAxis(Array.from(new Set([...yAxis, ...esito.ys])).sort((a, b) => a - b));
        setCells(esito.celle);
        markDirty();
        toast.success(`Importate ${esito.importate} celle. Ricordati di salvare.`, {
          description: note.length > 0 ? note.join(" ") : undefined,
        });
      } catch (err) {
        toast.error("Non riesco a leggere il CSV", {
          description: messaggioErroreListino(err),
        });
      }
    };
    reader.readAsText(file);
  };

  // #13 — Storico modifiche prezzi
  // M-25 (audit): chiave nel registry queryKeys (era un literal ad-hoc mai
  // invalidato: lo storico restava stale fino al remount). Invalidata in
  // onSuccess del salvataggio griglia.
  const [historyOpen, setHistoryOpen] = useState(false);
  const {
    data: priceHistory = [],
    isError: historyError,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: queryKeys.articleFamilies.gridHistory(familyId),
    enabled: !!companyId && !!familyId && historyOpen,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "silvio_tool_lista_storico_prezzi_griglia",
        { p_company_id: companyId!, p_family_id: familyId, p_limit: 100 },
      );
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{
        id: string;
        valore_x: number;
        valore_y: number;
        prezzo_vendita: number;
        prezzo_acquisto: number;
        operation: string;
        changed_at: string;
      }>;
    },
    staleTime: 30 * 1000,
  });

  // Cambiando famiglia lo stato locale (assi/celle/dirty) della precedente
  // non è più valido: reset PRIMA che arrivino le righe della nuova, così il
  // bootstrap non viene saltato da un dirty rimasto della famiglia vecchia
  // (che farebbe salvare le celle sbagliate sulla famiglia nuova).
  useEffect(() => {
    dirtyRef.current = false;
    setDirty(false);
    setXAxis([]);
    setYAxis([]);
    setCells(new Map());
  }, [familyId]);

  // Bootstrap dallo stato server — SOLO senza modifiche locali pendenti.
  // React Query rifetcha `rows` anche su refocus finestra/invalidation:
  // senza la guardia ogni refetch ricostruiva assi+celle azzerando il lavoro
  // non salvato dell'utente. Dopo "Salva griglia" dirty torna false e il
  // refetch post-invalidate riallinea lo stato locale (id compresi).
  useEffect(() => {
    if (dirtyRef.current) return;
    const xs = Array.from(new Set(rows.map((r) => r.valore_x))).sort((a, b) => a - b);
    const ys = Array.from(new Set(rows.map((r) => r.valore_y))).sort((a, b) => a - b);
    const cellMap = new Map<string, Cell>();
    for (const r of rows) {
      cellMap.set(`${r.valore_x}_${r.valore_y}`, {
        prezzo_vendita: Number(r.prezzo_vendita),
        prezzo_acquisto: Number(r.prezzo_acquisto),
      });
    }
    setXAxis(xs);
    setYAxis(ys);
    setCells(cellMap);
  }, [rows]);

  // La guardia beforeunload di FamilyEditor copre solo i campi base della
  // famiglia, non la matrice (stato locale di questo componente).
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // M-23 (audit): parseInt troncava i decimali in silenzio ("62.5" → 62)
  // mentre l'import CSV usa parseFloat: un asse decimale importato non era
  // ricreabile a mano e i due percorsi divergevano. Parse allineato al CSV
  // (virgola decimale inclusa). Dal 05/10/2026 il decimale si legge per
  // rifiutarlo con un messaggio (problemaMisuraGriglia), non per troncarlo.
  const parseAxisValue = (raw: string): number => {
    let s = raw.trim();
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    return parseFloat(s);
  };

  const addX = () => {
    const v = parseAxisValue(newX);
    const problema = problemaMisuraGriglia(v);
    if (problema) {
      toast.error(`${asseXLabel} non valida`, { description: problema });
      return;
    }
    if (xAxis.includes(v)) {
      toast.error("Valore già presente");
      return;
    }
    setXAxis([...xAxis, v].sort((a, b) => a - b));
    setNewX("");
    markDirty();
  };

  const addY = () => {
    const v = parseAxisValue(newY);
    const problema = problemaMisuraGriglia(v);
    if (problema) {
      toast.error(`${asseYLabel} non valida`, { description: problema });
      return;
    }
    if (yAxis.includes(v)) {
      toast.error("Valore già presente");
      return;
    }
    setYAxis([...yAxis, v].sort((a, b) => a - b));
    setNewY("");
    markDirty();
  };

  const removeX = (v: number) => {
    setXAxis(xAxis.filter((x) => x !== v));
    setCells((prev) => {
      const next = new Map(prev);
      for (const k of Array.from(next.keys())) {
        if (k.startsWith(`${v}_`)) next.delete(k);
      }
      return next;
    });
    markDirty();
  };

  const removeY = (v: number) => {
    setYAxis(yAxis.filter((y) => y !== v));
    setCells((prev) => {
      const next = new Map(prev);
      for (const k of Array.from(next.keys())) {
        if (k.endsWith(`_${v}`)) next.delete(k);
      }
      return next;
    });
    markDirty();
  };

  // M-Q (audit): i prezzi negativi finivano in DB e l'input svuotato diventava
  // una cella a prezzo 0 (parseFloat("")||0) indistinguibile da un prezzo vero.
  // Ora i valori sono clampati a >= 0 e `null` (campo svuotato) azzera il campo;
  // se entrambi i campi restano a 0 la cella viene rimossa come col cestino.
  const parseCellInput = (raw: string): number | null =>
    raw.trim() === "" ? null : Math.max(0, parseFloat(raw) || 0);

  const setCell = (x: number, y: number, field: keyof Cell, value: number | null) => {
    setCells((prev) => {
      const next = new Map(prev);
      const curr = next.get(`${x}_${y}`) ?? { prezzo_vendita: 0, prezzo_acquisto: 0 };
      const updated = { ...curr, [field]: value === null ? 0 : Math.max(0, value) };
      if (value === null && updated.prezzo_vendita === 0 && updated.prezzo_acquisto === 0) {
        next.delete(`${x}_${y}`);
      } else {
        next.set(`${x}_${y}`, updated);
      }
      return next;
    });
    markDirty();
  };

  // Flag UI: sconti attivi = almeno uno dei due > 0. Stabile per riga →
  // evita ri-render inutili nelle celle.
  const scontiAttivi = scontoFornitore1 > 0 || scontoFornitore2 > 0;

  /**
   * Dato il prezzo di acquisto (LORDO se scontiAttivi, NETTO altrimenti)
   * restituisce { netto, vendita }. Usato sia nel rendering delle celle che
   * al salvataggio (prezzo_vendita = cache derivata, al centesimo).
   */
  const computeCellPrices = (prezzoAcquistoInput: number) =>
    prezziCellaDaAcquisto(prezzoAcquistoInput, {
      scontoFornitore1,
      scontoFornitore2,
      markupTipo,
      markupValore,
    });

  /**
   * Applica il payload del bulk import allo stato locale.
   *  - Unione ORDINATA degli assi: nuovi valori X/Y vengono aggiunti a quelli
   *    già presenti (non sovrascritti), così l'utente può mergere più
   *    importazioni sullo stesso articolo.
   *  - Per ogni cella parsata: scrive SOLO nel campo target scelto dall'utente
   *    (vendita o acquisto), preservando l'altro valore se esistente.
   *  - NON salva sul DB: l'utente rivede la matrice e clicca "Salva griglia".
   */
  const applyBulk = (payload: BulkParsedPayload) => {
    // Il campo che la modalità del prodotto legge davvero (05/10/2026): in
    // «acquisto_markup» la vendita scritta qui si perdeva al salvataggio,
    // ricalcolata da un acquisto rimasto a 0.
    const campo = campoImportoGriglia(prezzoBaseMode, payload.targetField);
    const mergedX = Array.from(new Set([...xAxis, ...payload.xAxis])).sort((a, b) => a - b);
    const mergedY = Array.from(new Set([...yAxis, ...payload.yAxis])).sort((a, b) => a - b);

    setXAxis(mergedX);
    setYAxis(mergedY);

    setCells((prev) => {
      const next = new Map(prev);
      for (const [key, value] of payload.values.entries()) {
        const curr = next.get(key) ?? { prezzo_vendita: 0, prezzo_acquisto: 0 };
        next.set(key, { ...curr, [campo]: value });
      }
      return next;
    });
    markDirty();

    // Solo costi importati in un prodotto a prezzo di vendita: le celle nuove
    // restano a vendita 0, e nel preventivo costerebbero 0.
    if (prezzoBaseMode === "vendita" && campo === "prezzo_acquisto") {
      const senzaVendita = Array.from(payload.values.keys()).filter(
        (k) => !((cells.get(k)?.prezzo_vendita ?? 0) > 0),
      ).length;
      if (senzaVendita > 0) {
        toast.warning(`${senzaVendita} celle senza prezzo di vendita`, {
          description: "Nel preventivo costerebbero 0 €: scrivi la vendita prima di salvare.",
        });
      }
    }
  };

  // Salvataggio: upsert-by-id + delete-by-diff (no empty window, no MatriceEditor loss)
  const saveGrid = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non identificata");

      // Misure non intere (05/10/2026): valore_x/valore_y sono INTEGER e il
      // database rifiutava tutto il salvataggio con un errore illeggibile.
      // Contano solo le misure con celle compilate, le sole che si salvano.
      const nonIntere = new Set<number>();
      for (const x of xAxis) {
        for (const y of yAxis) {
          if (!cells.has(`${x}_${y}`)) continue;
          if (!Number.isInteger(x)) nonIntere.add(x);
          if (!Number.isInteger(y)) nonIntere.add(y);
        }
      }
      if (nonIntere.size > 0) {
        const elenco = Array.from(nonIntere)
          .map((v) => v.toLocaleString("it-IT"))
          .join(", ");
        throw new Error(
          `Misure non intere (${elenco}): la griglia vuole millimetri interi. Togli queste misure e aggiungile senza decimali.`,
        );
      }

      // M-10 (audit): i prezzi vendita delle celle (mode acquisto_markup)
      // sono calcolati coi parametri sconti/markup dello STATE del form
      // parent: se non ancora salvati, celle e article_families.markup_*
      // divergerebbero in DB. Il parent li salva prima di procedere.
      if (onEnsureFamilySaved) {
        const ok = await onEnsureFamilySaved();
        if (!ok) {
          throw new Error(
            "Parametri dell'articolo non salvati: salva prima le impostazioni prezzo, poi la griglia.",
          );
        }
      }

      // Map (x_y) → id delle celle attualmente persistite (axis_config IS NULL).
      const existingByKey = new Map<string, GridRow>();
      for (const r of rows) {
        existingByKey.set(`${r.valore_x}_${r.valore_y}`, r);
      }

      // Costruisci payloads distinti per INSERT (nuove celle, no id) e UPDATE
      // (celle esistenti, con id). Splittare è necessario perché PostgREST
      // in un singolo .upsert() con shape miste propaga le chiavi: le righe
      // senza `id` ricevono `id: NULL` dal client → violazione NOT NULL del PK
      // (la DEFAULT gen_random_uuid() non si applica quando il valore è
      // esplicitamente NULL).
      type InsertRow = {
        company_id: string;
        family_id: string;
        valore_x: number;
        valore_y: number;
        prezzo_vendita: number;
        prezzo_acquisto: number;
      };
      type UpdateRow = InsertRow & { id: string };

      const toInsert: InsertRow[] = [];
      const toUpdate: UpdateRow[] = [];
      const keptKeys = new Set<string>();
      for (const x of xAxis) {
        for (const y of yAxis) {
          const key = `${x}_${y}`;
          const c = cells.get(key);
          if (!c) continue; // celle vuote = non persistite
          keptKeys.add(key);
          const existing = existingByKey.get(key);
          // In mode=acquisto_markup il prezzo_vendita è CACHE DERIVATA da
          // (lordo × sconti fornitore → netto × markup). Lo ricalcoliamo al
          // save per garantire sempre coerenza col markup configurato sulla
          // famiglia, arrotondato al centesimo come nei preventivi
          // (05/10/2026). In mode=vendita persistiamo l'input diretto.
          const prezzoVenditaFinale =
            prezzoBaseMode === "acquisto_markup"
              ? computeCellPrices(c.prezzo_acquisto).vendita
              : c.prezzo_vendita;
          const base: InsertRow = {
            company_id: companyId,
            family_id: familyId,
            valore_x: x,
            valore_y: y,
            prezzo_vendita: prezzoVenditaFinale,
            prezzo_acquisto: c.prezzo_acquisto,
          };
          if (existing) {
            toUpdate.push({ ...base, id: existing.id });
          } else {
            toInsert.push(base);
          }
        }
      }

      // Celle da eliminare = esistenti (axis_config NULL) il cui (x,y) non è
      // più presente nelle keptKeys. Delete scoped by id: non tocca MAI
      // celle multi-fascia (axis_config NOT NULL) né altre famiglie.
      const idsToDelete: string[] = [];
      for (const [key, r] of existingByKey.entries()) {
        if (!keptKeys.has(key)) idsToDelete.push(r.id);
      }

      // Step 1a: INSERT delle celle nuove (DB genera id via DEFAULT).
      // .select("id") per conoscere gli id creati: servono al rollback
      // compensativo se la fase di update fallisce (M-5 audit).
      let insertedIds: string[] = [];
      if (toInsert.length > 0) {
        const { data: insData, error: insErr } = await supabase
          .from("listino_griglia")
          .insert(toInsert)
          .select("id");
        if (insErr) throw new Error(`Errore inserimento celle: ${insErr.message}`);
        insertedIds = ((insData ?? []) as Array<{ id: string }>).map((r) => r.id);
      }

      // Step 1b: UPDATE delle celle esistenti via .update().eq('id', id) in
      // parallelo. NON si usa .upsert(): quando PostgREST vede un batch con
      // shape normalizzata (ad es. colonna axis_config omessa e id assente in
      // alcune normalizzazioni interne) pada a NULL, violando il PK. Con
      // .update() puro su filtro id la query è UPDATE esplicito, zero
      // ambiguità sulla constraint. Promise.all mantiene la latency bassa
      // anche con griglie grandi (266 celle × ~50ms ≈ 500ms in parallelo).
      //
      // M-5 (audit): niente più "primo errore e basta" — raccogliamo TUTTI
      // gli esiti e su fallimento parziale facciamo rollback compensativo
      // (revert delle celle aggiornate ai valori pre-save + delete delle
      // celle appena inserite) così il DB non resta misto vecchio/nuovo.
      if (toUpdate.length > 0) {
        // M-22 (audit): .select("id") sull'update per contare le righe toccate.
        // Senza, un update su una cella cancellata da un altro utente tocca 0
        // righe e "riesce" — perdita silenziosa in editing concorrente. La
        // cella sparita viene trattata come errore e finisce nel rollback.
        const updateResults = await Promise.all(
          toUpdate.map(({ id, ...data }) =>
            supabase
              .from("listino_griglia")
              .update(data)
              .eq("id", id)
              .eq("company_id", companyId)
              .select("id")
              .then((res) => ({
                id,
                error:
                  res.error ??
                  ((res.data ?? []).length === 0
                    ? { message: "cella eliminata da un altro utente" }
                    : null),
              })),
          ),
        );
        const failed = updateResults.filter((r) => r.error);
        if (failed.length > 0) {
          const succeededIds = new Set(
            updateResults.filter((r) => !r.error).map((r) => r.id),
          );
          const rollbacks: Array<PromiseLike<{ error: unknown }>> = [];
          for (const r of rows) {
            if (!succeededIds.has(r.id)) continue;
            rollbacks.push(
              supabase
                .from("listino_griglia")
                .update({
                  prezzo_vendita: r.prezzo_vendita,
                  prezzo_acquisto: r.prezzo_acquisto,
                })
                .eq("id", r.id)
                .eq("company_id", companyId),
            );
          }
          if (insertedIds.length > 0) {
            rollbacks.push(
              supabase.from("listino_griglia").delete().in("id", insertedIds),
            );
          }
          const rollbackResults = await Promise.all(rollbacks);
          const rollbackClean = rollbackResults.every((r) => !r.error);
          throw new Error(
            `${failed.length} celle su ${toUpdate.length} non aggiornate (${failed[0].error!.message}). ` +
              (rollbackClean
                ? "Le modifiche sono state annullate: la griglia in DB è quella precedente al salvataggio."
                : "Attenzione: non è stato possibile annullare tutte le modifiche — ricarica la pagina e verifica i prezzi."),
          );
        }
      }

      // Step 2: delete DOPO, solo celle effettivamente rimosse dall'utente.
      if (idsToDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("listino_griglia")
          .delete()
          .in("id", idsToDelete);
        if (delErr) {
          // Le scritture sono andate a buon fine ma il delete ha fallito: la
          // griglia contiene tutti i valori validi + eventuali celle stale.
          // L'utente può rilanciare il salvataggio in sicurezza.
          throw new Error(`Errore rimozione celle obsolete: ${delErr.message}`);
        }
      }

      return toInsert.length + toUpdate.length;
    },
    onSuccess: (count) => {
      toast.success(`Griglia salvata: ${count} celle`);
      // clearDirty PRIMA dell'invalidate: il refetch deve trovare la guardia
      // aperta per riallineare lo stato locale (id delle celle nuove inclusi).
      clearDirty();
      // grid(id) è il prefisso delle tre letture (editor, simulatore,
      // preventivo): le rinfresca tutte.
      qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.grid(familyId) });
      qc.invalidateQueries({
        queryKey: queryKeys.articleFamilies.gridHistory(familyId),
      });
      // Il preventivo serramenti legge la griglia con chiavi sue (5 minuti di
      // cache): senza questo un preventivo aperto continuava coi prezzi vecchi.
      invalidaListinoNelPreventivatore(qc);
    },
    onError: (err: Error) => {
      captureVelocityError("family.grid.save", err, { companyId, familyId });
      toast.error("Griglia non salvata", { description: messaggioErroreListino(err) });
    },
  });

  const totalCells = useMemo(() => xAxis.length * yAxis.length, [xAxis, yAxis]);
  const filledCells = cells.size;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Caricamento griglia…
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">
              Matrice prezzi {asseXLabel} × {asseYLabel}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Definisci le taglie standard. Ogni cella contiene prezzo vendita (€) e acquisto (€). Celle vuote = taglia non disponibile.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBulkOpen(true)}
            >
              <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
              Importa AI
            </Button>
            {/* #12 — Export CSV */}
            {/* Niente export su telefono. */}
            {!isMobile && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={cells.size === 0}
                title="Esporta CSV"
              >
                <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                Esporta CSV
              </Button>
            )}
            {/* #12 — Import CSV */}
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportCSV(f);
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" asChild>
                <span>
                  <FileUp className="h-4 w-4 mr-2" aria-hidden="true" />
                  Importa CSV
                </span>
              </Button>
            </label>
            {/* #13 — Storico prezzi */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen((s) => !s)}
              title="Storico modifiche prezzi"
            >
              <History className="h-4 w-4 mr-2" aria-hidden="true" />
              Storico
            </Button>
          </div>
        </div>
        {/* #13 — Pannello storico (toggle) */}
        {historyOpen ? (
          <div className="mt-3 border rounded-md bg-muted/20 max-h-60 overflow-y-auto">
            <div className="px-3 py-2 text-xs font-medium border-b sticky top-0 bg-muted/40">
              Ultime modifiche prezzi ({priceHistory.length})
            </div>
            {historyError ? (
              // M-33 (audit): in errore lo storico mostrava "nessuna modifica"
              // come se fosse il dato reale. Stato errore esplicito + Riprova.
              <div className="px-3 py-3 text-xs text-destructive flex items-center gap-2">
                Errore nel caricamento dello storico.
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => refetchHistory()}
                >
                  Riprova
                </Button>
              </div>
            ) : priceHistory.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                Nessuna modifica registrata. Lo storico parte dalle prime modifiche dopo l'attivazione.
              </p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-2 py-1 text-left">Quando</th>
                    <th className="px-2 py-1 text-left">Cella</th>
                    <th className="px-2 py-1 text-right">Vendita</th>
                    <th className="px-2 py-1 text-right">Acquisto</th>
                    <th className="px-2 py-1 text-left">Op</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.map((h) => (
                    <tr key={h.id} className="border-t">
                      <td className="px-2 py-1 font-mono">
                        {new Date(h.changed_at).toLocaleString("it-IT", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {h.valore_x}×{h.valore_y}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">
                        {formatCurrency(h.prezzo_vendita)}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {formatCurrency(h.prezzo_acquisto)}
                      </td>
                      <td className="px-2 py-1">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            h.operation === "DELETE"
                              ? "border-rose-300 text-rose-700"
                              : "border-amber-300 text-amber-700"
                          }`}
                        >
                          {h.operation}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Asse X */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{asseXLabel}</label>
          <div className="flex flex-wrap items-center gap-2">
            {xAxis.map((v) => (
              <Badge key={v} variant="secondary" className="gap-1">
                {v}
                <button
                  type="button"
                  onClick={() => removeX(v)}
                  className="ml-1 hover:text-destructive"
                  aria-label={`Rimuovi ${v}`}
                >
                  ×
                </button>
              </Badge>
            ))}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                inputMode="numeric"
                step={1}
                min={1}
                value={newX}
                onChange={(e) => setNewX(e.target.value)}
                placeholder="Aggiungi valore"
                className="w-32 h-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addX();
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={addX}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        {/* Asse Y */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{asseYLabel}</label>
          <div className="flex flex-wrap items-center gap-2">
            {yAxis.map((v) => (
              <Badge key={v} variant="secondary" className="gap-1">
                {v}
                <button
                  type="button"
                  onClick={() => removeY(v)}
                  className="ml-1 hover:text-destructive"
                  aria-label={`Rimuovi ${v}`}
                >
                  ×
                </button>
              </Badge>
            ))}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                inputMode="numeric"
                step={1}
                min={1}
                value={newY}
                onChange={(e) => setNewY(e.target.value)}
                placeholder="Aggiungi valore"
                className="w-32 h-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addY();
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={addY}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        {/* Matrice */}
        {xAxis.length > 0 && yAxis.length > 0 ? (
          <>
            {xAxis.length > 8 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span aria-hidden="true">←</span>
                Scorri orizzontalmente per vedere tutte le {xAxis.length} colonne
                <span aria-hidden="true">→</span>
              </p>
            )}
            <div className="border rounded-md overflow-x-auto overflow-y-auto max-h-[70vh] relative">
              {/* Table `w-max` — così cresce oltre il container e il wrapper overflow-x-auto abilita lo scroll orizzontale quando le colonne sono molte (19 × 120 = 2280 px). Senza `w-max` (o con `w-full`) il browser comprime le colonne sotto il min-width e lo scroll non appare. */}
              <table className="w-max text-sm border-collapse">
                <thead className="bg-muted/50 sticky top-0 z-20">
                  <tr>
                    <th className="p-2 text-left border-r border-b sticky left-0 bg-muted/50 z-30 min-w-[70px]">
                      {asseYLabel} \ {asseXLabel}
                    </th>
                    {xAxis.map((x) => (
                      <th
                        key={x}
                        className={`p-2 text-center border-r border-b ${
                          prezzoBaseMode === "acquisto_markup"
                            ? "min-w-[110px]"
                            : "min-w-[140px]"
                        }`}
                      >
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {yAxis.map((y) => (
                    <tr key={y} className="border-t">
                      <td className="p-2 font-medium border-r sticky left-0 bg-background z-10">
                        {y}
                      </td>
                      {xAxis.map((x) => {
                        const c = cells.get(`${x}_${y}`);
                        return (
                          <td key={x} className="p-1 border-r align-top">
                            <div className="flex items-center gap-1">
                              <div className="flex-1 flex flex-col gap-1">
                                {prezzoBaseMode === "acquisto_markup" ? (
                                  // Solo acquisto — netto + vendita derivati
                                  <>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder={
                                        scontiAttivi ? "Lordo €" : "Acq. €"
                                      }
                                      min={0}
                                      value={c?.prezzo_acquisto ?? ""}
                                      onChange={(e) =>
                                        setCell(
                                          x,
                                          y,
                                          "prezzo_acquisto",
                                          parseCellInput(e.target.value),
                                        )
                                      }
                                      className="h-7 text-xs"
                                    />
                                    {c && c.prezzo_acquisto > 0 ? (
                                      <div className="text-[10px] leading-tight text-muted-foreground px-1">
                                        {(() => {
                                          const { netto, vendita } = computeCellPrices(
                                            c.prezzo_acquisto,
                                          );
                                          return (
                                            <>
                                              {scontiAttivi ? (
                                                <div>
                                                  netto:{" "}
                                                  <span className="font-medium text-foreground/80">
                                                    {formatCurrency(netto)}
                                                  </span>
                                                </div>
                                              ) : null}
                                              {/* In mode=acquisto_markup mostriamo SEMPRE la vendita:
                                                  è il valore che davvero finisce al cliente, anche
                                                  quando coincide col netto (markup=none, sconti 0).
                                                  Dato visivo cruciale per il serramentista. */}
                                              <div>
                                                vendita:{" "}
                                                <span className="font-semibold text-primary">
                                                  {formatCurrency(vendita)}
                                                </span>
                                              </div>
                                            </>
                                          );
                                        })()}
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  // Entrambi — vendita sopra (principale), acquisto sotto (opzionale)
                                  <>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="Vend. €"
                                      min={0}
                                      value={c?.prezzo_vendita ?? ""}
                                      onChange={(e) =>
                                        setCell(
                                          x,
                                          y,
                                          "prezzo_vendita",
                                          parseCellInput(e.target.value),
                                        )
                                      }
                                      className="h-7 text-xs"
                                    />
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="Acq. €"
                                      min={0}
                                      value={c?.prezzo_acquisto ?? ""}
                                      onChange={(e) =>
                                        setCell(
                                          x,
                                          y,
                                          "prezzo_acquisto",
                                          parseCellInput(e.target.value),
                                        )
                                      }
                                      className="h-7 text-xs text-muted-foreground"
                                    />
                                  </>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setCells((prev) => {
                                    const next = new Map(prev);
                                    next.delete(`${x}_${y}`);
                                    return next;
                                  });
                                  markDirty();
                                }}
                                className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                                disabled={!c}
                                aria-label={`Svuota cella ${x}×${y}`}
                                title="Svuota cella"
                              >
                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
            Aggiungi valori alle due variabili per iniziare a compilare la matrice.
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground flex items-center gap-2">
            {filledCells} / {totalCells} celle compilate
            {dirty ? (
              <Badge
                variant="outline"
                className="border-amber-300 text-amber-700 text-[10px]"
              >
                Modifiche non salvate
              </Badge>
            ) : null}
          </span>
          <Button
            type="button"
            onClick={() => saveGrid.mutate()}
            disabled={saveGrid.isPending}
          >
            {saveGrid.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Salvataggio…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                Salva griglia
              </>
            )}
          </Button>
        </div>
      </CardContent>

      <GridBulkImportDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onApply={applyBulk}
        asseXLabel={asseXLabel}
        asseYLabel={asseYLabel}
        prezzoBaseMode={prezzoBaseMode}
      />
    </Card>
  );
}
