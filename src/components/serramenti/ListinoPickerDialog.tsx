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
  Layers, FolderOpen,
} from "lucide-react";
import {
  useListinoFamilies, useListinoGriglia, useTariffeManodopera,
  useMacrocategorie, useCategorieByMacro,
} from "@/lib/serramenti/queries";
import type {
  ListinoFamily, ListinoMacrocategoria, ListinoCategoria,
} from "@/lib/serramenti/api";
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
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: ListinoPickResult) => void;
}

// ─── Helpers calcolo prezzo (esportati per riuso in StepBom row) ───────────

export function calcolaPrezzoProdotto(
  family: ListinoFamily,
  larghezza: number | null,
  altezza: number | null,
  quantita: number,
  griglia: Array<{ id: string; valore_x: number | null; valore_y: number | null; prezzo_vendita: number | null }>,
): { prezzo: number; matchedGrigliaId: string | null; note: string | null } {
  const base = Number(family.prezzo_base_vendita ?? 0);
  const modalita = family.modalita_prezzo_base ?? "pz";

  switch (modalita) {
    case "pz":
      return { prezzo: base * quantita, matchedGrigliaId: null, note: null };
    case "mq": {
      if (!larghezza || !altezza) {
        return { prezzo: 0, matchedGrigliaId: null, note: "Inserisci larghezza e altezza per calcolo m²" };
      }
      const mq = (larghezza * altezza) / 1_000_000;
      return { prezzo: base * mq * quantita, matchedGrigliaId: null, note: `${mq.toFixed(2)} m² × €${base.toFixed(2)}/m²` };
    }
    case "misura_libera":
      return { prezzo: base * quantita, matchedGrigliaId: null, note: "Prezzo a corpo, misure indicative" };
    case "griglia": {
      if (!larghezza || !altezza) {
        return { prezzo: base * quantita, matchedGrigliaId: null, note: "Inserisci misure per leggere griglia" };
      }
      const candidates = griglia.filter((g) =>
        g.valore_x != null && g.valore_y != null && g.prezzo_vendita != null
        && g.valore_x >= larghezza && g.valore_y >= altezza
      );
      if (candidates.length === 0) {
        const maxPrezzo = griglia.reduce((m, g) => Math.max(m, Number(g.prezzo_vendita ?? 0)), 0);
        return {
          prezzo: maxPrezzo * quantita, matchedGrigliaId: null,
          note: `Misure fuori griglia — applicato prezzo max €${maxPrezzo.toFixed(2)}`,
        };
      }
      const best = candidates.reduce((min, g) =>
        Number(g.prezzo_vendita ?? Infinity) < Number(min.prezzo_vendita ?? Infinity) ? g : min,
      );
      const prezzoBest = Number(best.prezzo_vendita ?? 0);
      return {
        prezzo: prezzoBest * quantita, matchedGrigliaId: best.id,
        note: `Griglia ${best.valore_x}×${best.valore_y}mm @ €${prezzoBest.toFixed(2)}`,
      };
    }
    default:
      return { prezzo: base * quantita, matchedGrigliaId: null, note: null };
  }
}

function calcolaPosaInclusa(
  family: ListinoFamily,
  quantita: number,
  tariffePrezzi: Map<string, number>,
): number {
  const modalita = family.manodopera_modalita;
  if (!modalita || modalita === "nessuna") return 0;
  const qtyDefault = Number(family.posa_quantita_default ?? 1);
  const qtyTotale = quantita * qtyDefault;
  if (modalita === "tariffa" && family.posa_tariffa_default_id) {
    const prezzoTariffa = tariffePrezzi.get(family.posa_tariffa_default_id) ?? 0;
    return prezzoTariffa * qtyTotale;
  }
  if (modalita === "manuale") {
    return Number(family.manodopera_prezzo_vendita ?? 0) * qtyTotale;
  }
  return 0;
}

const MODALITA_LABEL: Record<string, string> = {
  pz: "a pezzo", mq: "a m²", misura_libera: "a corpo", griglia: "da griglia misure",
};

