/**
 * AdminSettingsEmailDomain — gestione dominio email per superadmin.
 *
 * Riusa la pagina aziendale SettingsEmailDomain (verifica DNS DKIM/SPF/
 * MX/DMARC, gestione domini custom) sotto PlatformCompanyProvider
 * → tutte le operazioni avvengono sulla Platform Admin Company.
 *
 * Permette al superadmin di verificare/gestire i domini email custom
 * della piattaforma (es. ediliziaincloud.com, *.eic.cloud) con record
 * DNS che vengono firmati centralmente da SES/Resend/Sendgrid.
 */
import { lazy, Suspense } from "react";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { Skeleton } from "@/components/ui/skeleton";

const SettingsEmailDomain = lazy(
  () => import("@/pages/azienda/settings/SettingsEmailDomain"),
);

export default function AdminSettingsEmailDomain() {
  return (
    <PlatformCompanyProvider>
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <SettingsEmailDomain />
      </Suspense>
    </PlatformCompanyProvider>
  );
}
