/**
 * #44 — "Dove è usata" una tariffa.
 *
 * Mostra, su richiesta (apertura dialog per UNA voce), in quante e quali parti
 * dell'applicazione la tariffa è referenziata: righe di preventivo, bundle,
 * default di posa/montaggio su famiglie/articoli, listini fornitore, manodopera
 * assegnata ai progetti, ecc. Serve all'admin per capire l'impatto PRIMA di
 * eliminare o archiviare una voce.
 *
 * La logica di conteggio e l'elenco delle sorgenti vivono in
 * `@/lib/tariffe/tariffaUsage` (sorgente unica condivisa con la guardia
 * anti-eliminazione nella pagina Tariffe). Qui resta solo la UI + la mappa
 * tabella → icona.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Tariffa } from "@/pages/azienda/settings/SettingsTariffe/types";
import {
  countTariffaUsage,
  totalTariffaUsage,
  hasUnknownTariffaUsage,
} from "@/lib/tariffe/tariffaUsage";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText, Package, Layers3, Tag, Truck, HardHat, Loader2, CheckCircle2, AlertTriangle,
} from "lucide-react";

/** Mappa tabella → icona (la libreria dati è "pura" e non conosce le icone). */
const ICON_BY_TABLE: Record<string, React.ComponentType<{ className?: string }>> = {
  quote_items: FileText,
  bundle_voci: Package,
  article_families: Layers3,
  article_templates: Package,
  product_aliases: Tag,
  supplier_product_lines: Truck,
  preventivo_manodopera_assegnazioni: HardHat,
  fv_manodopera_progetto: HardHat,
  sr_servizi_progetto: HardHat,
};

export function TariffaUsageDialog({
  open,
  onClose,
  tariffa,
}: {
  open: boolean;
  onClose: () => void;
  tariffa: Tariffa | null;
}) {
  const tariffaId = tariffa?.id;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tariffa-usage", tariffaId],
    enabled: open && !!tariffaId,
    staleTime: 30_000,
    queryFn: () => countTariffaUsage(tariffaId as string),
  });

  const used = useMemo(() => (data ?? []).filter((r) => r.ok && r.count > 0), [data]);
  const total = useMemo(() => totalTariffaUsage(data ?? []), [data]);
  const hasUnknown = useMemo(() => hasUnknownTariffaUsage(data ?? []), [data]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dove è usata</DialogTitle>
          <DialogDescription>
            {tariffa ? (
              <>Riferimenti a <span className="font-medium text-foreground">{tariffa.nome}</span> nell'applicazione.</>
            ) : (
              "Riferimenti della voce nell'applicazione."
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifica dei collegamenti in corso…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="text-sm text-muted-foreground">
              Non è stato possibile verificare i collegamenti.
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>Riprova</Button>
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="font-medium">Nessun utilizzo trovato</p>
              <p className="text-sm text-muted-foreground mt-1">
                Questa voce non è referenziata da preventivi, bundle o listini:
                puoi archiviarla o eliminarla senza impatti.
              </p>
            </div>
            {hasUnknown && (
              <p className="text-xs text-muted-foreground">
                Alcune sorgenti non sono verificabili in questo ambiente.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
              <span className="text-sm font-medium">Utilizzi totali</span>
              <Badge variant="secondary" className="text-sm">{total}</Badge>
            </div>
            <ScrollArea className="max-h-[320px] pr-3">
              <ul className="space-y-1.5">
                {used.map((r) => {
                  const Icon = ICON_BY_TABLE[r.table] ?? FileText;
                  return (
                    <li
                      key={r.table}
                      className="flex items-center gap-3 rounded-md border px-3 py-2"
                    >
                      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{r.label}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.hint}</div>
                      </div>
                      <Badge variant="outline" className="shrink-0">{r.count}</Badge>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
            <p className="text-xs text-muted-foreground">
              Eliminare una voce ancora collegata può lasciare riferimenti vuoti:
              valuta di <span className="font-medium">archiviarla</span> invece di eliminarla.
              {hasUnknown && " Alcune sorgenti non sono verificabili in questo ambiente."}
            </p>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
