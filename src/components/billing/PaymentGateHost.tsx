import { Suspense } from "react";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { usePaymentGateStore } from "@/store/paymentGateStore";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const PaymentGateDialog = lazyWithRetry(() => import("./PaymentGateDialog"));

export function PaymentGateHost() {
  const t = useT();
  // Il dialog resta montato quando il gate si chiude per aprire la ricarica.
  const richiesto = usePaymentGateStore((s) => s.open || s.apertoAt > 0);
  if (!richiesto) return null;

  return (
    <ErrorBoundary title={t("Errore nell’apertura delle opzioni di pagamento")}>
      <Suspense fallback={
        <div role="status" className="fixed inset-x-4 top-4 z-50 mx-auto w-fit rounded-lg border bg-background px-4 py-2 text-sm shadow">
          {t("Caricamento opzioni di pagamento…")}
        </div>
      }>
        <PaymentGateDialog />
      </Suspense>
    </ErrorBoundary>
  );
}
