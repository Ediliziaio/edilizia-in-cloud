import { Building2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoUploader } from "@/components/settings/LogoUploader";
import { CompanyProfileForm } from "@/components/settings/CompanyProfileForm";
import { PersonalProfileForm } from "@/components/settings/PersonalProfileForm";

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
        </>
      )}
    </div>
  );
}
