/**
 * AdminEmailTriagePage — triage email AI per superadmin.
 *
 * Riusa EmailTriagePage (lista email ricevute via webhook + classificazione
 * AI per category/priority) sotto PlatformCompanyProvider → mostra il
 * triage delle email indirizzate alla piattaforma (es. supporto@
 * ediliziaincloud.com, abuse@, security@, ecc.).
 *
 * Utile per:
 * - Monitorare email di supporto destinate al brand
 * - Vedere classificazione AI di lead inbound dalla landing
 * - Triagiare segnalazioni abuse / security
 */
import { lazy, Suspense } from "react";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { Skeleton } from "@/components/ui/skeleton";

const EmailTriagePage = lazy(
  () => import("@/pages/azienda/EmailTriagePage"),
);

export default function AdminEmailTriagePage() {
  return (
    <PlatformCompanyProvider>
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <EmailTriagePage />
      </Suspense>
    </PlatformCompanyProvider>
  );
}
