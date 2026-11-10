/**
 * La Contabilità generale nel menu Contabilità (10/11/2026, docs/piano-contabilita-un-posto-solo.md).
 *
 * Prima stava dentro Fatture → Fiscalità. Si vede con l'interruttore «Contabilità generale in casa»
 * acceso; spento, la pagina dice cos'è e, a chi può, lo fa accendere (invece del piano vuoto).
 */
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { Suspense } from "react";
import { BookOpenCheck } from "lucide-react";
import { ContabilitaInCasa, useContabilitaGeneraleAttiva } from "@/components/contabilita/ContabilitaInCasa";

const ContabilitaGenerale = lazy(() => import("@/components/contabilita/ContabilitaGenerale"));

export default function ContabilitaGeneralePagina() {
  const { attiva } = useContabilitaGeneraleAttiva();
  if (attiva === undefined) return <p role="status" className="p-6 text-sm text-muted-foreground">Caricamento…</p>;
  if (!attiva) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-6">
        <div className="flex items-center gap-2">
          <BookOpenCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-lg font-semibold">Contabilità generale</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          La partita doppia è spenta per questa azienda. Serve a chi tiene la contabilità in casa; incassi e
          pagamenti si registrano comunque in Prima nota, e IVA e F24 sono in Fatture → Fiscalità.
        </p>
        <ContabilitaInCasa />
      </div>
    );
  }
  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Caricamento…</p>}>
      <ContabilitaGenerale />
    </Suspense>
  );
}
