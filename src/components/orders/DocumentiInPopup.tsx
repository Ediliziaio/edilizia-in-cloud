import { percorsoDocumentoGenerale, useAspettoOperativo } from "./generali/design/ContestoOperativo";
/** Avvolge le viste della commessa: i collegamenti a bolle, ordini e richieste aprono il popup. */
import { lazy, Suspense, useCallback, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "@/components/orders/generali/design/ContestoOperativo";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { ContestoDocumentoPopup, chiudeIlPopup, documentoDaPercorso, type DocumentoPopup } from "@/lib/orders/documentoPopup";

const DDTRicezioneDetail = lazy(() => import("@/pages/azienda/DDTRicezioneDetail"));
const PurchaseOrderDetail = lazy(() => import("@/pages/azienda/PurchaseOrderDetail"));
const SupplierRfqDetail = lazy(() => import("@/pages/azienda/SupplierRfqDetail"));
const DocumentoDetail = lazy(() => import("@/pages/azienda/fatturazione/DocumentoDetail"));

const TITOLI: Record<DocumentoPopup["tipo"], string> = { ddt: "Bolla", oda: "Ordine d’acquisto", rdo: "Richiesta d’offerta", documento: "Documento" };

export function DocumentiInPopup({ orderId, children }: { orderId: string; children: ReactNode }) {
  const aspetto = useAspettoOperativo();
  const queryClient = useQueryClient();
  const [documento, setDocumento] = useState<DocumentoPopup | null>(null);
  const chiudi = useCallback(() => {
    setDocumento(null);
    // Dal popup si può aver cambiato di tutto: quello che si vede sotto si rilegge.
    refreshMaterialQueries(queryClient);
    for (const k of ["linked-purchase-orders", "commessa-bolle-ddt", "commessa-fatture-fornitori", "supplier-rfqs"]) void queryClient.invalidateQueries({ queryKey: [k] });
  }, [queryClient]);
  const vaiFuori = useCallback((percorso: string) => {
    const doc = documentoDaPercorso(percorso);
    if (doc) { setDocumento(doc); return true; }
    return false;
  }, []);
  const vaiDentro = useCallback((percorso: string) => {
    if (vaiFuori(percorso)) return true;
    if (chiudeIlPopup(percorso, orderId)) { chiudi(); return true; }
    setDocumento(null);
    return false;
  }, [vaiFuori, chiudi, orderId]);
  const intercetta = (vai: (p: string) => boolean) => (e: MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest?.("a[href]");
    const href = a?.getAttribute("href");
    if (href && a?.getAttribute("target") !== "_blank" && vai(href)) e.preventDefault();
  };
  const fuori = useMemo(() => ({ vai: vaiFuori, dentroIlPopup: false }), [vaiFuori]);
  const dentro = useMemo(() => ({ vai: vaiDentro, dentroIlPopup: true, idDocumento: documento?.id, parametriDocumento: documento?.ricerca }), [vaiDentro, documento?.id, documento?.ricerca]);
  return (
    <ContestoDocumentoPopup value={fuori}>
      <div onClickCapture={intercetta(vaiFuori)}>{children}</div>
      {documento && (
        <Dialog open onOpenChange={(aperto) => { if (!aperto) chiudi(); }}>
          <DialogContent struttura="contenuta" className="flex h-[92dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0" onClickCapture={intercetta(vaiDentro)}
            // Senza, il fuoco va sul primo campo e il documento si apre già scrollato.
            onOpenAutoFocus={(e) => e.preventDefault()}>
            {/* La barra resta ferma: la X non finisce più sopra i bottoni del documento. */}
            <div className="commessa-document-bar flex shrink-0 items-center gap-3 border-b px-4 py-2.5 pr-12">
              <DialogTitle className="text-sm font-semibold">{TITOLI[documento.tipo]}</DialogTitle>
              <DialogDescription className="sr-only">Si apre senza lasciare la commessa.</DialogDescription>
              <a href={percorsoDocumentoGenerale(documento.percorso + (documento.ricerca ?? ""), aspetto?.generaleId)} data-pagina-intera target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /><span className="max-sm:hidden">Apri in una scheda</span>
              </a>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 max-sm:p-3">
              <ContestoDocumentoPopup value={dentro}>
                <ErrorBoundary title="Documento non disponibile">
                  <Suspense fallback={<div role="status" className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" aria-label="Caricamento" /></div>}>
                    {documento.tipo === "ddt" && <DDTRicezioneDetail key={documento.id} />}
                    {documento.tipo === "oda" && <PurchaseOrderDetail key={documento.id} />}
                    {documento.tipo === "rdo" && <SupplierRfqDetail key={documento.id} />}
                    {documento.tipo === "documento" && <DocumentoDetail key={documento.id} />}
                  </Suspense>
                </ErrorBoundary>
              </ContestoDocumentoPopup>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </ContestoDocumentoPopup>
  );
}
