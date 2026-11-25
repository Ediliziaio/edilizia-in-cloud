import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import AdminGoogleCalendarPolicies from "@/components/admin/settings/AdminGoogleCalendarPolicies";
import SettingsMarketingCalendars from "@/pages/azienda/settings/SettingsMarketingCalendars";

export default function AdminSettingsMarketingCalendars() {
  return (
    <PlatformCompanyProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendari marketing</h1>
          <p className="text-muted-foreground">
            Configura calendari CRM, disponibilità e sincronizzazione Google/Apple per il calendario appuntamenti interno.
          </p>
        </div>
        <SettingsMarketingCalendars />
        {/* Regole Google valide per tutte le aziende: fino al 25/11/2026 stavano in Integrazioni. */}
        <AdminGoogleCalendarPolicies />
      </div>
    </PlatformCompanyProvider>
  );
}
