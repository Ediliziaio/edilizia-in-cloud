/**
 * AdminEmailClientPage — client email per superadmin (lato piattaforma).
 *
 * Riusa interamente EmailClientPage (con onboarding, empty/loading/error
 * states, 3-pane Gmail-style, AI Command Center, ricerca, compose, ...)
 * ma sotto un PlatformCompanyProvider che fa override di effectiveCompany
 * → tutte le query interne lavorano sulla Platform Admin Company
 * (00000000-0000-0000-0000-000000000001).
 *
 * Settings path è personalizzato per portare al backend admin
 * (/admin/impostazioni/email) invece che al profilo utente azienda.
 */
import { lazy, Suspense } from "react";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { Loader2 } from "lucide-react";

const EmailClientPage = lazy(() => import("@/pages/azienda/email/EmailClientPage"));

export default function AdminEmailClientPage() {
  return (
    <PlatformCompanyProvider>
      <div className="-m-3 md:-m-6">
        <Suspense fallback={
          <div className="flex h-[60vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }>
          <EmailClientPage settingsPath="/admin/impostazioni/email" />
        </Suspense>
      </div>
    </PlatformCompanyProvider>
  );
}
