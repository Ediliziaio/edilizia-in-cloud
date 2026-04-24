import { Building2, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoUploader } from "@/components/settings/LogoUploader";
import { CompanyProfileForm } from "@/components/settings/CompanyProfileForm";
import { PersonalProfileForm } from "@/components/settings/PersonalProfileForm";
import { CustomerPortalToggle } from "@/components/settings/CustomerPortalToggle";

export default function SettingsProfile() {
  const { effectiveCompany, role, refreshAuth } = useAuth();

  const isAdmin = role === "company_admin" || role === "super_admin";

  return (
    <div className="space-y-6">
      {/* Profilo personale - visibile a tutti */}
      <PersonalProfileForm />

      {/* Profilo azienda - solo per admin */}
      {isAdmin && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Logo Azienda
              </CardTitle>
              <CardDescription>Carica o modifica il logo della tua azienda</CardDescription>
            </CardHeader>
            <CardContent>
              <LogoUploader company={effectiveCompany} onLogoUpdated={refreshAuth} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Anagrafica Azienda
              </CardTitle>
              <CardDescription>Gestisci i dati fiscali, contatti e sedi della tua azienda</CardDescription>
            </CardHeader>
            <CardContent>
              <CompanyProfileForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Portale clienti</CardTitle>
                  <CardDescription>
                    Scegli se abilitare o meno l'accesso riservato per i tuoi clienti.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CustomerPortalToggle />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
