/**
 * MacrocategoryGrid — Stadio 1 vero del Preventivatore Unificato.
 *
 * Mostra le MACROCATEGORIE (es. "PIU' LUCE") come tile cliccabili. Il click
 * porta allo stadio successivo che mostra le categorie/modelli sotto la
 * macrocategoria scelta.
 *
 * Quando esiste 1 sola macrocategoria, il dialog la auto-skippa e mostra
 * direttamente le categorie (vedi AddItemDialog effect su autoSelect).
 */
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers3, Package, Percent, Plus, Sigma } from "lucide-react";
import { useCatalogMacrocategories } from "@/hooks/useCatalogMacrocategories";
import type { CatalogMacrocategory } from "@/types/catalogItem";

export interface MacrocategoryGridProps {
  onSelectMacrocategory: (macro: CatalogMacrocategory) => void;
  onAddFreeLine?: () => void;
  onAddDiscount?: () => void;
  onAddSubtotal?: () => void;
}

export function MacrocategoryGrid({
  onSelectMacrocategory,
  onAddFreeLine,
  onAddDiscount,
  onAddSubtotal,
}: MacrocategoryGridProps) {
  const { data: macros, isLoading } = useCatalogMacrocategories();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const items = macros ?? [];
  const empty = items.length === 0;

  return (
    <div className="space-y-4">
      {empty ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Non hai ancora macrocategorie di catalogo.
          </p>
          <p className="mt-1 text-sm">
            Crea la prima macrocategoria in{" "}
            <span className="font-medium">Impostazioni → Catalogo</span>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectMacrocategory(m)}
              title={m.nome}
              className="group flex min-h-[130px] w-full flex-col items-start gap-2 rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-primary"
                style={
                  m.colore
                    ? { backgroundColor: `${m.colore}1a`, color: m.colore }
                    : undefined
                }
              >
                <Layers3 className="h-9 w-9" aria-hidden="true" />
              </div>
              <div className="min-w-0 w-full">
                <div className="text-sm font-medium leading-tight line-clamp-2 break-words">
                  {m.nome}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {m.count_categories} categori{m.count_categories === 1 ? "a" : "e"}
                  {" · "}
                  {m.count_products} prodott{m.count_products === 1 ? "o" : "i"}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t pt-4">
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

export default MacrocategoryGrid;
