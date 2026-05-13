/**
 * PhotoTemplatePicker — Dialog galleria foto template articoli.
 *
 * UX:
 *  - Filtro per verticale (Serramenti / Bagno / Fotovoltaico / Tetti / ...)
 *  - Filtro per categoria (Infissi / Persiane / ... dipende dal verticale)
 *  - Search box (cerca su nome + tags + descrizione)
 *  - Griglia thumbnail (responsive 2/3/4/5 colonne)
 *  - Click su thumbnail → preview ingrandita
 *  - Click su "Usa questa foto" → callback con image_url
 *
 * Riusabile in:
 *  - FamilyEditor Step 1 (Dati base — foto articolo)
 *  - ListinoCategorieManager (foto macrocategoria)
 *  - Eventuali altri punti dove serve scegliere una foto standard.
 */
import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Image as ImageIcon, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useArticlePhotoTemplates,
  type ArticlePhotoTemplate,
} from "@/hooks/useArticlePhotoTemplates";

/** Verticali abilitati al picker (allineati con moduli-vendita/config). */
const VERTICALI = [
  { value: "all",          label: "Tutti i verticali" },
  { value: "serramenti",   label: "Serramenti" },
  { value: "bagno",        label: "Bagno" },
  { value: "fotovoltaico", label: "Fotovoltaico" },
  { value: "tetti",        label: "Tetti" },
  { value: "cappotto",     label: "Cappotto termico" },
  { value: "pompe_calore", label: "Pompe di calore" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filtro per verticale (es. "serramenti" se il caller sa già il contesto). */
  initialVertical?: string | null;
  /** Pre-filtro per categoria (opzionale). */
  initialCategoria?: string | null;
  /** Callback con la foto scelta. */
  onSelect: (photo: ArticlePhotoTemplate) => void;
}

export function PhotoTemplatePicker({
  open, onOpenChange, initialVertical, initialCategoria, onSelect,
}: Props) {
  const [vertical, setVertical] = useState<string>(initialVertical ?? "all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: templates = [], isLoading, isError } = useArticlePhotoTemplates({
    vertical: vertical === "all" ? null : vertical,
    categoria: initialCategoria ?? null,
    search,
  });

  // Categoria dinamiche: ricavate dal dataset corrente per popolare un secondo
  // filtro (mostrato solo se ci sono >1 categorie disponibili nel verticale).
  const categoriesAvailable = useMemo(() => {
    const cats = new Set<string>();
    templates.forEach((t) => { if (t.categoria_slug) cats.add(t.categoria_slug); });
    return Array.from(cats).sort();
  }, [templates]);

  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("all");
  const filteredByCategoria = useMemo(
    () => (categoriaFiltro === "all" ? templates : templates.filter((t) => t.categoria_slug === categoriaFiltro)),
    [templates, categoriaFiltro],
  );

  const selected = filteredByCategoria.find((t) => t.id === selectedId);

  const handleConfirm = () => {
    if (selected) {
      onSelect(selected);
      onOpenChange(false);
      // reset stato per la prossima apertura
      setSelectedId(null);
      setSearch("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-orange-600" />
            Galleria foto template
          </DialogTitle>
          <DialogDescription>
            Scegli una foto professionale dalla galleria condivisa. Curata dal team EdiliziaInCloud.
          </DialogDescription>
        </DialogHeader>

        {/* Filtri */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-1">
          <div>
            <Label className="text-xs text-muted-foreground">Verticale</Label>
            <Select value={vertical} onValueChange={setVertical}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VERTICALI.map((v) => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {categoriesAvailable.length > 1 && (
            <div>
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le categorie</SelectItem>
                  {categoriesAvailable.map((c) => (
                    <SelectItem key={c} value={c}>{prettyLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className={categoriesAvailable.length > 1 ? "" : "sm:col-span-2"}>
            <Label className="text-xs text-muted-foreground">Cerca</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, materiale, tag…"
                className="h-9 text-xs pl-8"
              />
            </div>
          </div>
        </div>

        {/* Griglia */}
        <div className="flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Caricamento galleria…</span>
            </div>
          ) : isError ? (
            <div className="text-center py-12 text-sm text-rose-700">
              Errore caricamento galleria. Riprova.
            </div>
          ) : filteredByCategoria.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              Nessuna foto template con questi filtri.
              {search && (
                <Button
                  variant="ghost" size="sm"
                  onClick={() => { setSearch(""); setCategoriaFiltro("all"); setVertical("all"); }}
                  className="mt-2 text-xs gap-1"
                >
                  <X className="h-3.5 w-3.5" /> Azzera filtri
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {filteredByCategoria.map((t) => {
                const isSelected = selectedId === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "group relative aspect-square border-2 rounded-md overflow-hidden transition-all bg-slate-50",
                      isSelected
                        ? "border-orange-500 ring-2 ring-orange-300 shadow-md"
                        : "border-slate-200 hover:border-orange-300 hover:shadow-sm",
                    )}
                  >
                    <img
                      src={t.thumbnail_url ?? t.image_url}
                      alt={t.nome}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback se URL rotto: mostra icona placeholder
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    {/* Overlay info al hover */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
                      <p className="text-[10px] font-semibold text-white line-clamp-2 leading-tight">
                        {t.nome}
                      </p>
                      {t.materiale && (
                        <span className="text-[9px] text-white/80 mt-0.5">{prettyLabel(t.materiale)}</span>
                      )}
                    </div>
                    {/* Check icon se selezionata */}
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-orange-500 text-white flex items-center justify-center shadow">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-3 sm:items-center sm:justify-between flex-wrap gap-2">
          <div className="text-xs text-muted-foreground">
            {selected ? (
              <span>
                Selezionata: <strong>{selected.nome}</strong>
                {selected.tags.length > 0 && (
                  <span className="ml-2 inline-flex gap-1">
                    {selected.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[9px] h-4 px-1">{tag}</Badge>
                    ))}
                  </span>
                )}
              </span>
            ) : (
              `${filteredByCategoria.length} foto disponibili`
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selected}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Usa questa foto
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Converte snake_case → "Title Case" per label UI ("box_doccia" → "Box doccia"). */
function prettyLabel(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}
