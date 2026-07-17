/**
 * CategoryGrid — Stadio 1 del Preventivatore Unificato (Sprint A §4.5).
 *
 * Griglia di tile cliccabili: una per macrocategoria di listino + pulsanti
 * secondari per le azioni meta (Riga libera / Sconto / Subtotale). Ogni tile
 * mostra icona, nome e conteggio prodotti. Le categorie vuote sono filtrate
 * dall'hook `useCatalogCategories` (total > 0).
 *
 * Icon resolution:
 *   · listino_categorie.icona può essere un emoji (es. "🪟") o il nome di
 *     un'icona lucide (es. "window"). Il componente prova prima la mappa
 *     lucide, in fallback mostra l'emoji/stringa grezza.
 */
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Blinds,
  Bath,
  Building2,
  Construction,
  Droplets,
  Hammer,
  Home,
  Layers3,
  Package,
  Paintbrush,
  Percent,
  Plus,
  Sigma,
  Sun,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useCatalogCategories } from "@/hooks/useCatalogCategories";
import type { CatalogCategory, CatalogMacrocategory } from "@/types/catalogItem";

/** Mappa nomi lucide → componente. Estendibile in base alle icone usate. */
const LUCIDE_MAP: Record<string, LucideIcon> = {
  window: Blinds,
  blinds: Blinds,
  bath: Bath,
  "building-2": Building2,
  building: Building2,
  construction: Construction,
  droplets: Droplets,
  hammer: Hammer,
  home: Home,
  "layers-3": Layers3,
  layers: Layers3,
  package: Package,
  paintbrush: Paintbrush,
  sun: Sun,
  wrench: Wrench,
  zap: Zap,
};

function isProbablyEmoji(s: string): boolean {
  // Heuristic: stringhe cortissime che non sono lettere base sono probabilmente
  // emoji. Non serve una regex Unicode esatta, solo "non è un nome lucide".
  if (s.length === 0) return false;
  if (s.length > 3) return false;
  return !/^[a-zA-Z0-9_-]+$/.test(s);
}

function CategoryIcon({ icona }: { icona: string | null }) {
  if (!icona) {
    const Fallback = Package;
    return <Fallback className="h-9 w-9" aria-hidden="true" />;
  }
  const trimmed = icona.trim();
  const Lucide = LUCIDE_MAP[trimmed.toLowerCase()];
  if (Lucide) return <Lucide className="h-9 w-9" aria-hidden="true" />;
  if (isProbablyEmoji(trimmed)) {
    return <span className="text-3xl" aria-hidden="true">{trimmed}</span>;
  }
  const Fallback = Package;
  return <Fallback className="h-9 w-9" aria-hidden="true" />;
}

export interface CategoryGridProps {
  onSelectCategory: (category: CatalogCategory) => void;
  /**
   * Macrocategoria selezionata in stage precedente. Se valorizzata, vengono
   * caricate solo le categorie sotto di essa (filtro server-side) e viene
   * mostrato un breadcrumb in alto. Se NULL, si torna al comportamento legacy
   * (tutte le categorie aziendali — usato quando non esistono macrocat).
   */
  macrocategory?: CatalogMacrocategory | null;
  /** Click su "← Macrocategorie" del breadcrumb (solo se macrocategory != null). */
  onBack?: () => void;
  onAddFreeLine?: () => void;
  onAddDiscount?: () => void;
  onAddSubtotal?: () => void;
}

export function CategoryGrid({
  onSelectCategory,
  macrocategory,
  onBack,
  onAddFreeLine,
  onAddDiscount,
  onAddSubtotal,
}: CategoryGridProps) {
  const { data: categories, isLoading } = useCatalogCategories({
    macrocategoriaId: macrocategory?.id ?? null,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const cats = categories ?? [];
  const empty = cats.length === 0;

  return (
    <div className="space-y-3 sm:space-y-4">
      {macrocategory && onBack && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Macrocategorie
          </Button>
          <span className="text-sm text-muted-foreground">›</span>
          <span className="text-sm font-medium">{macrocategory.nome}</span>
        </div>
      )}
      {empty ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Non hai ancora categorie di catalogo.
          </p>
          <p className="mt-1 text-sm">
            Crea la prima categoria in{" "}
            <span className="font-medium">Impostazioni → Catalogo</span>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {cats.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat)}
              title={cat.nome}
              className="group flex min-h-[100px] w-full flex-col items-start gap-1.5 rounded-lg border bg-card p-2.5 text-left transition hover:border-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring sm:min-h-[130px] sm:gap-2 sm:p-3"
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-primary overflow-hidden sm:h-14 sm:w-14"
                style={
                  cat.colore && !cat.immagine_url
                    ? { backgroundColor: `${cat.colore}1a`, color: cat.colore }
                    : undefined
                }
              >
                {cat.immagine_url ? (
                  <img
                    src={cat.immagine_url}
                    alt={cat.nome}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <CategoryIcon icona={cat.icona} />
                )}
              </div>
              <div className="min-w-0 w-full">
                <div className="text-sm font-medium leading-tight line-clamp-2 break-words">
                  {cat.nome}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {cat.total} prodott{cat.total === 1 ? "o" : "i"}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t pt-3 sm:pt-4">
        {onAddFreeLine && (
          <Button variant="outline" size="sm" onClick={onAddFreeLine}>
            <Plus className="mr-1 h-4 w-4" /> Riga libera
          </Button>
        )}
        {onAddDiscount && (
          <Button variant="outline" size="sm" onClick={onAddDiscount}>
            <Percent className="mr-1 h-4 w-4" /> Sconto
          </Button>
        )}
        {onAddSubtotal && (
          <Button variant="outline" size="sm" onClick={onAddSubtotal}>
            <Sigma className="mr-1 h-4 w-4" /> Subtotale
          </Button>
        )}
      </div>
    </div>
  );
}

export default CategoryGrid;