type Step = "macro" | "categoria" | "famiglia" | "misure";

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
  const [selectedCategoria, setSelectedCategoria] = useState<ListinoCategoria | null>(null);
  const [selectedFamily, setSelectedFamily] = useState<ListinoFamily | null>(null);
  const [larghezza, setLarghezza] = useState<string>("");
  const [altezza, setAltezza] = useState<string>("");
  const [quantita, setQuantita] = useState<string>("1");

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
      setSelectedMacro(null); setSelectedCategoria(null); setSelectedFamily(null);
      setLarghezza(""); setAltezza(""); setQuantita("1");
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
  const { data: categorie = [], isLoading: loadingCat } = useCategorieByMacro(selectedMacro?.id ?? null);
  const { data: families = [], isLoading: loadingFam } = useListinoFamilies({
    searchQuery: isSearching ? debounced : undefined,
    categoriaId: !isSearching && selectedCategoria ? selectedCategoria.id : undefined,
  });
  const { data: griglia = [], isLoading: loadingGriglia } = useListinoGriglia(selectedFamily?.id);
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

    const { prezzo: prezzoProdotto, matchedGrigliaId, note } =
      calcolaPrezzoProdotto(selectedFamily, l, h, q, griglia);
    const prezzoPosa = calcolaPosaInclusa(selectedFamily, q, tariffePrezzi);

    const totale = prezzoProdotto + prezzoPosa;
    const unitario = q > 0 ? totale / q : 0;

    return {
      larghezza: l, altezza: h, quantita: q,
      prezzo_prodotto: prezzoProdotto, prezzo_posa: prezzoPosa,
      totale, unitario, matchedGrigliaId, note,
    };
  }, [selectedFamily, larghezza, altezza, quantita, griglia, tariffePrezzi]);

  const richiedeMisure = selectedFamily && (
    selectedFamily.modalita_prezzo_base === "mq" ||
    selectedFamily.modalita_prezzo_base === "griglia"
  );

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleSelectMacro = (m: ListinoMacrocategoria) => {
    setSelectedMacro(m);
    setStep("categoria");
  };

  const handleSelectCategoria = (c: ListinoCategoria) => {
    setSelectedCategoria(c);
    setStep("famiglia");
  };

  const handleSelectFamily = (f: ListinoFamily) => {
    setSelectedFamily(f);
    setStep("misure");
  };

  const handleBack = () => {
    if (step === "misure") {
      setSelectedFamily(null);
      setStep("famiglia");
    } else if (step === "famiglia") {
      setSelectedCategoria(null);
      setStep("categoria");
    } else if (step === "categoria") {
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
    if (selectedCategoria) parts.push(selectedCategoria.nome);
    if (selectedFamily) parts.push(selectedFamily.nome);
    return parts.join(" › ") || "Listino";
  }, [isSearching, debounced, effectiveStep, selectedMacro, selectedCategoria, selectedFamily]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {(effectiveStep !== "macro" || isSearching) && !isSearching && (
              <Button size="icon" variant="ghost" onClick={handleBack} className="h-7 w-7">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {effectiveStep === "macro" && <Layers className="h-4 w-4 text-orange-700" />}
            {effectiveStep === "categoria" && <FolderOpen className="h-4 w-4 text-orange-700" />}
            {effectiveStep === "famiglia" && <Package className="h-4 w-4 text-orange-700" />}
            {effectiveStep === "misure" && <Ruler className="h-4 w-4 text-orange-700" />}
            <span className="flex-1 truncate">{breadcrumb}</span>
          </DialogTitle>
          <DialogDescription>
            {effectiveStep === "macro" && "Scegli la macrocategoria di prodotto"}
            {effectiveStep === "categoria" && "Scegli la categoria"}
            {effectiveStep === "famiglia" && (isSearching ? "Famiglie corrispondenti alla ricerca" : "Scegli il prodotto specifico")}
            {effectiveStep === "misure" && "Inserisci le misure: il prezzo è calcolato automaticamente"}
          </DialogDescription>
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {macros.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleSelectMacro(m)}
                    className="text-left p-3 rounded-md border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50/30 focus:outline-none focus:ring-2 focus:ring-orange-400 transition group"
                  >
                    <div className="flex items-start gap-3">
                      {m.immagine_url ? (
                        <img
                          src={m.immagine_url}
                          alt={m.nome}
                          className="h-12 w-12 shrink-0 rounded-md object-cover border bg-slate-50"
                        />
                      ) : (
                        <IconBox colore={m.colore} iconText={m.icona ? "📦" : "📦"} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{m.nome}</p>
                        {m.descrizione && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{m.descrizione}</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-orange-700 mt-1 shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── STEP CATEGORIA ──────────────────────────────────────────── */}
        {effectiveStep === "categoria" && (
          <div className="max-h-[55vh] overflow-y-auto">
            {loadingCat ? (
              <LoadingState />
            ) : categorie.length === 0 ? (
              <EmptyState
                icon={<FolderOpen className="h-10 w-10" />}
                text={`Nessuna categoria in "${selectedMacro?.nome ?? ""}". Configura le categorie nelle Impostazioni → Listino prodotti.`}
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {categorie.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCategoria(c)}
                    className="text-left rounded-md border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50/30 focus:outline-none focus:ring-2 focus:ring-orange-400 transition overflow-hidden group"
                  >
                    {c.immagine_url ? (
                      <img
                        src={c.immagine_url}
                        alt={c.nome}
                        className="w-full h-24 object-cover bg-muted"
                      />
                    ) : (
                      <div
                        className="w-full h-24 flex items-center justify-center text-3xl"
                        style={{
                          backgroundColor: c.colore ? `${c.colore}22` : "#10b98122",
                          color: c.colore ?? "#10b981",
                        }}
                      >
                        📁
                      </div>
                    )}
                    <div className="p-2.5 flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{c.nome}</p>
                        {c.descrizione && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1">{c.descrizione}</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-orange-700 mt-0.5 shrink-0" />
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
                        <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
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
              <p className="text-[11px] uppercase tracking-wide text-orange-700 font-semibold mb-1">
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

            {/* Riepilogo calcolo — il commerciale vede solo il totale, niente posa esposta */}
            {calcolo && (
              <Card className="border-orange-300 bg-orange-50/50 p-4">
                <p className="text-[11px] uppercase tracking-wide text-orange-700 font-semibold mb-2 flex items-center gap-1">
                  <Calculator className="h-3.5 w-3.5" /> Calcolo prezzo
                </p>
                <div className="space-y-1 text-xs">
                  {calcolo.note && (
                    <p className="text-[10px] text-muted-foreground italic">{calcolo.note}</p>
                  )}
                  <div className="border-t border-orange-300 pt-2 mt-2 flex justify-between items-center">
                    <span className="font-bold text-orange-900">Totale posizione</span>
                    <span className="text-xl font-bold text-orange-700 tabular-nums">
                      € {calcolo.totale.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-right">
                    Prezzo unitario: € {calcolo.unitario.toLocaleString("it-IT", { minimumFractionDigits: 2 })} × {calcolo.quantita} pz
                  </p>
                </div>
              </Card>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
          {effectiveStep === "misure" && (
            <Button
              onClick={handleConferma}
              className="bg-orange-700 hover:bg-orange-800"
              disabled={
                (richiedeMisure && (!larghezza || !altezza))
                || !calcolo || calcolo.totale <= 0
              }
            >
              Aggiungi al preventivo
            </Button>
          )}
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
