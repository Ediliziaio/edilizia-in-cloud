/**
 * IosBillingBlocked — schermata mostrata su iOS native (Capacitor) al posto
 * delle pagine di gestione abbonamento / upgrade.
 *
 * Motivazione App Store (Apple Guideline 3.1.1):
 * Tutti gli acquisti di funzionalità digitali devono avvenire via Apple IAP
 * con la commissione 30%. Edilizia in Cloud usa Stripe per la subscription
 * dell'azienda (modello B2B SaaS), quindi su iOS dobbiamo nascondere
 * checkout/upgrade/portal Stripe e invitare l'utente a gestire l'abbonamento
 * dal browser web (ediliziaincloud.com).
 *
 * Su web e Android (Play Store) la pagina originale resta visibile.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, Smartphone } from "lucide-react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const BILLING_PORTAL_URL = "https://www.ediliziaincloud.com/azienda/impostazioni/abbonamento";

export function IosBillingBlocked() {
  const t = useT();
  return (
    <div className="container max-w-2xl mx-auto p-4 pt-8">
      <Card>
        <CardHeader className="text-center pb-3">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
            <Smartphone className="h-7 w-7 text-blue-700" />
          </div>
          <CardTitle className="text-xl">{t("Gestione abbonamento")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("La gestione del piano di abbonamento e dei pagamenti è disponibile dal browser web sul sito ufficiale.")}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("Tutte le altre funzionalità del gestionale (cantieri, fatturazione, personale, Silvio AI) restano disponibili qui nell'app.")}
          </p>
          <div className="pt-2">
            <Button
              asChild
              size="lg"
              className="w-full sm:w-auto"
            >
              <a
                href={BILLING_PORTAL_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Globe className="h-4 w-4 mr-2" />
                {t("Apri sito web")}
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-2">
            {t("Sito: ediliziaincloud.com")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default IosBillingBlocked;
