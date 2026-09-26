import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Check, ImagePlus } from "lucide-react";
import { useRenderCatalogAssets } from "@/hooks/useRenderCatalogAssets";
import {
  MAX_CATALOG_REFERENCES,
  categoriaLabel,
  toggleCatalogSelection,
  type RenderCatalogVerticale,
} from "@/lib/render/renderCatalog";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  companyId?: string;
  verticale: RenderCatalogVerticale;
  /** Categorie mostrate in questa sezione del wizard. */
  categorie: string[];
  /** Selezione GLOBALE del render (condivisa tra le sezioni), max 4. */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

/**
 * "Dal tuo catalogo": miniature dei prodotti dell'azienda per le categorie
 * della sezione. Scegliendone una, il render la usa come riferimento.
 * Compatto anche su mobile: una riga scorrevole di miniature.
 */
export function CatalogReferencePicker({ companyId, verticale, categorie, selectedIds, onChange }: Props) {
  const isMobile = useIsMobile();
  const { assets, urls, loading } = useRenderCatalogAssets(companyId, verticale);
  const visibili = useMemo(() => assets.filter((a) => categorie.includes(a.categoria)), [assets, categorie]);
  const pieno = selectedIds.length >= MAX_CATALOG_REFERENCES;

  if (!companyId || loading) return null;
  if (visibili.length === 0) {
    // Telefono: niente invito a riempire il catalogo, che si imposta dal computer
    // (e niente elemento nascosto che lasci il suo spazio nella sezione).
    if (isMobile) return null;
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ImagePlus className="h-3.5 w-3.5" />
        <span>
          Nessuna foto prodotto per questa sezione.{" "}
          <Link to="/azienda/impostazioni/catalogo-render" className="underline underline-offset-2">
            Aggiungila al catalogo render
          </Link>{" "}
          e il render mostrerà il tuo prodotto.
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium max-md:text-[11px]">Dal tuo catalogo</span>
        <span className={cn("text-[11px] tabular-nums", pieno ? "text-amber-600" : "text-muted-foreground")}>
          {selectedIds.length}/{MAX_CATALOG_REFERENCES} riferimenti
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {visibili.map((a) => {
          const selected = selectedIds.includes(a.id);
          const disabled = !selected && pieno;
          const url = urls[a.storage_path];
          return (
            <button
              key={a.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(toggleCatalogSelection(selectedIds, a.id))}
              title={`${a.etichetta} · ${categoriaLabel(verticale, a.categoria)}`}
              className={cn(
                "relative shrink-0 w-[76px] rounded-lg border text-left transition",
                selected ? "border-primary ring-2 ring-primary/40" : "border-border",
                disabled ? "opacity-40 cursor-not-allowed" : "hover:border-primary/60",
              )}
            >
              <div className="aspect-square w-full overflow-hidden rounded-t-lg bg-muted">
                {url ? <img src={url} alt={a.etichetta} className="h-full w-full object-cover" loading="lazy" /> : null}
              </div>
              <div className="px-1 py-0.5 text-[10px] leading-tight line-clamp-2 max-md:text-[11px]">{a.etichetta}</div>
              {selected && (
                <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
