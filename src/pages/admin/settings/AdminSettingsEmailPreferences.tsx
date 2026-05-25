/**
 * AdminSettingsEmailPreferences — preferenze email per superadmin.
 *
 * Riusa la pagina aziendale SettingsEmailPreferences (branding, mittente,
 * dominio per stream, footer unsubscribe) ma sotto PlatformCompanyProvider
 * → tutte le query lavorano sulla Platform Admin Company.
 *
 * Permette al superadmin di configurare le preferenze email per la
 * casella platform (es. supporto@ediliziaincloud.com): logo, colori
 * email, sender name di default, reply-to, dominio transactional vs
 * marketing, footer unsubscribe.
 */
import { lazy, Suspense } from "react";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { Skeleton } from "@/components/ui/skeleton";

const SettingsEmailPreferences = lazy(
  () => import("@/pages/azienda/settings/SettingsEmailPreferences"),
);

export default function AdminSettingsEmailPreferences() {
  return (
    <PlatformCompanyProvider>
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <SettingsEmailPreferences />
      </Suspense>
    </PlatformCompanyProvider>
  );
}
