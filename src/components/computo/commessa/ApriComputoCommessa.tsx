import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { idComputoValido } from "@/lib/computo/percorsiComputo";

const OrderComputoTab = lazy(() => import("./OrderComputoTab"));

export function ApriComputoCommessa({ orderId, orderLabel }: { orderId: string; orderLabel?: string | null }) {
  const { effectiveCompany } = useAuth();
  const permessi = usePermissions();
  const [params, setParams] = useSearchParams();
  const richiesto = params.get("computo");
  if (!effectiveCompany?.id || !permessi.canViewOrders) return null;
  const apri = () => setParams((p) => { const n = new URLSearchParams(p); n.set("computo", "1"); return n; });
  const chiudi = () => setParams((p) => { const n = new URLSearchParams(p); n.delete("computo"); return n; }, { replace: true });
  return <>
    <Button size="sm" variant="outline" className="tap-compact h-8 gap-1.5 px-2.5 text-xs" onClick={apri}><FileSpreadsheet className="h-3.5 w-3.5" />Apri computo</Button>
    <Dialog open={richiesto !== null} onOpenChange={(open) => { if (!open) chiudi(); }}>
      <DialogContent className="max-h-[94dvh] max-w-6xl overflow-y-auto">
        <DialogHeader><DialogTitle>Computo della commessa</DialogTitle><DialogDescription>{orderLabel ? `${orderLabel} · ` : ""}Voci, misure e collegamenti del computo esistente.</DialogDescription></DialogHeader>
        {richiesto && (richiesto === "1" || idComputoValido(richiesto)) ? <Suspense fallback={<p role="status" className="flex items-center gap-2 p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Apro il computo…</p>}>
          <OrderComputoTab key={`${orderId}:${richiesto}`} orderId={orderId} companyId={effectiveCompany.id} canEdit={permessi.canEditOrders && !permessi.solaLettura} canViewAmounts={permessi.canViewOrderAmounts} orderLabel={orderLabel} computoInizialeId={richiesto === "1" ? undefined : richiesto} soloEsistenti />
        </Suspense> : <p role="alert" className="p-4 text-sm">Il riferimento al computo non è valido.</p>}
      </DialogContent>
    </Dialog>
  </>;
}
