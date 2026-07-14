import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

interface PageSelectionStepProps {
  hook: any;
}

export function PageSelectionStep({ hook }: PageSelectionStepProps) {
  const { pages, togglePageSelection, isLoadingPages } = hook;
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages ?? [];
    return (pages ?? []).filter(
      (p: any) =>
        (p.asset_name || "").toLowerCase().includes(q) ||
        (p.asset_id || "").includes(q) ||
        (p.metadata?.biz_name || "").toLowerCase().includes(q),
    );
  }, [pages, query]);

  if (isLoadingPages) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
        <p className="text-sm">Caricamento pagine…</p>
      </div>
    );
  }

  if (!pages || pages.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">
          Nessuna pagina trovata. Verifica che il tuo account Meta gestisca almeno una
          pagina Facebook e che tu abbia dato i permessi richiesti.
        </p>
      </div>
    );
  }

  const handleToggle = (assetId: string, currentSelected: boolean) => {
    togglePageSelection.mutate({ assetId, selected: !currentSelected });
  };

  const selectedCount = pages.filter((p: any) => p.selected).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Seleziona le pagine Facebook di questa azienda da cui ricevere i lead. Le pagine
        non selezionate non verranno collegate.
      </p>

      {/* Con account che gestiscono molte pagine (agenzie), la ricerca è
          indispensabile per trovare quella del cliente. */}
      {pages.length > 6 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per nome pagina, ID o Business Manager…"
            className="pl-9"
            autoFocus
          />
        </div>
      )}

      <div className="border rounded-lg divide-y max-h-[340px] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nessuna pagina corrisponde a “{query}”.
          </p>
        ) : (
          filtered.map((page: any) => (
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
                <p className="text-xs text-muted-foreground truncate">
                  ID: {page.asset_id}
                  {page.metadata?.biz_name ? ` · ${page.metadata.biz_name}` : ""}
                </p>
              </div>
              {page.metadata?.instagram_business_account && (
                <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full shrink-0">
                  + Instagram
                </span>
              )}
            </label>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {selectedCount} di {pages.length} pagine selezionate
        {query && ` · ${filtered.length} risultati`}
      </p>
    </div>
  );
}
