import { AdAccountPickerDialog } from "@/components/ads/AdAccountPickerDialog";
import type { useMetaIntegration } from "@/hooks/useMetaIntegration";
import { Loader2 } from "lucide-react";

export function AdAccountSelectionStep({ hook }: { hook: ReturnType<typeof useMetaIntegration> }) {
  const accounts = hook.assets.filter((asset) => asset.asset_type === "ad_account");
  if (hook.isLoadingPages) {
    return <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Caricamento account pubblicitari…
    </div>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Questo passaggio è facoltativo. Scegli l’account da usare per le sponsorizzate;
        premi di nuovo sull’account selezionato per deselezionarlo.
        Puoi continuare senza account pubblicitario: Pagine e lead restano collegati.
      </p>
      {accounts.length > 0 ? (
        <AdAccountPickerDialog open onOpenChange={() => {}} companyId={hook.companyId} accounts={accounts} embedded />
      ) : (
        <p className="text-sm text-muted-foreground">
          Nessun account pubblicitario disponibile. Per le sponsorizzate verifica
          l’accesso al tuo account pubblicitario e aggiorna i permessi Meta.
        </p>
      )}
    </div>
  );
}
