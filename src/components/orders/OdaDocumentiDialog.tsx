import { percorsoDocumentoGenerale, useAspettoOperativo } from "./generali/design/ContestoOperativo";
/**
 * Un ordine d'acquisto della commessa, aperto in una finestra: le sue bolle (arrivate sull'ordine o
 * fotografate in cantiere) e le sue fatture, senza lasciare la commessa. Usa gli stessi dati delle
 * schede «Bolle e DDT» e «Fatture fornitori», filtrati per ordine.
 */
import { Link } from "react-router-dom";
import { ExternalLink, Receipt, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "@/components/orders/generali/design/ContestoOperativo";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";
import { ODA_STATUS_COLORS, ODA_STATUS_LABELS } from "@/lib/odaStatus";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
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
  const t = useT();
  const aspetto = useAspettoOperativo();
  const bolle = useBolleCommessa(orderId);
  const fatture = useFattureFornitoriCommessa(orderId);
  // Solo le bolle arrivate: quelle ancora «in attesa» sono la consegna prevista, non un documento.
  const bolleOda = (bolle.data ?? []).filter((b) => oda && b.purchaseOrderId === oda.id && b.stato !== "Attesa");
  const fattureOda = (fatture.data ?? []).filter((f) => oda && f.purchaseOrderId === oda.id);
  const totaleFatture = fattureOda.reduce((s, f) => s + (f.totale ?? 0), 0);

  return (
    <Dialog open={!!oda} onOpenChange={(aperta) => { if (!aperta) onClose(); }}>
      <DialogContent struttura="scorrevole" className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {oda && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{oda.oda_number}</span>
                <Badge className={`border-0 text-xs ${ODA_STATUS_COLORS[oda.status] || ""}`}>{ODA_STATUS_LABELS[oda.status] ? t(ODA_STATUS_LABELS[oda.status]) : oda.status}</Badge>
              </DialogTitle>
              <DialogDescription>
                {oda.fornitore ?? t("Fornitore")}{mostraImporti ? " · " + t("ordine {importo}", { importo: formatCurrency(Number(oda.total)) }) : ""}
              </DialogDescription>
            </DialogHeader>

            <section aria-labelledby="oda-bolle" className="space-y-2">
              <h3 id="oda-bolle" className="flex items-center gap-2 text-sm font-semibold">
                <Truck className="h-4 w-4 text-primary" aria-hidden="true" />{t("Bolle e DDT")}
                {bolleOda.length > 0 && <Badge variant="outline">{bolleOda.length}</Badge>}
              </h3>
              {bolle.isLoading ? <Skeleton className="h-12 w-full" />
                : bolle.isError ? <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere le bolle.")} <button className="underline" onClick={() => void bolle.refetch()}>{t("Riprova")}</button></p>
                : bolleOda.length === 0 ? <p className="text-sm text-muted-foreground">{t("Nessuna bolla ancora arrivata su questo ordine.")}</p>
                : (
                  <ul className="divide-y rounded-lg border">
                    {bolleOda.map((b) => {
                      const contenuto = (
                        <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{t("N° {numero} · {data}", { numero: b.numero ?? "—", data: dataIt(b.data) })}</p>
                            {b.controparte && <p className="text-sm text-muted-foreground">{b.controparte}</p>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORIGINE[b.origine].classe}`}>{t(ORIGINE[b.origine].testo)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.attenzione ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}>{t(b.stato)}</span>
                          </div>
                        </div>
                      );
                      return <li key={b.id}>{b.link ? <Link to={percorsoDocumentoGenerale(b.link, aspetto?.generaleId)} className="block hover:bg-muted/50">{contenuto}</Link> : contenuto}</li>;
                    })}
                  </ul>
                )}
            </section>

            <section aria-labelledby="oda-fatture" className="space-y-2">
              <h3 id="oda-fatture" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <Receipt className="h-4 w-4 text-primary" aria-hidden="true" />{t("Fatture del fornitore")}
                {fattureOda.length > 0 && <Badge variant="outline">{fattureOda.length}</Badge>}
                {mostraImporti && fattureOda.length > 0 && <span className="font-normal text-muted-foreground">· {t("{importo} IVA inclusa", { importo: formatCurrency(totaleFatture) })}</span>}
              </h3>
              {fatture.isLoading ? <Skeleton className="h-12 w-full" />
                : fatture.isError ? <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere le fatture.")} <button className="underline" onClick={() => void fatture.refetch()}>{t("Riprova")}</button></p>
                : fattureOda.length === 0 ? <p className="text-sm text-muted-foreground">{t("Nessuna fattura collegata a questo ordine.")}</p>
                : (
                  <ul className="divide-y rounded-lg border">
                    {fattureOda.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{f.fornitore ?? t("Fornitore")} · {f.notaCredito ? t("nota di credito") : t("n.")} {f.numero ?? "—"}</p>
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
                <Link to={percorsoDocumentoGenerale(`/azienda/ordini-acquisto/${oda.id}`, aspetto?.generaleId)}><ExternalLink className="h-4 w-4" />{t("Apri l’ordine d’acquisto")}</Link>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
