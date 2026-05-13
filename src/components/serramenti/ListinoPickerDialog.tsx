/**
 * ListinoPickerDialog — picker gerarchico del listino.
 *
 * Flusso 4 step (navigazione drill-down):
 *  1. Macrocategoria (es. Infissi, Persiane, Accessori)
 *  2. Categoria (es. Profilo da 70, Finestra 1 anta)
 *  3. Famiglia / prodotto (es. "COSTRUZIONE 2 IT — FINESTRA 1 ANTA")
 *  4. Misure libere + calcolo prezzo automatico
 *
 *  Search globale: digitando ≥ 2 caratteri salta direttamente alla
 *  vista famiglie cross-categoria.
 *
 *  La posa configurata sulla famiglia è inglobata nel totale ma NON
 *  esposta al commerciale (UX policy).
 */
import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Loader2, Search, Package, ArrowLeft, Ruler, Calculator, ChevronRight,
  Layers, FolderOpen, AlertCircle,
} from "lucide-react";
import {
  useListinoFamilies, useListinoGriglia, useTariffeManodopera,
  useMacrocategorie,
} from "@/lib/serramenti/queries";
import type {
  ListinoFamily, ListinoMacrocategoria,
} from "@/lib/serramenti/api";
import { useFamily } from "@/hooks/useFamilies";
import type { AxisSelection } from "@/types/articleFamily";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DynamicFieldsRenderer } from "@/components/listino/DynamicFieldsRenderer";

export interface ListinoPickResult {
  family_id: string;
  family_nome: string;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  quantita: number;
  prezzo_unitario: number | null;
  prezzo_prodotto: number | null;
  prezzo_posa: number | null;
  griglia_id?: string | null;
  note?: string | null;
  /** Snapshot scelte sugli ASSI (variabili prodotto) della family.
   *  Mappa { axis_codice -> axis_value_id }. Se l'azienda modifica le
   *  maggiorazioni dopo, il preventivo gia' inviato non cambia. */
  valori_assi: Record<string, string>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: ListinoPickResult) => void;
}

// ─── Helpers calcolo prezzo (esportati per riuso in StepBom row) ───────────

// Funzioni di pricing estratte in `@/lib/serramenti/pricing.ts` (rimosso
// re-export per silenziare i 4 warning react-refresh: HMR non supporta
// moduli che esportano sia componenti che funzioni). I consumer
// importano direttamente da `@/lib/serramenti/pricing`.
import {
  applyMaggiorazioniAssi,
  calcolaPrezzoProdotto,
  calcolaPosaInclusa,
} from "@/lib/serramenti/pricing";

const MODALITA_LABEL: Record<string, string> = {
  pz: "a pezzo", mq: "a m²", misura_libera: "a corpo", griglia: "da griglia misure",
};

// Post-refactor 20270513200000: step "categoria" eliminato — il flusso ora è
// Macro → Famiglia (articolo) → Misure. La gerarchia listino è collassata
// a 2 livelli.
type Step = "macro" | "famiglia" | "misure";

// ─── Helper: icon o fallback ────────────────────────────────────────────────

function IconBox({ colore, iconText }: { colore?: string | null; iconText: string }) {
  return (
    <div
      className="h-12 w-12 rounded-md flex items-center justify-center text-xl shrink-0"
      style={{
        backgroundColor: colore ? `${colore}22` : "#10b98122",
        color: colore ?? "#10b981",
      }}
    >
      {iconText}
    </div>
  );
}

// ─── Component principale ──────────────────────────────────────────────────

