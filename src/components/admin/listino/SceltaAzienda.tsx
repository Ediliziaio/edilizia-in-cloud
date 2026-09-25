/**
 * Scegliere un'azienda in una finestra: una ricerca e l'elenco sotto, senza
 * tendine (un menu a comparsa dentro una finestra perde i clic su alcuni
 * browser, vedi le tendine dentro gli Sheet).
 */
import { useMemo, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAziendeLibreria } from "@/hooks/useModelliArea";
import { cn } from "@/lib/utils";

const STATI: Record<string, string> = {
  trial: "in prova",
  suspended: "sospesa",
  expired: "scaduta",
  free: "gratuita",
};

interface Props {
  valore: string | null;
  onScegli: (id: string) => void;
  /** Un'annotazione accanto al nome («già installato il 25/09»). */
  note?: ReadonlyMap<string, string>;
  etichetta: string;
  disabilitata?: boolean;
}

export function SceltaAzienda({ valore, onScegli, note, etichetta, disabilitata }: Props) {
  const { data: aziende = [], isLoading, isError } = useAziendeLibreria();
  const [cerca, setCerca] = useState("");
  const visibili = useMemo(() => {
    const testo = cerca.trim().toLowerCase();
    return testo ? aziende.filter((a) => a.name.toLowerCase().includes(testo)) : aziende;
  }, [aziende, cerca]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Cerca l'azienda…"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          disabled={disabilitata}
          aria-label={`Cerca: ${etichetta}`}
        />
      </div>
      <div role="radiogroup" aria-label={etichetta} className="max-h-56 overflow-y-auto rounded-md border">
        {isLoading && (
          <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carico le aziende…
          </p>
        )}
        {isError && <p className="px-3 py-3 text-sm text-destructive">Non riesco a caricare le aziende.</p>}
        {!isLoading && !isError && visibili.length === 0 && (
          <p className="px-3 py-3 text-sm text-muted-foreground">Nessuna azienda con questo nome.</p>
        )}
        {visibili.map((a) => {
          const scelta = a.id === valore;
          const stato = a.status ? STATI[a.status] : undefined;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={scelta}
              disabled={disabilitata}
              onClick={() => onScegli(a.id)}
              className={cn(
                "flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                scelta ? "bg-primary/5 font-medium" : "hover:bg-muted/50",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              {stato && <span className="shrink-0 text-xs text-muted-foreground">{stato}</span>}
              {note?.get(a.id) && <span className="shrink-0 text-xs text-muted-foreground">{note.get(a.id)}</span>}
              {scelta && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
