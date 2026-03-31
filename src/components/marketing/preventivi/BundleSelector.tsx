import { useBundleProdotti, type BundleConVoci } from "@/hooks/usePreventivoCosti";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Package } from "lucide-react";

interface Props {
  companyId: string;
  onSelectBundle: (bundle: BundleConVoci, voci: BundleConVoci["bundle_voci"]) => void;
}

export default function BundleSelector({ companyId, onSelectBundle }: Props) {
  const { data: bundles = [], isLoading } = useBundleProdotti(companyId);

  if (isLoading) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Caricamento bundle...
      </div>
    );
  }

  if (bundles.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Layers className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="font-medium text-sm">Nessun bundle disponibile</p>
        <p className="text-xs mt-1">
          Crea i bundle nel listino per usarli qui
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bundles.map((bundle) => {
        const numVoci = bundle.bundle_voci?.length ?? 0;
        return (
          <div
            key={bundle.id}
            className="flex items-start justify-between gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <Package className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{bundle.nome}</div>
                {bundle.descrizione && (
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {bundle.descrizione}
                  </div>
                )}
                <div className="flex flex-wrap gap-1 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {numVoci} {numVoci === 1 ? "voce" : "voci"}
                  </Badge>
                  {bundle.sconto_bundle_pct > 0 && (
                    <Badge variant="outline" className="text-xs text-green-700 border-green-300">
                      -{bundle.sconto_bundle_pct}%
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => onSelectBundle(bundle, bundle.bundle_voci ?? [])}
            >
              Aggiungi
            </Button>
          </div>
        );
      })}
    </div>
  );
}