export function ListinoPickerDialog({ open, onOpenChange, onSelect }: Props) {
  const [step, setStep] = useState<Step>("macro");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedMacro, setSelectedMacro] = useState<ListinoMacrocategoria | null>(null);
  const [selectedFamily, setSelectedFamily] = useState<ListinoFamily | null>(null);
  const [larghezza, setLarghezza] = useState<string>("");
  const [altezza, setAltezza] = useState<string>("");
  const [quantita, setQuantita] = useState<string>("1");
  // Selezione assi (variabili prodotto): mappa axis.codice -> axis_value.id.
  // Pre-popolata con `is_default` quando la family viene caricata.
  // Reset al cambio famiglia / chiusura dialog.
  const [axisSelection, setAxisSelection] = useState<AxisSelection>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Search globale: se ≥2 caratteri, salta a vista famiglie filtrata cross-cat
  const isSearching = debounced.trim().length >= 2;

  useEffect(() => {
    if (!open) {
      setStep("macro");
      setSearch(""); setDebounced("");
      setSelectedMacro(null); setSelectedFamily(null);
      setLarghezza(""); setAltezza(""); setQuantita("1");
      setAxisSelection({});
    }
  }, [open]);

  // Quando l'utente cerca, mostriamo vista famiglie senza alterare il drill state
  const effectiveStep: Step = isSearching && step !== "misure" ? "famiglia" : step;

  // ─── Data fetch ──────────────────────────────────────────────────────────
  // Filtro vertical='serramentista': nel preventivo serramenti vediamo solo
  // macro etichettate per questo verticale (più le generiche con verticali_abilitati=[]).
  const { data: macros = [], isLoading: loadingMacros } = useMacrocategorie({
    vertical: "serramentista",
  });
  // Refactor 20270513200000: filtro famiglie direttamente per macrocategoria.
  // Niente più step categoria intermedio.
  const { data: families = [], isLoading: loadingFam } = useListinoFamilies({
    searchQuery: isSearching ? debounced : undefined,
    macroId: !isSearching && selectedMacro ? selectedMacro.id : undefined,
  });
  const { data: griglia = [], isLoading: loadingGriglia } = useListinoGriglia(selectedFamily?.id);
  // FamilyWithAxes: carica family + assi + valori. Serve per:
  //   - mostrare i dropdown delle variabili prodotto (assi) nel picker
  //   - applicare le maggiorazioni dei valori scelti al prezzo
  // Caricata solo allo step "misure" (selectedFamily presente).
  const { family: familyWithAxes, isLoading: loadingFamily } = useFamily(selectedFamily?.id);
  const axes = useMemo(
    () => (familyWithAxes?.axes ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    [familyWithAxes],
  );

  // Pre-popolamento default sugli assi al primo caricamento della family.
  // Pattern: per ogni asse, se non c'e' selezione e c'e' un value.is_default,
  // usalo. NON sovrascrive le scelte utente fatte in seguito.
  useEffect(() => {
    if (!familyWithAxes || axes.length === 0) return;
    setAxisSelection((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const a of axes) {
        if (next[a.codice]) continue;
        const def = a.values.find((v) => v.is_default && v.attivo);
        if (def) {
          next[a.codice] = def.id;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // axes-deps via familyWithAxes.id evita loop infinito su axes ref instabili
  }, [familyWithAxes, axes]);
  const { data: tariffe = [] } = useTariffeManodopera();

  const tariffePrezzi = useMemo(() => {
    const m = new Map<string, number>();
    tariffe.forEach((t) => { if (t.prezzo_vendita != null) m.set(t.id, Number(t.prezzo_vendita)); });
    return m;
  }, [tariffe]);

  // ─── Calcolo prezzo live ────────────────────────────────────────────────
  const calcolo = useMemo(() => {
    if (!selectedFamily) return null;
    const l = larghezza ? Number(larghezza) : null;
    const h = altezza ? Number(altezza) : null;
    const q = Math.max(1, Number(quantita) || 1);

    // 1. Prezzo BASE prodotto via la strategia consolidata
    //    `calcolaPrezzoProdotto` (filter "quadrante che contiene le misure",
    //    min prezzo). Resta source of truth per griglia/mq/pz.
    const calc = calcolaPrezzoProdotto(selectedFamily, l, h, q, griglia);

    // 2. Maggiorazioni assi (Variabili Prodotto) applicate SOPRA il prezzo
    //    base via `applyMaggiorazioniAssi` (replica della logica di
    //    `calcolaPrezzoFamiglia` ma senza switchare la strategia di lookup
    //    griglia che dava risultati incoerenti).
    const prezzoProdotto = familyWithAxes
      ? applyMaggiorazioniAssi(calc.prezzo, axisSelection, familyWithAxes.axes, l, h, q)
      : calc.prezzo;
    const extraAssi = prezzoProdotto - calc.prezzo;

    const prezzoPosa = calcolaPosaInclusa(selectedFamily, q, tariffePrezzi);
    const totale = prezzoProdotto + prezzoPosa;
    const unitario = q > 0 ? totale / q : 0;

    return {
      larghezza: l, altezza: h, quantita: q,
      prezzo_prodotto_base: calc.prezzo,
      prezzo_prodotto: prezzoProdotto,
      prezzo_posa: prezzoPosa,
      extra_assi: extraAssi,
      totale, unitario,
      matchedGrigliaId: calc.matchedGrigliaId,
      note: calc.note,
      fuoriRange: calc.fuoriRange ?? false,
      range: calc.range,
    };
  }, [selectedFamily, familyWithAxes, axisSelection, larghezza, altezza, quantita, griglia, tariffePrezzi]);

  const richiedeMisure = selectedFamily && (
    selectedFamily.modalita_prezzo_base === "mq" ||
    selectedFamily.modalita_prezzo_base === "griglia"
  );

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleSelectMacro = (m: ListinoMacrocategoria) => {
    setSelectedMacro(m);
    // Refactor 20270513200000: skip step categoria → direttamente alle famiglie
    setStep("famiglia");
  };

  const handleSelectFamily = (f: ListinoFamily) => {
    setSelectedFamily(f);
    setStep("misure");
    // Reset selezione assi su cambio famiglia (gli assi sono family-specific).
    // I default verranno applicati quando familyDetailWithAxes carica.
    setAxisSelection({});
  };

  const handleBack = () => {
    if (step === "misure") {
      setSelectedFamily(null);
      setStep("famiglia");
    } else if (step === "famiglia") {
      setSelectedMacro(null);
      setStep("macro");
    }
  };

  const handleConferma = () => {
    if (!selectedFamily || !calcolo) return;
    onSelect({
      family_id: selectedFamily.id,
      family_nome: selectedFamily.nome,
      larghezza_mm: calcolo.larghezza,
      altezza_mm: calcolo.altezza,
      quantita: calcolo.quantita,
      prezzo_unitario: calcolo.unitario,
      prezzo_prodotto: calcolo.prezzo_prodotto / calcolo.quantita,
      prezzo_posa: calcolo.prezzo_posa / calcolo.quantita,
      griglia_id: calcolo.matchedGrigliaId,
      note: calcolo.note,
      // Snapshot scelte assi: salvato sulla riga BOM in modo che modifiche
      // future al listino NON cambino i preventivi gia' inviati.
      valori_assi: { ...axisSelection },
    });
    onOpenChange(false);
  };

  // ─── Breadcrumb ──────────────────────────────────────────────────────────
  const breadcrumb = useMemo(() => {
    if (isSearching && effectiveStep !== "misure") {
      return `Risultati ricerca per "${debounced}"`;
    }
    const parts: string[] = [];
    if (selectedMacro) parts.push(selectedMacro.nome);
    if (selectedFamily) parts.push(selectedFamily.nome);
    return parts.join(" › ") || "Listino";
  }, [isSearching, debounced, effectiveStep, selectedMacro, selectedFamily]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* max-w-4xl: prima era 3xl ma con breadcrumb a 3 livelli (Macro › Cat ›
          Famiglia) + caratteristiche prodotto (4-5 chip) il dialog si
          impaginava male. 4xl dà respiro senza overflow. */}
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="space-y-1.5">
          {/* Riga 1: solo step icon + titolo step (corto), no breadcrumb.
              Breadcrumb pieno va in una riga dedicata sotto. */}
          <DialogTitle className="flex items-center gap-2 text-base">
            {(effectiveStep !== "macro" || isSearching) && !isSearching && (
              <Button size="icon" variant="ghost" onClick={handleBack} className="h-7 w-7 shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {effectiveStep === "macro" && <Layers className="h-4 w-4 text-orange-600 shrink-0" />}
            {effectiveStep === "categoria" && <FolderOpen className="h-4 w-4 text-orange-600 shrink-0" />}
            {effectiveStep === "famiglia" && <Package className="h-4 w-4 text-orange-600 shrink-0" />}
            {effectiveStep === "misure" && <Ruler className="h-4 w-4 text-orange-600 shrink-0" />}
            <span className="flex-1">
              {effectiveStep === "macro" && "Scegli macrocategoria"}
              {effectiveStep === "categoria" && (selectedMacro?.nome ?? "Scegli categoria")}
              {effectiveStep === "famiglia" && (isSearching ? `Ricerca: "${debounced}"` : (selectedMacro?.nome ?? "Scegli prodotto"))}
              {effectiveStep === "misure" && (selectedFamily?.nome ?? "Misure")}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {effectiveStep === "macro" && "Scegli la macrocategoria di prodotto"}
            {effectiveStep === "categoria" && "Scegli la categoria"}
            {effectiveStep === "famiglia" && (isSearching ? "Famiglie corrispondenti alla ricerca" : "Scegli il prodotto specifico")}
            {effectiveStep === "misure" && "Inserisci le misure: il prezzo è calcolato automaticamente"}
          </DialogDescription>
          {/* Breadcrumb compatto su riga dedicata: meno ingombrante del
              titolo, formattato come pill. Si mostra solo nei livelli ≥ cat. */}
          {(effectiveStep !== "macro" || isSearching) && (
            <div className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap pt-0.5">
              <span className="font-semibold uppercase tracking-wide">Percorso:</span>
              <span className="truncate max-w-full">{breadcrumb}</span>
            </div>
          )}
        </DialogHeader>

        {/* Search bar — visibile in tutti gli step tranne misure */}
        {effectiveStep !== "misure" && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca direttamente per nome prodotto…"
              className="pl-9 h-10"
            />
            {isSearching && (
              <button
                type="button"
                onClick={() => { setSearch(""); setDebounced(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Pulisci
              </button>
            )}
          </div>
        )}

        {/* ─── STEP MACROCATEGORIA ──────────────────────────────────────── */}
        {effectiveStep === "macro" && (
          <div className="max-h-[55vh] overflow-y-auto">
            {loadingMacros ? (
              <LoadingState />
            ) : macros.length === 0 ? (
              <EmptyState
                icon={<Layers className="h-10 w-10" />}
                text="Nessuna macrocategoria configurata. Vai in Impostazioni → Listino prodotti per crearle."
              />
            ) : (
              /* Card macrocategoria: layout verticale "catalog card".
                 - Foto IN ALTO 4:3 con object-contain (no crop) su bg
                   neutro -> articoli verticali (finestre/porte) si
                   vedono interi.
                 - Testo sotto con titolo + descrizione clampata.
                 - Frecciachevron in basso destra come affordance di
                   navigazione. */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {macros.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleSelectMacro(m)}
                    className="text-left rounded-lg border-2 border-slate-200 hover:border-orange-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-400 transition group overflow-hidden bg-white flex flex-col"
                  >
                    {m.immagine_url ? (
                      <div className="relative aspect-[4/3] bg-slate-50 border-b border-slate-100">
                        <img
                          src={m.immagine_url}
                          alt={m.nome}
                          className="absolute inset-0 w-full h-full object-contain p-2"
                        />
                      </div>
                    ) : (
                      <div className="relative aspect-[4/3] bg-slate-50 border-b border-slate-100 flex items-center justify-center">
                        <IconBox colore={m.colore} iconText="📦" />
                      </div>
                    )}
                    <div className="flex-1 p-3 flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate group-hover:text-orange-700 transition-colors">{m.nome}</p>
                        {m.descrizione && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">{m.descrizione}</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-orange-600 mt-0.5 shrink-0 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── STEP FAMIGLIA — grid con immagini prodotto ─────────────── */}
        {effectiveStep === "famiglia" && (
          <div className="max-h-[55vh] overflow-y-auto">
            {loadingFam ? (
              <LoadingState />
            ) : families.length === 0 ? (
              <EmptyState
                icon={<Package className="h-10 w-10" />}
                text={isSearching
                  ? `Nessun prodotto trovato per "${debounced}".`
                  : `Nessun prodotto in questa categoria.`
                }
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {families.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleSelectFamily(f)}
                    className="text-left rounded-md border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50/30 focus:outline-none focus:ring-2 focus:ring-orange-400 transition overflow-hidden group flex flex-col"
                  >
                    {f.immagine_url ? (
                      <img
                        src={f.immagine_url}
                        alt={f.nome}
                        className="w-full h-32 object-contain bg-slate-50"
                      />
                    ) : (
                      <div className="w-full h-32 flex items-center justify-center bg-slate-50 text-4xl text-slate-300">
                        <Package className="h-10 w-10" />
                      </div>
                    )}
                    <div className="p-2.5 flex flex-col gap-1 flex-1">
                      <p className="text-xs font-semibold text-slate-900 line-clamp-2 leading-tight">{f.nome}</p>
                      {f.descrizione && (
                        <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">{f.descrizione}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-auto pt-1 text-[9px]">
                        <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-medium">
                          {MODALITA_LABEL[f.modalita_prezzo_base ?? "pz"]}
                        </span>
                        {f.prezzo_base_vendita != null && Number(f.prezzo_base_vendita) > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                            €{Number(f.prezzo_base_vendita).toFixed(0)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── STEP MISURE + CALCOLO ─────────────────────────────────── */}
        {effectiveStep === "misure" && selectedFamily && (
          <div className="space-y-3">
            <Card className="bg-orange-50/30 border-orange-200 p-3">
              <p className="text-[11px] uppercase tracking-wide text-orange-600 font-semibold mb-1">
                Listino: {MODALITA_LABEL[selectedFamily.modalita_prezzo_base ?? "pz"]}
              </p>
              <p className="text-xs text-orange-900">
                {selectedFamily.modalita_prezzo_base === "pz" && "Prezzo fisso a pezzo. Le misure sono solo descrittive."}
                {selectedFamily.modalita_prezzo_base === "mq" && "Il prezzo si calcola sui m² → larghezza × altezza × prezzo/m²."}
                {selectedFamily.modalita_prezzo_base === "griglia" && "Listino a griglia: viene letto il prezzo della misura ≥ inserita."}
                {selectedFamily.modalita_prezzo_base === "misura_libera" && "Prezzo a corpo, misure solo informative."}
              </p>
            </Card>

            <div className="grid grid-cols-12 gap-3">
              <div className={richiedeMisure ? "col-span-4" : "col-span-6"}>
                <Label className="text-xs">Larghezza (mm)</Label>
                <Input
                  type="number" min={0}
                  value={larghezza}
                  onChange={(e) => setLarghezza(e.target.value)}
                  placeholder="es. 1200"
                  className="h-9"
                />
              </div>
              <div className={richiedeMisure ? "col-span-4" : "col-span-6"}>
                <Label className="text-xs">Altezza (mm)</Label>
                <Input
                  type="number" min={0}
                  value={altezza}
                  onChange={(e) => setAltezza(e.target.value)}
                  placeholder="es. 1400"
                  className="h-9"
                />
              </div>
              <div className="col-span-4">
                <Label className="text-xs">Quantità</Label>
                <Input
                  type="number" min={1}
                  value={quantita}
                  onChange={(e) => setQuantita(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            {loadingGriglia && selectedFamily.modalita_prezzo_base === "griglia" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Caricamento griglia prezzi…
              </p>
            )}

            {/* Scheda tecnica read-only: chiavi visibili (show_in_picker) della
                macrocategoria della famiglia selezionata. Si nasconde da sé se
                la macro non ha schema o se la famiglia non ha valori compilati. */}
            {selectedMacro && Object.keys(selectedFamily.custom_field_values ?? {}).length > 0 && (
              <Card className="bg-slate-50 border-slate-200 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-600 font-semibold mb-2">
                  Caratteristiche prodotto
                </p>
                <DynamicFieldsRenderer
                  macroId={selectedMacro.id}
                  values={selectedFamily.custom_field_values ?? {}}
                  mode="display"
                />
              </Card>
            )}

            {/* Range disponibile griglia: SEMPRE visibile in modalita' griglia,
                anche prima di inserire misure. Comunica subito al commerciale
                quali misure puo' offrire al cliente. */}
            {selectedFamily.modalita_prezzo_base === "griglia" && calcolo?.range && calcolo.range.minL != null && (
              <p className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded px-2.5 py-1.5">
                <span className="font-semibold">Misure disponibili:</span> da {calcolo.range.minL}×{calcolo.range.minH} mm a {calcolo.range.maxL}×{calcolo.range.maxH} mm
              </p>
            )}

            {/* Variabili Prodotto (axes): dropdown per ogni asse con i suoi
                valori. Mostra la maggiorazione associata al valore (es.
                "Antracite (+5%)"). Si nasconde se la family non ha assi.
                I valori default (is_default) sono pre-selezionati. */}
            {axes.length > 0 && (
              <Card className="border-slate-200 bg-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-700 font-semibold mb-2">
                  Variabili Prodotto
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {axes.map((axis) => {
                    const currentId = axisSelection[axis.codice];
                    const isMissing = axis.obbligatorio && !currentId;
                    return (
                      <div key={axis.id} className="space-y-1">
                        <Label className={
                          "text-[11px] flex items-center gap-1 " +
                          (isMissing ? "text-rose-700 font-semibold" : "text-slate-700")
                        }>
                          {axis.nome}
                          {axis.obbligatorio && <span className="text-rose-500">*</span>}
                        </Label>
                        <Select
                          value={currentId ?? ""}
                          onValueChange={(v) => setAxisSelection((prev) => ({ ...prev, [axis.codice]: v }))}
                        >
                          <SelectTrigger className={
                            "h-9 text-xs " + (isMissing ? "border-rose-300" : "")
                          }>
                            <SelectValue placeholder={isMissing ? "Da scegliere…" : "Seleziona…"} />
                          </SelectTrigger>
                          <SelectContent>
                            {axis.values.filter((v) => v.attivo).map((v) => {
                              const magg = v.maggiorazione_tipo === "none" || !v.maggiorazione_valore
                                ? ""
                                : v.maggiorazione_tipo === "percentuale"
                                  ? ` (+${v.maggiorazione_valore}%)`
                                  : ` (+€${Number(v.maggiorazione_valore).toLocaleString("it-IT", { minimumFractionDigits: 2 })}${v.maggiorazione_tipo === "fisso_mq" ? "/m²" : v.maggiorazione_tipo === "fisso_ml" ? "/ml" : ""})`;
                              return (
                                <SelectItem key={v.id} value={v.id} className="text-xs">
                                  {v.label}{magg}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Loading state della family con assi: mostra hint mentre carica */}
            {loadingFamily && axes.length === 0 && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 italic">
                <Loader2 className="h-3 w-3 animate-spin" /> Caricamento configurazione articolo…
              </p>
            )}

            {/* Riepilogo calcolo — il commerciale vede solo il totale, niente posa esposta */}
            {calcolo && !calcolo.fuoriRange && (
              <Card className="border-orange-300 bg-orange-50/50 p-4">
                <p className="text-[11px] uppercase tracking-wide text-orange-600 font-semibold mb-2 flex items-center gap-1">
                  <Calculator className="h-3.5 w-3.5" /> Calcolo prezzo
                </p>
                <div className="space-y-1 text-xs">
                  {calcolo.note && (
                    <p className="text-[10px] text-muted-foreground italic">{calcolo.note}</p>
                  )}
                  {calcolo.extra_assi !== 0 && (
                    <p className="text-[10px] text-blue-800">
                      Variabili prodotto: <span className="font-semibold">
                        {calcolo.extra_assi > 0 ? "+" : ""}€ {calcolo.extra_assi.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                      </span>
                    </p>
                  )}
                  <div className="border-t border-orange-300 pt-2 mt-2 flex justify-between items-center">
                    <span className="font-bold text-orange-900">Totale posizione</span>
                    <span className="text-xl font-bold text-orange-600 tabular-nums">
                      € {calcolo.totale.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-right">
                    Prezzo unitario: € {calcolo.unitario.toLocaleString("it-IT", { minimumFractionDigits: 2 })} × {calcolo.quantita} pz
                  </p>
                </div>
              </Card>
            )}

            {/* Stato OUT-OF-RANGE: misure non producibili dal listino.
                Blocca l'aggiunta al preventivo evitando vendita di articolo
                non realizzabile. */}
            {calcolo?.fuoriRange && (
              <Card className="border-rose-300 bg-rose-50 p-4">
                <p className="text-sm font-bold text-rose-800 mb-1 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> Misura non producibile
                </p>
                <p className="text-xs text-rose-700 leading-relaxed">
                  La misura inserita ({calcolo.larghezza}×{calcolo.altezza} mm) e' fuori dal range disponibile per questo articolo.
                  Modifica le misure entro l'intervallo indicato sopra.
                </p>
              </Card>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-3 mt-1 border-t">
          {/* Hint contestuale a sinistra solo nello step misure quando il
              bottone è disabled: prima il bottone disabled appariva sospeso
              senza spiegazione, ora l'utente sa subito cosa manca. */}
          <div className="text-[11px] text-muted-foreground">
            {effectiveStep === "misure" && richiedeMisure && (!larghezza || !altezza) && (
              <span>Inserisci larghezza e altezza per calcolare il prezzo.</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
            {effectiveStep === "misure" && (
              <Button
                onClick={handleConferma}
                className="bg-orange-500 hover:bg-orange-600"
                disabled={
                  (richiedeMisure && (!larghezza || !altezza))
                  || !calcolo || calcolo.totale <= 0
                  // Blocca aggiunta se misure fuori range producibile.
                  || calcolo.fuoriRange === true
                  // Blocca se ci sono assi obbligatori senza scelta.
                  || axes.some((a) => a.obbligatorio && !axisSelection[a.codice])
                }
              >
                Aggiungi al preventivo
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
      Caricamento…
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="py-10 text-center text-muted-foreground">
      <div className="mx-auto mb-2 opacity-30">{icon}</div>
      <p className="text-sm max-w-md mx-auto">{text}</p>
    </div>
  );
}
