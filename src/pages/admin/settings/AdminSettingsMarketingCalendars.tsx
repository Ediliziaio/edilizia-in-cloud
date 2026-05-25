import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import SettingsMarketingCalendars from "@/pages/azienda/settings/SettingsMarketingCalendars";

export default function AdminSettingsMarketingCalendars() {
  return (
    <PlatformCompanyProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendari marketing</h1>
          <p className="text-muted-foreground">
            Configura calendari CRM, disponibilita e sincronizzazione Google/Apple per il calendario appuntamenti interno.
          </p>
        </div>
        <SettingsMarketingCalendars />
      </div>
    </PlatformCompanyProvider>
  );
}
