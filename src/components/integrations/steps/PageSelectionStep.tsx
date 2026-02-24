import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

interface PageSelectionStepProps {
  hook: any;
}

export function PageSelectionStep({ hook }: PageSelectionStepProps) {
  const { pages, togglePageSelection } = hook;

  if (!pages || pages.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
        <p className="text-sm">Nessuna pagina trovata. Verifica i permessi del tuo account Meta.</p>
      </div>
    );
  }

  const handleToggle = (assetId: string, currentSelected: boolean) => {
    togglePageSelection.mutate({ assetId, selected: !currentSelected });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Seleziona le pagine Facebook da cui vuoi ricevere i lead.
      </p>
      <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
        {pages.map((page: any) => (
          <label
            key={page.id}
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
          >
            <Checkbox
              checked={page.selected}
              onCheckedChange={() => handleToggle(page.id, page.selected)}
              disabled={togglePageSelection.isPending}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{page.asset_name}</p>
              <p className="text-xs text-muted-foreground">ID: {page.asset_id}</p>
            </div>
            {page.metadata?.instagram_business_account && (
              <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
                + Instagram
              </span>
            )}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {pages.filter((p: any) => p.selected).length} di {pages.length} pagine selezionate
      </p>
    </div>
  );
}
