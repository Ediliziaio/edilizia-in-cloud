/**
 * AdminEmailClientPage — client email PERSONALE per membri team superadmin.
 *
 * Ogni utente del team EdiliziaInCloud (Florin + collaboratori) collega
 * la SUA casella OAuth (Gmail/Outlook/IMAP) dal proprio profilo
 * (/admin/impostazioni/mio-profilo → tab Email) e qui vede SOLO le sue
 * email (scoped via user_id, mai mescolato con quelle di altri colleghi).
 *
 * Sotto PlatformCompanyProvider tutte le query usano:
 *   - company_id = PLATFORM_ADMIN_COMPANY_ID (per RLS)
 *   - user_id    = utente loggato (per isolamento personale)
 *
 * Le settings link puntano al profilo personale admin → tab email →
 * card OAuth con CTA "Collega Gmail/Outlook".
 */
import { lazy, Suspense } from "react";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { AdminTransactionalLogPanel } from "@/components/admin/AdminTransactionalLogPanel";
import { Loader2 } from "lucide-react";

const EmailClientPage = lazy(() => import("@/pages/azienda/email/EmailClientPage"));

export default function AdminEmailClientPage() {
  return (
    <PlatformCompanyProvider>
      {/* Log transazionali REALI (email_delivery_log) sopra il client: prima
          la pagina mostrava solo l'empty-state OAuth con preview demo e le
          email di sistema davvero inviate non erano visibili da nessuna parte. */}
      <div className="mb-4">
        <AdminTransactionalLogPanel />
      </div>
      <div className="-m-3 md:-m-6">
        <Suspense fallback={
          <div className="flex h-[60vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }>
          <EmailClientPage
            settingsPath="/admin/impostazioni/mio-profilo?tab=email"
            emptyStateSettingsPath="/admin/impostazioni/mio-profilo?tab=email"
            emailContext="admin"
          />
        </Suspense>
      </div>
    </PlatformCompanyProvider>
  );
}
