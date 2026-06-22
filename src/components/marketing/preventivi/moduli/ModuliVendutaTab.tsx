import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, LayoutGrid, ShoppingBag } from "lucide-react";
import { useModuliVendita, useModuliVisibilita, type ModuloVenditaView } from "@/lib/moduli-vendita";
import { ModuloCard } from "./ModuloCard";
import { ModuloLockedDialog } from "./ModuloLockedDialog";

/**
 * Tab "Moduli Vendita" dell'Hub Preventivi.
 *
 * Hero descrittivo + grid 1/2/3 colonne con card per ciascuno dei 6 moduli
 * verticali. Apertura dialog informativo per i moduli bloccati (premium).
 */
export function ModuliVendutaTab() {
  const { moduli, isLoading, isError, countAttivi } = useModuliVendita();
  const { isModuloVisibile, hiddenSlugs } = useModuliVisibilita();
  const [selectedView, setSelectedView] = useState<ModuloVenditaView | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Nascondiamo dal catalogo i moduli che l'azienda ha disattivato nelle
  // impostazioni (preferenza di visibilità per-azienda). I moduli premium
  // bloccati/coming_soon restano visibili come upsell.
  const moduliVisibili = moduli.filter((view) => isModuloVisibile(view.modulo.slug));

  const handleLockedClick = (view: ModuloVenditaView) => {
    setSelectedView(view);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ShoppingBag className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Moduli Vendita</h1>
            <p className="text-sm text-muted-foreground">
              Configuratori verticali per accelerare le tue offerte
            </p>
          </div>
        </div>
        {!isLoading && !isError && (
          <div className="flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground">
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            <span>
              <strong className="text-foreground">{countAttivi}</strong> di {moduli.length} attivi
            </span>
          </div>
        )}
      </div>

      {/* ─── Loading skeleton ─────────────────────────────────────── */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Error state (totale: nessun flag risolto) ───────────── */}
      {isError && !isLoading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Impossibile caricare i moduli</AlertTitle>
          <AlertDescription>
            Riprova tra qualche istante o contatta il supporto se il problema persiste.
          </AlertDescription>
        </Alert>
      )}

      {/* ─── Grid moduli ─────────────────────────────────────────── */}
      {!isLoading && !isError && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {moduliVisibili.map((view) => (
            <ModuloCard
              key={view.modulo.slug}
              view={view}
              onLockedClick={handleLockedClick}
            />
          ))}
        </div>
      )}

      {/* ─── Hint moduli nascosti dalle impostazioni ─────────────── */}
      {!isLoading && !isError && hiddenSlugs.size > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {hiddenSlugs.size === 1 ? "1 modulo è nascosto" : `${hiddenSlugs.size} moduli sono nascosti`} dalle
          impostazioni della tua azienda. Riattivali da <strong>Impostazioni › Template preventivi</strong>.
        </p>
      )}

      {/* ─── Footer informativo ──────────────────────────────────── */}
      {!isLoading && !isError && (
        <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Hai bisogno di un modulo personalizzato per la tua attività?{" "}
            <a
              href="mailto:info@ediliziaincloud.com?subject=Richiesta%20modulo%20personalizzato"
              className="font-medium text-primary hover:underline"
            >
              Contattaci
            </a>
            .
          </p>
        </div>
      )}

      <ModuloLockedDialog view={selectedView} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
