/**
 * Un ordine d'acquisto della commessa, aperto in una finestra: le sue bolle (arrivate sull'ordine o
 * fotografate in cantiere) e le sue fatture, senza lasciare la commessa. Usa gli stessi dati delle
 * schede «Bolle e DDT» e «Fatture fornitori», filtrati per ordine.
 */
import { Link } from "react-router-dom";
import { ExternalLink, Receipt, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";
import { ODA_STATUS_COLORS, ODA_STATUS_LABELS } from "@/lib/odaStatus";
import { ORIGINE, dataIt, useBolleCommessa, useFattureFornitoriCommessa } from "./OrderDocumentiFornitore";

export interface OdaDellaFinestra {
  id: string;
  oda_number: string;
  status: string;
  total: number;
  fornitore: string | null;
}

export function OdaDocumentiDialog({ orderId, oda, onClose, mostraImporti }: {
  orderId: string;
  oda: OdaDellaFinestra | null;
  onClose: () => void;
  mostraImporti: boolean;
}) {
  const bolle = useBolleCommessa(orderId);
  const fatture = useFattureFornitoriCommessa(orderId);
  const bolleOda = (bolle.data ?? []).filter((b) => oda && b.purchaseOrderId === oda.id);
  const fattureOda = (fatture.data ?? []).filter((f) => oda && f.purchaseOrderId === oda.id);
  const totaleFatture = fattureOda.reduce((s, f) => s + (f.totale ?? 0), 0);

  return (
    <Dialog open={!!oda} onOpenChange={(aperta) => { if (!aperta) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {oda && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{oda.oda_number}</span>
                <Badge className={`border-0 text-xs ${ODA_STATUS_COLORS[oda.status] || ""}`}>{ODA_STATUS_LABELS[oda.status] || oda.status}</Badge>
              </DialogTitle>
              <DialogDescription>
                {oda.fornitore ?? "Fornitore"}{mostraImporti ? ` · ordine ${formatCurrency(Number(oda.total))}` : ""}
              </DialogDescription>
            </DialogHeader>

            <section aria-labelledby="oda-bolle" className="space-y-2">
              <h3 id="oda-bolle" className="flex items-center gap-2 text-sm font-semibold">
                <Truck className="h-4 w-4 text-primary" aria-hidden="true" />Bolle e DDT
                {bolleOda.length > 0 && <Badge variant="outline">{bolleOda.length}</Badge>}
              </h3>
              {bolle.isLoading ? <Skeleton className="h-12 w-full" />
                : bolle.isError ? <p role="alert" className="text-sm text-destructive">Non riesco a leggere le bolle. <button className="underline" onClick={() => void bolle.refetch()}>Riprova</button></p>
                : bolleOda.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna bolla ancora arrivata su questo ordine.</p>
                : (
                  <ul className="divide-y rounded-lg border">
                    {bolleOda.map((b) => {
                      const contenuto = (
                        <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">N° {b.numero ?? "—"} · {dataIt(b.data)}</p>
                            {b.controparte && <p className="text-sm text-muted-foreground">{b.controparte}</p>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORIGINE[b.origine].classe}`}>{ORIGINE[b.origine].testo}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.attenzione ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}>{b.stato}</span>
                          </div>
                        </div>
                      );
                      return <li key={b.id}>{b.link ? <Link to={b.link} className="block hover:bg-muted/50">{contenuto}</Link> : contenuto}</li>;
                    })}
                  </ul>
                )}
            </section>

            <section aria-labelledby="oda-fatture" className="space-y-2">
              <h3 id="oda-fatture" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <Receipt className="h-4 w-4 text-primary" aria-hidden="true" />Fatture del fornitore
                {fattureOda.length > 0 && <Badge variant="outline">{fattureOda.length}</Badge>}
                {mostraImporti && fattureOda.length > 0 && <span className="font-normal text-muted-foreground">· {formatCurrency(totaleFatture)} IVA inclusa</span>}
              </h3>
              {fatture.isLoading ? <Skeleton className="h-12 w-full" />
                : fatture.isError ? <p role="alert" className="text-sm text-destructive">Non riesco a leggere le fatture. <button className="underline" onClick={() => void fatture.refetch()}>Riprova</button></p>
                : fattureOda.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna fattura collegata a questo ordine.</p>
                : (
                  <ul className="divide-y rounded-lg border">
                    {fattureOda.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{f.fornitore ?? "Fornitore"} · {f.notaCredito ? "nota di credito" : "n."} {f.numero ?? "—"}</p>
                          <p className="text-sm text-muted-foreground">{dataIt(f.data)}</p>
                        </div>
                        {mostraImporti && <p className="shrink-0 text-sm font-semibold tabular-nums">{f.totale == null ? "—" : formatCurrency(f.totale)}</p>}
                      </li>
                    ))}
                  </ul>
                )}
            </section>

            <div className="flex justify-end">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to={`/azienda/ordini-acquisto/${oda.id}`}><ExternalLink className="h-4 w-4" />Apri l’ordine d’acquisto</Link>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
