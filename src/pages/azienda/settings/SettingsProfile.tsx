import { Link } from "react-router-dom";
import { Building2, Users, Image as ImageIcon, Percent, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogoUploader } from "@/components/settings/LogoUploader";
import { CompanyProfileForm } from "@/components/settings/CompanyProfileForm";
import { CustomerPortalToggle } from "@/components/settings/CustomerPortalToggle";
import { BonusFiscaliToggles } from "@/components/settings/BonusFiscaliToggles";
import { RecensioniOnlineForm } from "@/components/settings/RecensioniOnlineForm";

// Mobile: riquadri con margini da 16px e senza spiegazioni.
const TESTA_CARD = "max-sm:p-4 max-sm:pb-2";
const CORPO_CARD = "max-sm:p-4 max-sm:pt-0";

export default function SettingsProfile() {
  const { effectiveCompany, refreshAuth } = useAuth();
  const permissions = usePermissions();

  // Onora i permessi granulari. Prima la pagina era gated SOLO su isAdmin: uno
  // staff con "Profilo Aziendale" concesso passava il route-guard ma vedeva una
  // pagina VUOTA (permesso di fatto morto). Ora: view = mostra i dati,
  // edit = consenti la modifica.
  const canView = permissions.isAdmin || permissions.canViewSettingsProfile;
  const canEdit = permissions.isAdmin || permissions.canEditSettingsProfile;

  // La route è già protetta da canViewSettingsProfile; guardia difensiva.
  if (!canView) return null;

  return (
    <div className="space-y-6 max-sm:space-y-3">
      {/* Solo l'eventuale «Sola lettura»: il titolo «Profilo Azienda» con icona
          e frase ripeteva la testata delle impostazioni (sul telefono era già
          nascosto; ora anche da tablet). */}
      {/* Il contenitore resta anche vuoto (nascosto): con space-y tiene lo
          stesso margine sopra la prima card, sul telefono come prima. */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${canEdit ? "hidden" : ""}`}>
        {!canEdit && (
          <Badge variant="secondary" className="shrink-0 self-start">Sola lettura</Badge>
        )}
      </div>

      {/* Logo + Portale clienti: solo con permesso di modifica */}
      {canEdit && (
        <Card>
          <CardHeader className={TESTA_CARD}>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              Logo Azienda
            </CardTitle>
            <CardDescription className="max-sm:hidden">
              Logo usato su preventivi PDF, email, portale clienti e branding generale.
              Per il white-label completo (colori, favicon, nome) vai in{" "}
              {/* Il link mostrava il percorso «/branding»: ora il nome della pagina. */}
              <Link to="/azienda/impostazioni/branding" className="underline font-medium">White-Label</Link>.
            </CardDescription>
          </CardHeader>
          <CardContent className={CORPO_CARD}>
            <LogoUploader company={effectiveCompany} onLogoUpdated={refreshAuth} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className={TESTA_CARD}>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Anagrafica Azienda
          </CardTitle>
          <CardDescription className="max-sm:hidden">
            Dati fiscali, contatti, sede legale. Per le <Link to="/azienda/impostazioni/sedi" className="underline font-medium">sedi operative</Link>{" "}
            (showroom, cantieri, magazzini) e la <Link to="/azienda/impostazioni/fatturazione-nativa" className="underline font-medium">configurazione fatturazione elettronica</Link>
            {" "}gestiscile dalle rispettive pagine.
          </CardDescription>
        </CardHeader>
        <CardContent className={CORPO_CARD}>
          <CompanyProfileForm canEdit={canEdit} />
        </CardContent>
      </Card>

      {/* Il voto su Google, Trustpilot…: una volta qui, vale per tutti i preventivi.
          Mobile no, come portale clienti e bonus: si impostano una volta, al computer. */}
      <Card className="max-sm:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="h-4 w-4 text-muted-foreground" />
            Recensioni online
          </CardTitle>
          <CardDescription>
            Il tuo voto su Google, Trustpilot o altre piattaforme: nei preventivi esce nella pagina
            «Dicono di noi», accanto alle parole dei clienti scritte nei modelli.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecensioniOnlineForm canEdit={canEdit} />
        </CardContent>
      </Card>

      {canEdit && (
        <Card className="max-sm:hidden">
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
      )}

      {canEdit && (
        <Card className="max-sm:hidden">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Percent className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <CardTitle>Bonus fiscali e blocca prezzo</CardTitle>
                <CardDescription>
                  Funzioni per chi lavora con le detrazioni edilizie: attivale solo se ti servono.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <BonusFiscaliToggles />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
