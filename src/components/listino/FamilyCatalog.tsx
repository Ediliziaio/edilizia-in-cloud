/**
 * Preventivatore Verticalizzato Serramentisti — Catalogo articoli.
 *
 * Lista degli articoli (ex "famiglie") raggruppati nella gerarchia a 3
 * livelli:
 *
 *   MACROCATEGORIA (es. INFISSO MODELLO 1)
 *     └─ CATEGORIA (es. FINESTRA 1 ANTA)
 *         └─ ARTICOLO (con prezzi, griglia L×H, assi di variazione)
 *
 * Articoli con categoria orfana (categoria → senza macrocategoria) finiscono
 * nel gruppo "Senza macrocategoria". Articoli completamente privi di
 * categoria finiscono in "Senza categoria".
 *
 * La terminologia UI è stata unificata a "articoli": niente più distinzione
 * "famiglie vs articoli singoli" in UI, perché anche un articolo-tipo
 * semplice può essere rappresentato come famiglia senza assi.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  X as XIcon,
  Package,
  Loader2,
  CopyPlus,
  Trash2,
  Info,
  Folder,
  Trash,
  Undo2,
  ImageOff,
  FolderSymlink,
  ChevronDown,
  ChevronRight,
  Grid3x3,
  Ruler,
  Tag,
  Layers,
  Euro,
  TrendingUp,
  Percent,
  Wrench,
  ShoppingCart,
  ArrowDownRight,
  MoreVertical,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useFamilies, useFamiliesCestino } from "@/hooks/useFamilies";
import { useFamilyMutations } from "@/hooks/useFamilyMutations";
import { useListinoMacrocategorie } from "@/hooks/useListinoMacrocategorie";
import { useListinoCategorie } from "@/hooks/useListinoCategorie";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type {
  ArticleFamily,
  FamilyWithAxes,
  ModalitaPrezzoBase,
} from "@/types/articleFamily";
import { applyScontiFornitore, applyMarkup } from "@/lib/priceMarkup";

const MODALITA_LABEL: Record<ModalitaPrezzoBase, string> = {
  pz: "A pezzo",
  mq: "Al mq",
  griglia: "Griglia L×H",
  misura_libera: "Misura libera",
};

/** Formatter monetario EUR italiano (con 2 decimali). */
const fmtEUR = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Deriva i numeri economici "al pezzo" dalla famiglia, riusando la stessa
 * pipeline di calcolo del FamilyEditor (priceMarkup.ts):
 *
 *  - prezzo_base_mode === 'vendita':
 *      vendita = prezzo_base_vendita (input diretto)
 *      acquisto netto = prezzo_base_acquisto (se presente, per info)
 *      sconti fornitore ignorati (non applicabili in questa modalità)
 *
 *  - prezzo_base_mode === 'acquisto_markup':
 *      acquisto lordo = prezzo_base_acquisto (listino fornitore)
 *      acquisto netto = sconti in cascata sul lordo
 *      vendita = applyMarkup(acquisto netto, markup_tipo, markup_valore)
 *
 * `marginePct` è calcolato su vendita (convenzione coerente con priceMarkup.ts),
 * non su costo — questa è la "share" di ricarico rispetto al prezzo finale.
 *
 * Ritorna null per vendita/acquisto dove il dato è semanticamente assente (es.
 * modalità "vendita" senza campo acquisto) per poter rendere la UI condizionale.
 */
interface EconomicsPreview {
  venditaPz: number;
  acquistoNettoPz: number | null;
  acquistoLordoPz: number | null;
  scontiApplicati: { s1: number; s2: number } | null;
  margineEuro: number | null;
  marginePct: number | null;
  isMarkupMode: boolean;
}

type MarginFilter = "all" | "ok" | "low" | "missing";

function computeEconomics(f: FamilyWithAxes): EconomicsPreview {
  const isMarkupMode = f.prezzo_base_mode === "acquisto_markup";
  if (!isMarkupMode) {
    // Vendita diretta: acquisto è info opzionale (può essere 0).
    const venditaPz = Math.max(0, Number(f.prezzo_base_vendita) || 0);
    const acquistoRaw = Math.max(0, Number(f.prezzo_base_acquisto) || 0);
    const acquistoPz = acquistoRaw > 0 ? acquistoRaw : null;
    const margineEuro = acquistoPz != null ? venditaPz - acquistoPz : null;
    const marginePct =
      margineEuro != null && venditaPz > 0
        ? (margineEuro / venditaPz) * 100
        : null;
    return {
      venditaPz,
      acquistoNettoPz: acquistoPz,
      acquistoLordoPz: null,
      scontiApplicati: null,
      margineEuro,
      marginePct,
      isMarkupMode: false,
    };
  }

  // acquisto_markup: riutilizzo la stessa pipeline del FamilyEditor.
  const acquistoLordo = Math.max(0, Number(f.prezzo_base_acquisto) || 0);
  const s1 = Number(f.sconto_fornitore_1) || 0;
  const s2 = Number(f.sconto_fornitore_2) || 0;
  const acquistoNetto =
    s1 > 0 || s2 > 0 ? applyScontiFornitore(acquistoLordo, s1, s2) : acquistoLordo;
  const { prezzoVendita, margineEuro, marginePercentualeSuVendita } = applyMarkup({
    prezzoAcquisto: acquistoNetto,
    markupTipo: f.markup_tipo,
    markupValore: Number(f.markup_valore) || 0,
  });
  return {
    venditaPz: prezzoVendita,
    acquistoNettoPz: acquistoNetto,
    acquistoLordoPz: s1 > 0 || s2 > 0 ? acquistoLordo : null,
    scontiApplicati: s1 > 0 || s2 > 0 ? { s1, s2 } : null,
    margineEuro,
    marginePct: marginePercentualeSuVendita,
    isMarkupMode: true,
  };
}

