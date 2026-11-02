/** Avvolge le viste della commessa: i collegamenti a bolle, ordini e richieste aprono il popup. */
import { lazy, Suspense, useCallback, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { ContestoDocumentoPopup, chiudeIlPopup, documentoDaPercorso, type DocumentoPopup } from "@/lib/orders/documentoPopup";

const DDTRicezioneDetail = lazy(() => import("@/pages/azienda/DDTRicezioneDetail"));
const PurchaseOrderDetail = lazy(() => import("@/pages/azienda/PurchaseOrderDetail"));
const SupplierRfqDetail = lazy(() => import("@/pages/azienda/SupplierRfqDetail"));

const TITOLI: Record<DocumentoPopup["tipo"], string> = { ddt: "Bolla", oda: "Ordine d’acquisto", rdo: "Richiesta d’offerta" };

export function DocumentiInPopup({ orderId, children }: { orderId: string; children: ReactNode }) {
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
  const dentro = useMemo(() => ({ vai: vaiDentro, dentroIlPopup: true, idDocumento: documento?.id }), [vaiDentro, documento?.id]);
  return (
    <ContestoDocumentoPopup value={fuori}>
      <div onClickCapture={intercetta(vaiFuori)}>{children}</div>
      {documento && (
        <Dialog open onOpenChange={(aperto) => { if (!aperto) chiudi(); }}>
          <DialogContent className="max-h-[92dvh] max-w-6xl overflow-y-auto max-sm:p-3" onClickCapture={intercetta(vaiDentro)}>
            <DialogTitle className="sr-only">{TITOLI[documento.tipo]}</DialogTitle>
            <DialogDescription className="sr-only">Si apre senza lasciare la commessa.</DialogDescription>
            <ContestoDocumentoPopup value={dentro}>
              <ErrorBoundary title="Documento non disponibile">
                <Suspense fallback={<div role="status" className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" aria-label="Caricamento" /></div>}>
                  {documento.tipo === "ddt" && <DDTRicezioneDetail key={documento.id} />}
                  {documento.tipo === "oda" && <PurchaseOrderDetail key={documento.id} />}
                  {documento.tipo === "rdo" && <SupplierRfqDetail key={documento.id} />}
                </Suspense>
              </ErrorBoundary>
            </ContestoDocumentoPopup>
          </DialogContent>
        </Dialog>
      )}
    </ContestoDocumentoPopup>
  );
}
