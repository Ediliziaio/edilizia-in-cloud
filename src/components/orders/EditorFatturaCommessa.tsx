import { lazy, Suspense, useCallback, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentOperativo } from "@/components/orders/generali/design/ContestoOperativo";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const EditorDocumento = lazy(() => import("@/pages/azienda/fatturazione/EditorDocumento"));

export function EditorFatturaCommessa({ id, onChiudi }: { id: string; onChiudi: () => void }) {
  const t = useT();
  const uscitaEditor = useRef<(() => void) | null>(null);
  const registraUscita = useCallback((gestore: (() => void) | null) => { uscitaEditor.current = gestore; }, []);
  const chiediChiusura = () => (uscitaEditor.current ?? onChiudi)();
  const popup = useMemo(() => ({ id, chiudi: onChiudi, registraUscita }), [id, onChiudi, registraUscita]);
  const { mode, isLoading: modoInCaricamento } = useBillingMode();
  const accesso = useFeatureAccess("documenti");
  const { canViewBilling, solaLettura } = usePermissions();
  const [parametri] = useSearchParams();
  const prepara = modoInCaricamento || accesso.isLoading;
  const puoModificare = mode === "native" && accesso.isEnabled && canViewBilling && !solaLettura
    && parametri.get("commercialistaMode") !== "1";
  const caricamento = <div role="status" className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t("Apertura della bozza…")}
  </div>;

  return (
    <Dialog open onOpenChange={(aperto) => { if (!aperto) chiediChiusura(); }}>
      <DialogContentOperativo ampiezza="spazio" struttura="contenuta" className="h-[92dvh] gap-0 p-0">
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <DialogTitle className="text-base">{t("Bozza fattura della commessa")}</DialogTitle>
          <DialogDescription className="sr-only">{t("Editor della fattura")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          {prepara ? caricamento : puoModificare ? (
            <ErrorBoundary title={t("Editor della fattura non disponibile")}>
              <Suspense fallback={caricamento}><EditorDocumento popup={popup} /></Suspense>
            </ErrorBoundary>
          ) : <div className="p-5 text-sm"><Link className="font-medium text-primary underline" to={`/azienda/documenti/${id}/dettaglio`}>{t("Vai al dettaglio della fattura")}</Link></div>}
        </div>
      </DialogContentOperativo>
    </Dialog>
  );
}
