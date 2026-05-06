import { Link } from "react-router-dom";
import { Building2, Users, User as UserIcon, Image as ImageIcon } from "lucide-react";
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
      {/* Header pattern h-10 w-10 bg-primary/10 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Profilo Azienda</h1>
            <p className="text-sm text-muted-foreground">
              Dati dell'azienda, logo e impostazioni del portale clienti.
              {isAdmin && " (riservato agli admin)"}
            </p>
          </div>
        </div>
      </div>

      {/* Profilo personale — con wrapper Card per coerenza con le altre sezioni */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="h-4 w-4 text-muted-foreground" />
            Il tuo profilo
          </CardTitle>
          <CardDescription>Dati personali, email e preferenze</CardDescription>
        </CardHeader>
        <CardContent>
          <PersonalProfileForm />
        </CardContent>
      </Card>

      {/* Profilo azienda - solo per admin */}
      {isAdmin && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                Logo Azienda
              </CardTitle>
              <CardDescription>
                Logo usato su preventivi PDF, email, portale clienti e branding generale.
                Per il white-label completo (colori, favicon, nome) vai in{" "}
                <Link to="/azienda/impostazioni/branding" className="underline font-medium">/branding</Link>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogoUploader company={effectiveCompany} onLogoUpdated={refreshAuth} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Anagrafica Azienda
              </CardTitle>
              <CardDescription>
                Dati fiscali, contatti, sede legale. Per le <Link to="/azienda/impostazioni/sedi" className="underline font-medium">sedi operative</Link>{" "}
                (showroom, cantieri, magazzini) e la <Link to="/azienda/impostazioni/fatturazione-nativa" className="underline font-medium">configurazione fatturazione elettronica</Link>
                {" "}gestiscile dalle rispettive pagine.
              </CardDescription>
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
