// Cestino delle opportunità: «Elimina» porta qui, sempre (17/09/2026).
// Non si svuota da solo. Un'opportunità ripristinata torna nella sua fase con
// lo stato che aveva: lo rimette il database, senza far ripartire automazioni.

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ArchiveRestore, Loader2, Search, Trash2 } from "lucide-react";

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpportunitaCestino, useRipristinaOpportunita } from "@/hooks/useOpportunitiesData";
import { filtraCestino, LIMITE_CESTINO } from "@/lib/opportunitaCestino";
import { formatCount, formatCurrency } from "@/lib/formatters";

function quando(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy 'alle' HH:mm", { locale: it });
  } catch {
    return "";
  }
}

export function OpportunitaCestinoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: righe = [], isLoading, isError, refetch } = useOpportunitaCestino(open);
  const ripristina = useRipristinaOpportunita();
  const [cerca, setCerca] = useState("");
  const [inRipristino, setInRipristino] = useState<string | null>(null);

  const visibili = useMemo(() => filtraCestino(righe, cerca), [righe, cerca]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[80vh] !flex !flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-muted-foreground" />
            Cestino opportunità
          </DialogTitle>
          <DialogDescription>
            Le opportunità eliminate restano qui finché qualcuno non le ripristina.
            Tornano nella loro fase, con lo stato che avevano.
          </DialogDescription>
        </DialogHeader>

        {righe.length > 5 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca per nome, contatto, fase o chi l'ha eliminata"
              className="h-9 pl-8 text-sm"
              aria-label="Cerca nel cestino"
            />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              Il cestino non si è caricato.
              <Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button>
            </div>
          ) : visibili.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {righe.length === 0 ? "Il cestino è vuoto." : "Nessuna opportunità del cestino corrisponde alla ricerca."}
            </div>
          ) : (
            <ul className="space-y-1.5 py-1">
              {visibili.map((r) => {
                const dove = [r.pipeline, r.fase].filter(Boolean).join(" → ");
                const dettagli = [r.contatto && r.contatto !== r.nome ? r.contatto : null, dove || null, r.valore ? formatCurrency(r.valore) : null]
                  .filter(Boolean)
                  .join(" · ");
                const staRipristinando = ripristina.isPending && inRipristino === r.id;
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.nome}</p>
                      {dettagli && <p className="truncate text-[11px] text-muted-foreground">{dettagli}</p>}
                      <p className="text-[11px] text-muted-foreground">
                        Eliminata il {quando(r.eliminataIl)}
                        {r.eliminataDa && <> da <span className="font-medium text-foreground">{r.eliminataDa}</span></>}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      disabled={ripristina.isPending}
                      onClick={() => {
                        setInRipristino(r.id);
                        ripristina.mutate([r.id], { onSettled: () => setInRipristino(null) });
                      }}
                    >
                      {staRipristinando ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> Ripristina
                        </>
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {righe.length >= LIMITE_CESTINO && (
          <p className="text-[11px] text-muted-foreground">
            Qui ci sono le ultime {formatCount(LIMITE_CESTINO)} eliminate.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