function getMarginState(marginePct: number | null): Exclude<MarginFilter, "all"> {
  if (marginePct == null) return "missing";
  return marginePct >= 15 ? "ok" : "low";
}

function getMarginBadgeClass(marginePct: number | null): string {
  if (marginePct == null) {
    return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300";
  }
  if (marginePct < 0) {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300";
  }
  if (marginePct < 15) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300";
}

// Sentinel per raggruppamenti "senza X"
const NO_MACRO = "__no_macro__";
const NO_CAT = "__no_cat__";
const ALL_FILTER = "__all__";

interface CategoriaGroup {
  categoriaId: string; // id reale o NO_CAT
  categoriaNome: string;
  items: FamilyWithAxes[];
}

interface MacroGroup {
  macroId: string; // id reale o NO_MACRO
  macroNome: string;
  macroImmagineUrl: string | null;
  categorie: CategoriaGroup[];
  totalItems: number;
}

interface FamilyCatalogProps {
  /**
   * Azioni extra mostrate nell'header del catalogo (es. "Gestisci categorie",
   * "Importa"). Render-prop per evitare di hard-codare i bottoni della pagina
   * padre dentro questo componente riutilizzabile.
   */
  headerActions?: React.ReactNode;
}

export function FamilyCatalog({ headerActions }: FamilyCatalogProps = {}) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const { families, isLoading: loadingFamilies } = useFamilies();
  const {
    deleteFamily,
    restoreFamily,
    hardDeleteFamily,
    duplicateFamily,
    updateFamily,
  } = useFamilyMutations();
  const { macrocategorie } = useListinoMacrocategorie();
  const { categorie, isError: categorieError, refetch: refetchCategorie } =
    useListinoCategorie();

  const [search, setSearch] = useState("");
  const [macroFilter, setMacroFilter] = useState(ALL_FILTER);
  const [categoriaFilter, setCategoriaFilter] = useState(ALL_FILTER);
  const [modalitaFilter, setModalitaFilter] = useState<string>(ALL_FILTER);
  const [marginFilter, setMarginFilter] = useState<MarginFilter>("all");
  const [toDelete, setToDelete] = useState<FamilyWithAxes | null>(null);
  const [toDuplicate, setToDuplicate] = useState<FamilyWithAxes | null>(null);
  const [dupName, setDupName] = useState("");
  // "Sposta" dialog: l'articolo selezionato (null = chiuso) e la selezione
  // temporanea macro/cat controllata. Era un Popover annidato nella Card, ma
  // creava overflow orizzontale con 3 bottoni in orizzontale su griglia
  // densa. Un Dialog esterno e' piu' pulito e allineato a Duplica/Elimina.
  const [toMove, setToMove] = useState<FamilyWithAxes | null>(null);
  const [moveMacroId, setMoveMacroId] = useState<string>(NO_MACRO);
  const [moveCatId, setMoveCatId] = useState<string>(NO_CAT);
  // Cestino
  const [cestinoOpen, setCestinoOpen] = useState(false);
  const [toHardDelete, setToHardDelete] = useState<ArticleFamily | null>(null);
  const {
    cestino,
    isLoading: loadingCestino,
    refetch: refetchCestino,
  } = useFamiliesCestino();

  // Collapsed macrocategorie: persisted in localStorage così l'utente ritrova
  // lo stesso layout al refresh. Uso Set<string> di macroId (incluso NO_MACRO).
  // NOTE: se ls è bloccato (private mode) fallback a Set vuoto → tutto aperto.
  const LS_KEY = "listino:collapsed-macros";
  const [collapsedMacros, setCollapsedMacros] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });

  const toggleMacro = (macroId: string) => {
    setCollapsedMacros((prev) => {
      const next = new Set(prev);
      if (next.has(macroId)) next.delete(macroId);
      else next.add(macroId);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // ignore: ls non disponibile
      }
      return next;
    });
  };

  // Mappe lookup
  const categoriaById = useMemo(
    () => new Map(categorie.map((c) => [c.id, c])),
    [categorie],
  );
  const macroById = useMemo(
    () => new Map(macrocategorie.map((m) => [m.id, m])),
    [macrocategorie],
  );

  const filterCategorieDisponibili = useMemo(() => {
    if (macroFilter === ALL_FILTER) return categorie;
    if (macroFilter === NO_MACRO) return categorie.filter((c) => !c.macrocategoria_id);
    return categorie.filter((c) => c.macrocategoria_id === macroFilter);
  }, [categorie, macroFilter]);

  const hasActiveFilters =
    search.trim() !== "" ||
    macroFilter !== ALL_FILTER ||
    categoriaFilter !== ALL_FILTER ||
    modalitaFilter !== ALL_FILTER ||
    marginFilter !== "all";

  const resetFilters = () => {
    setSearch("");
    setMacroFilter(ALL_FILTER);
    setCategoriaFilter(ALL_FILTER);
    setModalitaFilter(ALL_FILTER);
    setMarginFilter("all");
  };

  // Grouping gerarchico macrocat → cat → articoli
  const grouped: MacroGroup[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = families.filter((f) => {
      const cat = f.categoria_id ? categoriaById.get(f.categoria_id) : null;
      const catId = cat?.id ?? NO_CAT;
      const macroId = cat?.macrocategoria_id ?? NO_MACRO;

      const matchesSearch =
        q === "" ||
        f.nome.toLowerCase().includes(q) ||
        (f.descrizione ?? "").toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (macroFilter !== ALL_FILTER && macroId !== macroFilter) return false;
      if (categoriaFilter !== ALL_FILTER && catId !== categoriaFilter) return false;
      if (modalitaFilter !== ALL_FILTER && f.modalita_prezzo_base !== modalitaFilter) {
        return false;
      }
      if (marginFilter !== "all") {
        const econ = computeEconomics(f);
        if (getMarginState(econ.marginePct) !== marginFilter) return false;
      }

      return true;
    });

    // macroId → (catId → items[])
    const bucket = new Map<string, Map<string, FamilyWithAxes[]>>();

    for (const f of filtered) {
      const cat = f.categoria_id ? categoriaById.get(f.categoria_id) : null;
      const catId = cat?.id ?? NO_CAT;
      const macroId = cat?.macrocategoria_id ?? NO_MACRO;

      if (!bucket.has(macroId)) bucket.set(macroId, new Map());
      const catMap = bucket.get(macroId)!;
      if (!catMap.has(catId)) catMap.set(catId, []);
      catMap.get(catId)!.push(f);
    }

    const result: MacroGroup[] = [];

    // Ordine: macrocategorie esistenti (per sort_order) + orfane + senza macro
    const macroOrder: string[] = [
      ...macrocategorie.map((m) => m.id),
      NO_MACRO,
    ];

    for (const macroId of macroOrder) {
      const catMap = bucket.get(macroId);
      if (!catMap || catMap.size === 0) continue;

      const macroRow = macroId === NO_MACRO ? null : macroById.get(macroId);
      const macroNome =
        macroId === NO_MACRO
          ? "Senza macrocategoria"
          : macroRow?.nome ?? "Macrocategoria sconosciuta";
      const macroImmagineUrl = macroRow?.immagine_url ?? null;

      // Ordina categorie per sort_order
      const catIdsSorted = Array.from(catMap.keys()).sort((a, b) => {
        if (a === NO_CAT) return 1;
        if (b === NO_CAT) return -1;
        const ca = categoriaById.get(a);
        const cb = categoriaById.get(b);
        const oa = ca?.sort_order ?? 0;
        const ob = cb?.sort_order ?? 0;
        if (oa !== ob) return oa - ob;
        return (ca?.nome ?? "").localeCompare(cb?.nome ?? "");
      });

      const categorieGroups: CategoriaGroup[] = catIdsSorted.map((catId) => {
        const items = catMap.get(catId)!;
        const nome =
          catId === NO_CAT
            ? "Senza categoria"
            : categoriaById.get(catId)?.nome ?? "Categoria sconosciuta";
        return { categoriaId: catId, categoriaNome: nome, items };
      });

      const totalItems = categorieGroups.reduce((sum, c) => sum + c.items.length, 0);
      result.push({ macroId, macroNome, macroImmagineUrl, categorie: categorieGroups, totalItems });
    }

    return result;
  }, [
    families,
    search,
    macroFilter,
    categoriaFilter,
    modalitaFilter,
    marginFilter,
    categoriaById,
    macroById,
    macrocategorie,
  ]);

  const handleDuplicate = async () => {
    if (!toDuplicate || !dupName.trim()) return;
    try {
      const newId = await duplicateFamily.mutateAsync({
        sourceId: toDuplicate.id,
        newName: dupName.trim(),
      });
      toast.success("Articolo duplicato");
      setToDuplicate(null);
      setDupName("");
      navigate(`/azienda/impostazioni/listino/famiglie/${newId}`);
    } catch (err) {
      toast.error("Errore duplicazione", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteFamily.mutateAsync(toDelete.id);
      toast.success("Articolo eliminato", {
        description:
          "Spostato nel cestino. Verra' rimosso definitivamente fra 15 giorni.",
      });
      setToDelete(null);
    } catch (err) {
      toast.error("Errore eliminazione", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  /**
   * Apre il Dialog "Sposta" preimpostando macro+cat correnti dell'articolo.
   * Evita di caricare i valori a ogni apertura → UX più fluida.
   */
  const openMove = (f: FamilyWithAxes) => {
    const currentCat = f.categoria_id ? categoriaById.get(f.categoria_id) : null;
    setMoveMacroId(currentCat?.macrocategoria_id ?? NO_MACRO);
    setMoveCatId(currentCat?.id ?? NO_CAT);
    setToMove(f);
  };

  /**
   * Applica lo spostamento: aggiorna solo categoria_id (la macrocategoria è
   * derivata dalla categoria stessa). Se l'utente sceglie "Senza categoria",
   * persistiamo NULL → l'articolo ricade nel gruppo "Senza macrocategoria".
   */
  const handleMove = async (familyId: string) => {
    try {
      const newCatId = moveCatId === NO_CAT ? null : moveCatId;
      await updateFamily.mutateAsync({
        id: familyId,
        patch: { categoria_id: newCatId } as never,
      });
      toast.success("Articolo spostato");
      setToMove(null);
    } catch (err) {
      toast.error("Errore spostamento", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  // Categorie filtrate per macro scelta nel popover "Sposta". Orfane (macro_id
  // NULL) restano disponibili solo quando l'utente sceglie "Senza macro".
  const moveCategorieDisponibili = useMemo(() => {
    if (moveMacroId === NO_MACRO) {
      return categorie.filter((c) => !c.macrocategoria_id);
    }
    return categorie.filter((c) => c.macrocategoria_id === moveMacroId);
  }, [categorie, moveMacroId]);

  const handleRestore = async (id: string) => {
    try {
      await restoreFamily.mutateAsync(id);
      toast.success("Articolo ripristinato");
    } catch (err) {
      toast.error("Errore ripristino", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  const handleHardDelete = async () => {
    if (!toHardDelete) return;
    try {
      await hardDeleteFamily.mutateAsync(toHardDelete.id);
      toast.success("Articolo eliminato definitivamente");
      setToHardDelete(null);
    } catch (err) {
      toast.error("Errore eliminazione definitiva", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  /**
   * Formatta il conto alla rovescia (15gg dalla cancellazione).
   * Se la data è nel passato (edge case teorico), mostra "oggi".
   */
  const formatTempoResiduo = (deletedAt: string): string => {
    const delta = Date.now() - new Date(deletedAt).getTime();
    const giorniPassati = Math.floor(delta / (1000 * 60 * 60 * 24));
    const giorniResidui = Math.max(0, 15 - giorniPassati);
    if (giorniResidui <= 0) return "eliminazione imminente";
    if (giorniResidui === 1) return "1 giorno residuo";
    return `${giorniResidui} giorni residui`;
  };

  const isLoading = loadingFamilies;

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-muted-foreground">
            Articoli
          </h2>
        </div>
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center lg:flex-nowrap">
          <div className="relative w-full lg:w-56 xl:w-72">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder="Cerca articolo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
              aria-label="Cerca articolo"
            />
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              {headerActions}
              {headerActions && <div className="hidden lg:block h-6 w-px bg-border mx-1" aria-hidden="true" />}
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setCestinoOpen(true);
                  void refetchCestino();
                }}
                className="h-10 w-10 relative"
                aria-label={`Apri cestino (${cestino.length} elementi)`}
                title={`Cestino${cestino.length > 0 ? ` (${cestino.length})` : ""}`}
              >
                <Trash className="h-4 w-4" aria-hidden="true" />
                {cestino.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                    {cestino.length}
                  </span>
                )}
              </Button>
              <Button
                onClick={() =>
                  navigate("/azienda/impostazioni/listino/famiglie/nuova")
                }
                className="h-10 bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-sm"
              >
                <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Nuovo articolo
              </Button>
            </div>
          )}
        </div>
      </header>

      {!isAdmin && (
        <div
          className="flex items-start gap-2 rounded-lg border border-muted bg-muted/30 p-3 text-sm text-muted-foreground"
          role="note"
        >
          <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Visualizzazione in sola lettura. Solo l&apos;amministratore
            dell&apos;azienda può creare, modificare o duplicare gli articoli.
          </p>
        </div>
      )}

      <Card className="border-muted">
        <CardContent className="p-3">
          <div className="grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="filter-macro" className="text-xs">
                Macrocategoria
              </Label>
              <Select
                value={macroFilter}
                onValueChange={(value) => {
                  setMacroFilter(value);
                  setCategoriaFilter(ALL_FILTER);
                }}
              >
                <SelectTrigger id="filter-macro" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>Tutte</SelectItem>
                  <SelectItem value={NO_MACRO}>Senza macrocategoria</SelectItem>
                  {macrocategorie.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="filter-categoria" className="text-xs">
                Categoria
              </Label>
              <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
                <SelectTrigger id="filter-categoria" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>Tutte</SelectItem>
                  <SelectItem value={NO_CAT}>Senza categoria</SelectItem>
                  {filterCategorieDisponibili.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-modalita" className="text-xs">
                Modalità prezzo
              </Label>
              <Select value={modalitaFilter} onValueChange={setModalitaFilter}>
                <SelectTrigger id="filter-modalita" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>Tutte</SelectItem>
                  {Object.entries(MODALITA_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filter-margine" className="text-xs">
                Margine
              </Label>
              <Select
                value={marginFilter}
                onValueChange={(value) => setMarginFilter(value as MarginFilter)}
              >
                <SelectTrigger id="filter-margine" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="ok">Margine OK</SelectItem>
                  <SelectItem value="low">Margine basso/negativo</SelectItem>
                  <SelectItem value="missing">Costo mancante</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 w-full text-muted-foreground hover:text-foreground"
                onClick={resetFilters}
                disabled={!hasActiveFilters}
              >
                <XIcon className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Azzera filtri
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {categorieError && (
        <div
          className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-3 text-sm"
          role="alert"
        >
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <Info
              className="h-4 w-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p className="text-amber-900 dark:text-amber-100 font-medium">
                Impossibile caricare le categorie
              </p>
              <p className="text-amber-800/90 dark:text-amber-200/90 text-xs mt-0.5">
                Gli articoli sono mostrati senza raggruppamento. Riprova tra qualche secondo.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetchCategorie()}
            className="h-9 shrink-0 w-full sm:w-auto"
          >
            Riprova
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
          Caricamento…
        </div>
      ) : families.length === 0 ? (
        <Card>
          <CardContent className="py-10 sm:py-14 text-center px-4">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" aria-hidden="true" />
            <p className="font-medium">Nessun articolo in listino</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              {isAdmin
                ? "Crea il tuo primo articolo per iniziare a preventivare. Prima conviene definire almeno una macrocategoria e una categoria."
                : "L'amministratore non ha ancora configurato articoli in listino."}
            </p>
            {isAdmin && (
              <Button
                className="mt-4 h-10 w-full sm:w-auto"
                onClick={() => navigate("/azienda/impostazioni/listino/famiglie/nuova")}
              >
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                Crea articolo
              </Button>
            )}
          </CardContent>
        </Card>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground space-y-3">
            <p>Nessun articolo corrisponde ai filtri.</p>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9">
                Pulisci filtri
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map((macroGroup) => {
            const isCollapsed = collapsedMacros.has(macroGroup.macroId);
            return (
            <section key={macroGroup.macroId} className="space-y-4">
              {/* Header macrocategoria — clickable toggle collapse/expand */}
              <button
                type="button"
                onClick={() => toggleMacro(macroGroup.macroId)}
                className="w-full flex items-center gap-3 pb-2 border-b-2 border-orange-200/60 dark:border-orange-900/30 hover:border-orange-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40 focus-visible:rounded transition-colors text-left group/macro"
                aria-expanded={!isCollapsed}
                aria-controls={`macro-panel-${macroGroup.macroId}`}
              >
                {isCollapsed ? (
                  <ChevronRight
                    className="h-5 w-5 text-orange-500/80 group-hover/macro:text-orange-600 transition-transform shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <ChevronDown
                    className="h-5 w-5 text-orange-500/80 group-hover/macro:text-orange-600 transition-transform shrink-0"
                    aria-hidden="true"
                  />
                )}
                {/* Thumb macrocategoria: foto se presente, fallback icona Folder */}
                {macroGroup.macroImmagineUrl ? (
                  <img
                    src={macroGroup.macroImmagineUrl}
                    alt=""
                    className="h-10 w-10 rounded-md object-cover border border-orange-200 dark:border-orange-900/50 shrink-0 shadow-sm"
                    aria-hidden="true"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-md bg-gradient-to-br from-orange-100 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/20 border border-orange-200 dark:border-orange-900/50 flex items-center justify-center shrink-0">
                    <Folder className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
                  </div>
                )}
                <h3 className="text-lg font-semibold tracking-tight min-w-0 truncate">
                  {macroGroup.macroNome}
                </h3>
                <Badge
                  variant="outline"
                  className="ml-1 border-orange-200 bg-orange-50/50 text-orange-600 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300 shrink-0"
                >
                  {macroGroup.totalItems}{" "}
                  {macroGroup.totalItems === 1 ? "articolo" : "articoli"}
                </Badge>
              </button>

              {/* Articoli dentro la macrocategoria — flat grid orizzontale.
                  Le categorie non sono più sezioni separate: il nome della
                  categoria diventa una chip inline sulla card, così la
                  stessa riga ospita articoli di categorie diverse e si vede
                  molto di più a parità di altezza pagina. */}
              {!isCollapsed && (
              <div id={`macro-panel-${macroGroup.macroId}`} className="pl-0 sm:pl-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {macroGroup.categorie.flatMap((catGroup) =>
                    catGroup.items.map((f) => {
                      const nAssi = f.axes.length;
                      const nValori = f.axes.reduce(
                        (sum, a) => sum + a.values.length,
                        0,
                      );
                      const catName = catGroup.categoriaNome;
                      const macroName = macroGroup.macroNome;
                      const econ = computeEconomics(f);
                      return (
                        <HoverCard
                          key={f.id}
                          openDelay={2000}
                          closeDelay={150}
                        >
                          <HoverCardTrigger asChild>
                          <Card
                            className={
                              isAdmin
                                ? "group relative h-full cursor-pointer hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-all flex flex-col"
                                : "h-full flex flex-col"
                            }
                            onClick={
                              isAdmin
                                ? () =>
                                    navigate(
                                      `/azienda/impostazioni/listino/famiglie/${f.id}`,
                                    )
                                : undefined
                            }
                            role={isAdmin ? "button" : undefined}
                            tabIndex={isAdmin ? 0 : undefined}
                            aria-label={isAdmin ? `Apri articolo ${f.nome}` : undefined}
                            onKeyDown={
                              isAdmin
                                ? (e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      navigate(
                                        `/azienda/impostazioni/listino/famiglie/${f.id}`,
                                      );
                                    }
                                  }
                                : undefined
                            }
                          >
                            <CardHeader className="pb-3">
                              {/* Thumbnail articolo: visibile solo se esiste un
                                  immagine_url, così niente placeholder vuoto
                                  che sprecava spazio verticale prezioso. */}
                              {f.immagine_url ? (
                                <div className="relative -mt-3 sm:-mt-4 -mx-6 mb-3 aspect-[4/3] bg-muted rounded-t-lg overflow-hidden">
                                  <img
                                    src={f.immagine_url}
                                    alt={`Anteprima ${f.nome}`}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                      // Fallback: nascondi img se URL invalido
                                      (e.target as HTMLImageElement).style.display =
                                        "none";
                                    }}
                                  />
                                </div>
                              ) : null}
                              <div className="flex items-start justify-between gap-2">
                                <CardTitle
                                  className="text-sm sm:text-base leading-tight line-clamp-2 min-w-0 break-words"
                                  title={f.nome}
                                >
                                  {f.nome}
                                </CardTitle>
                                <Badge
                                  variant="secondary"
                                  className="shrink-0 whitespace-nowrap"
                                >
                                  {MODALITA_LABEL[f.modalita_prezzo_base]}
                                </Badge>
                              </div>
                              {f.descrizione ? (
                                <CardDescription
                                  className="line-clamp-1"
                                  title={f.descrizione}
                                >
                                  {f.descrizione}
                                </CardDescription>
                              ) : null}
                            </CardHeader>
                            <CardContent className="pt-0 space-y-2 mt-auto">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span
                                  className="inline-flex items-center gap-1 max-w-full"
                                  title={`Categoria: ${catName}`}
                                >
                                  <Tag
                                    className="h-3 w-3 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">{catName}</span>
                                </span>
                                <span
                                  className="inline-flex items-center gap-1"
                                  title="Unità di misura"
                                >
                                  <Ruler
                                    className="h-3 w-3"
                                    aria-hidden="true"
                                  />
                                  {f.unit_of_measure}
                                </span>
                                {nAssi > 0 && (
                                  <span
                                    className="inline-flex items-center gap-1"
                                    title={`${nAssi} ${nAssi === 1 ? "variabile" : "variabili"} · ${nValori} ${nValori === 1 ? "valore" : "valori"}`}
                                  >
                                    <Grid3x3
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                    {nAssi}×{nValori}
                                  </span>
                                )}
                              </div>
                              {econ.venditaPz > 0 ? (
                                <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-2.5 py-2 text-xs">
                                  <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                                    <Euro className="h-3.5 w-3.5" aria-hidden="true" />
                                    {fmtEUR.format(econ.venditaPz)}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={`shrink-0 font-medium ${getMarginBadgeClass(econ.marginePct)}`}
                                  >
                                    {econ.marginePct == null
                                      ? "Costo mancante"
                                      : `Margine ${econ.marginePct.toFixed(1)}%`}
                                  </Badge>
                                </div>
                              ) : null}
                              {/* Alert MANODOPERA NON CONFIGURATA:
                                  Se l'articolo non ha mai avuto la sezione
                                  Step 4 salvata (manodopera_modalita = null),
                                  il commerciale rischia di aggiungere l'articolo
                                  al preventivo senza posa. Lo segnaliamo qui
                                  per spingerlo a configurare ESPLICITAMENTE
                                  "nessuna" (= scelta consapevole) oppure una
                                  tariffa/importo manuale. Banner amber
                                  (warning, non error). */}
                              {f.manodopera_modalita == null && (
                                <div
                                  className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800"
                                  title="Apri l'articolo e configura Step 4 → Manodopera"
                                >
                                  <AlertTriangle
                                    className="h-3 w-3 shrink-0 mt-px"
                                    aria-hidden="true"
                                  />
                                  <span className="leading-tight">
                                    <strong>Manodopera non configurata</strong> — apri Step 4
                                    e scegli Tariffa / Manuale / Nessuna.
                                  </span>
                                </div>
                              )}
                            </CardContent>
                            {/* Kebab menu (⋮) in top-right della Card: compatta
                                le 3 azioni (Duplica/Sposta/Elimina) in un
                                singolo trigger che non sforza lo spazio
                                orizzontale. Su desktop: hidden finche' la card
                                non e' in hover/focus (coerente con l'idea di
                                UI pulita). Su mobile/touch: sempre visibile
                                perche' non c'e' hover. */}
                            {isAdmin && (
                              <div
                                className="absolute top-2 right-2 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-sm hover:bg-background border border-border/40"
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => {
                                        // Impedisce che Enter/Space sul kebab
                                        // triggeri la navigazione della Card.
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.stopPropagation();
                                        }
                                      }}
                                      aria-label={`Azioni per ${f.nome}`}
                                    >
                                      <MoreVertical
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                      />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setToDuplicate(f);
                                        setDupName(`${f.nome} (copia)`);
                                      }}
                                    >
                                      <CopyPlus
                                        className="h-4 w-4 mr-2"
                                        aria-hidden="true"
                                      />
                                      Duplica
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openMove(f);
                                      }}
                                    >
                                      <FolderSymlink
                                        className="h-4 w-4 mr-2"
                                        aria-hidden="true"
                                      />
                                      Sposta
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setToDelete(f);
                                      }}
                                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                    >
                                      <Trash2
                                        className="h-4 w-4 mr-2"
                                        aria-hidden="true"
                                      />
                                      Elimina
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                          </Card>
                          </HoverCardTrigger>
                          <HoverCardContent
                            className="w-80"
                            side="top"
                            align="start"
                            sideOffset={8}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="space-y-3">
                              {f.immagine_url ? (
                                <img
                                  src={f.immagine_url}
                                  alt=""
                                  className="w-full aspect-[4/3] rounded object-cover bg-muted"
                                  loading="lazy"
                                />
                              ) : null}
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                  <Folder
                                    className="h-3 w-3 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">{macroName}</span>
                                  <span aria-hidden="true">›</span>
                                  <span className="truncate">{catName}</span>
                                </p>
                                <h4 className="font-semibold text-sm leading-snug">
                                  {f.nome}
                                </h4>
                                {f.descrizione ? (
                                  <p className="text-xs text-muted-foreground">
                                    {f.descrizione}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <Badge variant="secondary" className="text-[10px]">
                                  {MODALITA_LABEL[f.modalita_prezzo_base]}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  UM: {f.unit_of_measure}
                                </Badge>
                                {f.vat_rate != null ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    IVA vend. {f.vat_rate}%
                                  </Badge>
                                ) : null}
                                {econ.isMarkupMode &&
                                f.vat_rate_acquisto != null &&
                                f.vat_rate_acquisto !== f.vat_rate ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    IVA acq. {f.vat_rate_acquisto}%
                                  </Badge>
                                ) : null}
                                {/* Badge alert manodopera non configurata
                                    (vista lista — versione compatta) */}
                                {f.manodopera_modalita == null && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] border-amber-300 bg-amber-50 text-amber-800 gap-1"
                                    title="Manodopera non configurata: apri Step 4 dell'articolo"
                                  >
                                    <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                                    Manodopera non configurata
                                  </Badge>
                                )}
                              </div>
                              {/* Sezione Economia — margini e costi al pezzo.
                                  Visibile sempre che ci sia almeno un dato utile
                                  (vendita > 0). Serve al commerciale che vuole
                                  capire a colpo d'occhio margine e ricarico. */}
                              {econ.venditaPz > 0 ? (
                                <div className="space-y-1.5 pt-1 border-t">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
                                    <Euro
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                    Economia · al{" "}
                                    {f.unit_of_measure || "pz"}
                                  </p>
                                  <ul className="space-y-0.5 text-xs">
                                    <li className="flex items-baseline justify-between gap-2">
                                      <span className="text-muted-foreground inline-flex items-center gap-1">
                                        <TrendingUp
                                          className="h-3 w-3"
                                          aria-hidden="true"
                                        />
                                        Vendita
                                      </span>
                                      <span className="font-semibold tabular-nums">
                                        {fmtEUR.format(econ.venditaPz)}
                                      </span>
                                    </li>
                                    {econ.acquistoNettoPz != null ? (
                                      <li className="flex items-baseline justify-between gap-2">
                                        <span className="text-muted-foreground inline-flex items-center gap-1">
                                          <ShoppingCart
                                            className="h-3 w-3"
                                            aria-hidden="true"
                                          />
                                          Costo{econ.isMarkupMode ? " netto" : ""}
                                        </span>
                                        <span className="tabular-nums">
                                          {fmtEUR.format(econ.acquistoNettoPz)}
                                        </span>
                                      </li>
                                    ) : null}
                                    {econ.acquistoLordoPz != null &&
                                    econ.scontiApplicati ? (
                                      <li className="flex items-baseline justify-between gap-2">
                                        <span className="text-muted-foreground/80 inline-flex items-center gap-1 pl-4">
                                          <ArrowDownRight
                                            className="h-3 w-3"
                                            aria-hidden="true"
                                          />
                                          Listino -{econ.scontiApplicati.s1}%
                                          {econ.scontiApplicati.s2 > 0
                                            ? ` -${econ.scontiApplicati.s2}%`
                                            : ""}
                                        </span>
                                        <span className="text-muted-foreground/80 tabular-nums">
                                          {fmtEUR.format(econ.acquistoLordoPz)}
                                        </span>
                                      </li>
                                    ) : null}
                                    {econ.margineEuro != null ? (
                                      <li className="flex items-baseline justify-between gap-2">
                                        <span className="text-muted-foreground inline-flex items-center gap-1">
                                          <Percent
                                            className="h-3 w-3"
                                            aria-hidden="true"
                                          />
                                          Margine
                                        </span>
                                        <span
                                          className={
                                            econ.margineEuro > 0
                                              ? "font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
                                              : econ.margineEuro < 0
                                                ? "font-semibold tabular-nums text-destructive"
                                                : "font-semibold tabular-nums"
                                          }
                                        >
                                          {fmtEUR.format(econ.margineEuro)}
                                          {econ.marginePct != null
                                            ? ` · ${econ.marginePct.toFixed(1)}%`
                                            : ""}
                                        </span>
                                      </li>
                                    ) : null}
                                    {econ.isMarkupMode &&
                                    f.markup_tipo !== "none" ? (
                                      <li className="flex items-baseline justify-between gap-2">
                                        <span className="text-muted-foreground inline-flex items-center gap-1">
                                          <TrendingUp
                                            className="h-3 w-3"
                                            aria-hidden="true"
                                          />
                                          Markup
                                        </span>
                                        <span className="tabular-nums">
                                          {f.markup_tipo === "percentuale"
                                            ? `+${Number(f.markup_valore).toFixed(1)}%`
                                            : `+${fmtEUR.format(Number(f.markup_valore) || 0)}/pz`}
                                        </span>
                                      </li>
                                    ) : null}
                                  </ul>
                                </div>
                              ) : null}
                              {/* Manodopera: visibile solo in modalita' manuale
                                  (per "tariffa" il prezzo dipende dalla tariffa
                                  aziendale separata; per "nessuna" non c'e'
                                  niente da mostrare). */}
                              {f.manodopera_modalita === "manuale" &&
                              (f.manodopera_prezzo_vendita > 0 ||
                                f.manodopera_costo_acquisto > 0) ? (
                                <div className="space-y-1.5 pt-1 border-t">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
                                    <Wrench
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                    Manodopera · al {f.manodopera_unita}
                                  </p>
                                  <ul className="space-y-0.5 text-xs">
                                    <li className="flex items-baseline justify-between gap-2">
                                      <span className="text-muted-foreground">
                                        Vendita
                                      </span>
                                      <span className="font-semibold tabular-nums">
                                        {fmtEUR.format(
                                          Number(f.manodopera_prezzo_vendita) || 0,
                                        )}
                                      </span>
                                    </li>
                                    {f.manodopera_costo_acquisto > 0 ? (
                                      <li className="flex items-baseline justify-between gap-2">
                                        <span className="text-muted-foreground">
                                          Costo
                                        </span>
                                        <span className="tabular-nums">
                                          {fmtEUR.format(
                                            Number(f.manodopera_costo_acquisto) ||
                                              0,
                                          )}
                                        </span>
                                      </li>
                                    ) : null}
                                  </ul>
                                </div>
                              ) : null}
                              {f.axes.length > 0 ? (
                                <div className="space-y-1.5 pt-1 border-t">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
                                    <Layers
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                    Variabili Prodotto
                                  </p>
                                  <ul className="space-y-0.5 text-xs">
                                    {f.axes.map((a) => (
                                      <li
                                        key={a.id}
                                        className="flex items-baseline justify-between gap-2"
                                      >
                                        <span className="truncate">{a.nome}</span>
                                        <span className="text-muted-foreground shrink-0">
                                          {a.values.length}{" "}
                                          {a.values.length === 1
                                            ? "valore"
                                            : "valori"}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              <p className="text-[10px] text-muted-foreground/70 pt-1 border-t">
                                Click per aprire il dettaglio articolo
                              </p>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </section>
            );
          })}
        </div>
      )}

      {/* Dialog duplica */}
      <Dialog
        open={!!toDuplicate}
        onOpenChange={(open) => {
          if (duplicateFamily.isPending) return;
          if (!open) {
            setToDuplicate(null);
            setDupName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplica articolo</DialogTitle>
            <DialogDescription>
              Crea una copia di &quot;{toDuplicate?.nome}&quot; con tutte le variabili e valori.
              Potrai modificarla separatamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="dup-name" className="text-sm font-medium">
              Nome nuovo articolo
            </label>
            <Input
              id="dup-name"
              value={dupName}
              onChange={(e) => setDupName(e.target.value)}
              autoFocus
              className="h-10"
              onKeyDown={(e) => {
                if (e.key === "Enter" && dupName.trim() && !duplicateFamily.isPending) {
                  e.preventDefault();
                  void handleDuplicate();
                }
              }}
            />
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setToDuplicate(null);
                setDupName("");
              }}
              disabled={duplicateFamily.isPending}
              className="h-10 w-full sm:w-auto"
            >
              Annulla
            </Button>
            <Button
              onClick={handleDuplicate}
              disabled={!dupName.trim() || duplicateFamily.isPending}
              className="h-10 w-full sm:w-auto"
            >
              {duplicateFamily.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Duplicazione…
                </>
              ) : (
                "Duplica"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog sposta articolo (cambio macrocategoria/categoria).
          Era un Popover inline sulla Card ma creava overflow su griglia
          densa; convertito a Dialog per coerenza con Duplica/Elimina. */}
      <Dialog
        open={!!toMove}
        onOpenChange={(open) => {
          if (updateFamily.isPending) return;
          if (!open) setToMove(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sposta articolo</DialogTitle>
            <DialogDescription>
              Scegli macrocategoria e categoria di destinazione per{" "}
              &quot;{toMove?.nome}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="move-macro" className="text-xs">
                Macrocategoria
              </Label>
              <Select
                value={moveMacroId}
                onValueChange={(v) => {
                  setMoveMacroId(v);
                  // Reset cat quando cambia macro: la cat corrente potrebbe
                  // non appartenere alla nuova macro.
                  setMoveCatId(NO_CAT);
                }}
              >
                <SelectTrigger id="move-macro" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MACRO}>Senza macrocategoria</SelectItem>
                  {macrocategorie.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="move-cat" className="text-xs">
                Categoria
              </Label>
              <Select value={moveCatId} onValueChange={setMoveCatId}>
                <SelectTrigger id="move-cat" className="h-10">
                  <SelectValue placeholder="Nessuna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CAT}>Senza categoria</SelectItem>
                  {moveCategorieDisponibili.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {moveCategorieDisponibili.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nessuna categoria in questa macrocategoria.
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => setToMove(null)}
              disabled={updateFamily.isPending}
              className="h-10 w-full sm:w-auto"
            >
              Annulla
            </Button>
            <Button
              onClick={() => toMove && handleMove(toMove.id)}
              disabled={updateFamily.isPending}
              className="h-10 w-full sm:w-auto"
            >
              {updateFamily.isPending ? (
                <>
                  <Loader2
                    className="h-4 w-4 mr-2 animate-spin"
                    aria-hidden="true"
                  />
                  Spostamento…
                </>
              ) : (
                "Sposta"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog elimina (soft delete) */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (deleteFamily.isPending) return;
          if (!open) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminare &quot;{toDelete?.nome}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;articolo verrà spostato nel <strong>cestino per 15 giorni</strong>,
              poi eliminato definitivamente dal database. Potrai ripristinarlo
              in qualunque momento prima della scadenza. I preventivi storici
              che lo usano restano invariati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <AlertDialogCancel
              disabled={deleteFamily.isPending}
              className="h-10 mt-0 w-full sm:w-auto"
            >
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteFamily.isPending}
              className="h-10 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFamily.isPending ? (
                <>
                  <Loader2
                    className="h-4 w-4 mr-2 animate-spin"
                    aria-hidden="true"
                  />
                  Eliminazione…
                </>
              ) : (
                "Elimina"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Cestino: lista articoli soft-deleted + restore + hard-delete */}
      <Dialog
        open={cestinoOpen}
        onOpenChange={(open) => {
          if (restoreFamily.isPending || hardDeleteFamily.isPending) return;
          setCestinoOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash className="h-5 w-5" aria-hidden="true" />
              Cestino articoli
            </DialogTitle>
            <DialogDescription>
              Gli articoli eliminati vengono conservati per{" "}
              <strong>15 giorni</strong>, poi rimossi definitivamente dal
              database. Ripristinali in un click o eliminali subito senza
              aspettare.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6 py-2">
            {loadingCestino ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                Caricamento cestino…
              </div>
            ) : cestino.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                <ImageOff className="h-10 w-10 mb-3 opacity-40" aria-hidden="true" />
                <p className="text-sm font-medium">Il cestino è vuoto</p>
                <p className="text-xs mt-1">
                  Gli articoli eliminati appariranno qui per 15 giorni.
                </p>
              </div>
            ) : (
              <ul className="divide-y" aria-label="Articoli nel cestino">
                {cestino.map((f) => (
                  <li
                    key={f.id}
                    className="py-3 flex items-start gap-3"
                  >
                    {/* Thumbnail mini */}
                    <div className="w-12 h-12 rounded bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                      {f.immagine_url ? (
                        <img
                          src={f.immagine_url}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Package
                          className="h-5 w-5 text-muted-foreground/40"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{f.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        Eliminato il{" "}
                        {f.deleted_at
                          ? new Date(f.deleted_at).toLocaleDateString("it-IT", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                        {" · "}
                        <span className="text-amber-700 dark:text-amber-400 font-medium">
                          {f.deleted_at
                            ? formatTempoResiduo(f.deleted_at)
                            : ""}
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => void handleRestore(f.id)}
                        disabled={
                          restoreFamily.isPending || hardDeleteFamily.isPending
                        }
                        aria-label={`Ripristina ${f.nome}`}
                      >
                        <Undo2 className="h-4 w-4 sm:mr-1" aria-hidden="true" />
                        <span className="hidden sm:inline">Ripristina</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setToHardDelete(f)}
                        disabled={
                          restoreFamily.isPending || hardDeleteFamily.isPending
                        }
                        aria-label={`Elimina definitivamente ${f.nome}`}
                      >
                        <Trash2
                          className="h-4 w-4 sm:mr-1"
                          aria-hidden="true"
                        />
                        <span className="hidden sm:inline">Elimina</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCestinoOpen(false)}
              className="h-10"
              disabled={restoreFamily.isPending || hardDeleteFamily.isPending}
            >
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog conferma hard-delete dal cestino */}
      <AlertDialog
        open={!!toHardDelete}
        onOpenChange={(open) => {
          if (hardDeleteFamily.isPending) return;
          if (!open) setToHardDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminare definitivamente &quot;{toHardDelete?.nome}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è <strong>irreversibile</strong>. L&apos;articolo e
              tutte le sue variabili/valori verranno rimossi subito dal database
              invece di attendere la scadenza dei 15 giorni. I preventivi
              storici che lo usano restano invariati (i dati sono già stati
              snapshottati).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
            <AlertDialogCancel
              disabled={hardDeleteFamily.isPending}
              className="h-10 mt-0 w-full sm:w-auto"
            >
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleHardDelete}
              disabled={hardDeleteFamily.isPending}
              className="h-10 w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {hardDeleteFamily.isPending ? (
                <>
                  <Loader2
                    className="h-4 w-4 mr-2 animate-spin"
                    aria-hidden="true"
                  />
                  Eliminazione…
                </>
              ) : (
                "Elimina definitivamente"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
