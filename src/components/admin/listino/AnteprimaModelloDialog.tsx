/** Cosa c'è dentro un modello di area: le tipologie e i loro prodotti, con foto. */
import { FileText, ImageIcon, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useContenutoModello } from "@/hooks/useModelliArea";
import { formatCurrency } from "@/lib/formatters";
import { testoContenuto, type ModelloArea } from "@/lib/listino/modelliArea";

interface Props {
  modello: ModelloArea;
  onChiudi: () => void;
}

const SLOT_FV: Record<string, string> = {
  pannello: "moduli",
  inverter: "inverter",
  accumulo: "accumulo",
  ottimizzatore: "ottimizzatori",
  wallbox: "ricarica",
  struttura: "strutture",
};

export function AnteprimaModelloDialog({ modello, onChiudi }: Props) {
  const { data, isLoading, isError } = useContenutoModello(modello.id);

  return (
    <Dialog open onOpenChange={(open) => !open && onChiudi()}>
      <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{modello.nome}</DialogTitle>
          <DialogDescription>
            {testoContenuto(modello.riepilogo)}
            {modello.origine_nome && ` · fotografato da ${modello.origine_nome}`}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
          {isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carico il contenuto…
            </p>
          )}
          {isError && <p className="text-sm text-destructive">Non riesco a leggere il contenuto del modello.</p>}
          {(data?.tipologie ?? []).map((t) => (
            <section key={t.chiave} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                {t.nome}
                <span className="font-normal text-muted-foreground">· {t.prodotti.length}</span>
                {t.fv_categoria && (
                  <Badge variant="outline" className="text-[10px]">
                    configuratore FV: {SLOT_FV[t.fv_categoria] ?? t.fv_categoria}
                  </Badge>
                )}
              </h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {t.prodotti.map((p) => {
                  const varianti = p.assi.reduce((n, a) => n + (a.valori?.length ?? 0), 0);
                  const scheda = !!p.pdf_scheda_url || p.documenti.length > 0;
                  return (
                    <li key={p.chiave} className="overflow-hidden rounded-md border bg-card">
                      <div className="flex h-20 items-center justify-center bg-muted/40">
                        {p.immagine_url ? (
                          <img src={p.immagine_url} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
                        )}
                      </div>
                      <div className="space-y-1 p-2">
                        <p className="line-clamp-2 text-xs font-medium leading-snug">{p.nome}</p>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          {scheda && (
                            <span className="inline-flex items-center gap-0.5">
                              <FileText className="h-3 w-3" aria-hidden="true" /> scheda
                            </span>
                          )}
                          {varianti > 0 && <span>{varianti} varianti</span>}
                          {modello.con_prezzi_vendita && Number(p.prezzo_base_vendita) > 0 && (
                            <span className="font-medium text-foreground">{formatCurrency(Number(p.prezzo_base_vendita))}</span>
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
