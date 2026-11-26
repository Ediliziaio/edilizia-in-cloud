/**
 * @file index.tsx
 * @description Hub SMS unificato — sostituisce la divisione fra
 *              /azienda/sms-marketing (campagne+contatti+template) e
 *              /azienda/sms (compose+storico+automazioni). I termini "Marketing"
 *              vs "Transazionale" creavano confusione per gli imprenditori edili.
 *              Tutto qui dentro, 7 tab logiche.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-05-25
 */

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  Send,
  Megaphone,
  Zap,
  Users,
  FileText,
  History,
} from "lucide-react";
import { useSmsProviderConfig } from "@/hooks/useSmsProviderConfig";
import { useTelnyxSetup } from "@/hooks/useTelnyxSetup";
import { useIsMobile } from "@/hooks/use-mobile";
import { AvvisoSoloDaComputer } from "@/components/mobile/SoloDaComputer";

// Componenti "Campagne" (ex sms-marketing)
import { SmsDashboard as SmsMarketingDashboard } from "@/pages/azienda/sms-marketing/components/SmsDashboard";
import { SmsCampagneList } from "@/pages/azienda/sms-marketing/components/SmsCampagneList";
import { SmsContattiList } from "@/pages/azienda/sms-marketing/components/SmsContattiList";
import { SmsTemplateList } from "@/pages/azienda/sms-marketing/components/SmsTemplateList";
import { SmsOnboarding } from "@/pages/azienda/sms-marketing/components/SmsOnboarding";
import { PlatformSmsActivationCard } from "./PlatformSmsActivationCard";
import { SmsWalletBadge } from "@/pages/azienda/sms-marketing/components/SmsWalletBadge";
import { SmsRicaricaModal } from "@/pages/azienda/sms-marketing/components/SmsRicaricaModal";
import { useSmsRicaricaEsito } from "@/hooks/useSmsWallet";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";

// Componenti "Singolo" (esistenti in questa cartella)
import { SmsCompose } from "./SmsCompose";
import { SmsHistory } from "./SmsHistory";
import { SmsAutomations } from "./SmsAutomations";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface SmsHubPageProps {
  defaultTab?: string;
  /** Area super admin: la piattaforma non paga il canone €30/mese
   *  (è il prezzo rivenduto alle aziende) → onboarding dedicato. */
  platformMode?: boolean;
}

// Mapping retro-compatibile per i vecchi tab name di sms-marketing
const TAB_ALIASES: Record<string, string> = {
  dashboard: "panoramica",
  campagne: "campagne",
  contatti: "contatti",
  template: "template",
  invio: "invia",
  storico: "storico",
  automazioni: "automazioni",
};

// Telefono: si manda un SMS e si guarda cosa è partito. Campagne, automazioni,
// contatti e modelli si preparano da computer o tablet.
const SCHEDE_TELEFONO = ["panoramica", "invia", "storico"];

export default function SmsPage({ defaultTab = "panoramica", platformMode = false }: SmsHubPageProps) {
  const t = useT();
  const initial = TAB_ALIASES[defaultTab] ?? defaultTab;
  const [activeTab, setActiveTab] = useState(initial);
  const isMobile = useIsMobile();
  const schedaVisibile = isMobile && !SCHEDE_TELEFONO.includes(activeTab) ? "panoramica" : activeTab;
  const [ricaricaOpen, setRicaricaOpen] = useState(false);
  const [params] = useSearchParams();
  const esitoRicarica = params.get("ricarica");
  const sessionId = params.get("session_id");
  const sessioneValida = esitoRicarica === "in_attesa" && sessionId && /^cs_(test|live)_[a-zA-Z0-9_]+$/.test(sessionId);
  const ricevuta = useSmsRicaricaEsito(sessioneValida ? sessionId : null);
  const { isScopriPlan } = useSubscriptionLimits();

  const { config, isLoading: isLoadingConfig } = useSmsProviderConfig();
  const { isOnboardingCompleto, isLoading: isLoadingTelnyx } = useTelnyxSetup();
  const onboardingOk = config?.onboarding_completato || isOnboardingCompleto;

  if (isLoadingConfig || isLoadingTelnyx) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isScopriPlan) return <UpgradeScopriWall type="marketing" inline />;

  return (
    <div className="space-y-6 max-md:space-y-3">
      {/* Header — solo il titolo (e il credito), come sul telefono: da tablet
          c'erano icona e lo slogan «Campagne bulk, invii singoli, automazioni». */}
      <div className="flex items-start justify-between gap-4 flex-wrap max-md:items-center max-md:gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground max-md:text-lg">SMS</h1>
        </div>
        {onboardingOk && <SmsWalletBadge onRicarica={() => setRicaricaOpen(true)} />}
      </div>

      {esitoRicarica === "annullata" && (
        <div role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">{t("Pagamento annullato. Puoi avviare un’altra ricarica.")}</div>
      )}
      {sessioneValida && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          {ricevuta.data ? (
            <span><strong>{t("Crediti accreditati.")}</strong> {t("{importo} aggiunti al portafoglio SMS.", { importo: formatCurrency(ricevuta.data.credit_cents / 100) })}</span>
          ) : (
            <>
              <span>
                {ricevuta.isError ? t("Impossibile verificare l’accredito.") : t("Pagamento in verifica. L’accredito risulterà qui appena registrato.")}
              </span>
              <Button size="sm" variant="outline" disabled={ricevuta.isFetching} onClick={() => void ricevuta.refetch()}>
                {t("Verifica accredito")}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Onboarding bloccante: se manca Telnyx, mostra solo l'onboarding.
          In platformMode (super admin) niente paywall €30/mese. */}
      {!onboardingOk ? (
        isMobile ? (
          // Telefono: il numero (acquisto e verifica) si attiva da computer o tablet.
          <AvvisoSoloDaComputer titolo={t("Il numero SMS si attiva da computer o tablet")} />
        ) : platformMode ? (
          <PlatformSmsActivationCard />
        ) : (
          <SmsOnboarding onCompleted={() => { /* react-query si invalida automaticamente */ }} />
        )
      ) : (
        <Tabs value={schedaVisibile} onValueChange={setActiveTab}>
          {/* Da tablet le schede prendono la larghezza del testo e le icone
              compaiono solo da 1280: in sette colonne uguali a 1024 le icone
              venivano schiacciate a zero e sparivano da metà delle schede. */}
          <TabsList className="grid w-full max-w-4xl grid-cols-3 sm:grid-cols-7 md:inline-flex md:w-auto md:max-w-none max-md:h-auto max-md:p-1">
            <TabsTrigger value="panoramica" className="gap-1.5 max-md:text-[13px]">
              <BarChart3 className="hidden h-4 w-4 xl:block" />
              <span className="hidden sm:inline max-md:inline">{t("Panoramica")}</span>
            </TabsTrigger>
            <TabsTrigger value="invia" className="gap-1.5 max-md:text-[13px]">
              <Send className="hidden h-4 w-4 xl:block" />
              <span className="hidden sm:inline max-md:inline">{t("Invia ora")}</span>
            </TabsTrigger>
            <TabsTrigger value="campagne" className="gap-1.5 max-md:hidden">
              <Megaphone className="hidden h-4 w-4 xl:block" />
              <span className="hidden sm:inline">{t("Campagne")}</span>
            </TabsTrigger>
            <TabsTrigger value="automazioni" className="gap-1.5 max-md:hidden">
              <Zap className="hidden h-4 w-4 xl:block" />
              <span className="hidden sm:inline">{t("Automazioni")}</span>
            </TabsTrigger>
            <TabsTrigger value="contatti" className="gap-1.5 max-md:hidden">
              <Users className="hidden h-4 w-4 xl:block" />
              <span className="hidden sm:inline">{t("Contatti")}</span>
            </TabsTrigger>
            <TabsTrigger value="template" className="gap-1.5 max-md:hidden">
              <FileText className="hidden h-4 w-4 xl:block" />
              <span className="hidden sm:inline">{t("Template")}</span>
            </TabsTrigger>
            <TabsTrigger value="storico" className="gap-1.5 max-md:text-[13px]">
              <History className="hidden h-4 w-4 xl:block" />
              <span className="hidden sm:inline max-md:inline">{t("Storico")}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="panoramica" className="mt-4">
            <SmsMarketingDashboard onRicarica={() => setRicaricaOpen(true)} />
          </TabsContent>

          <TabsContent value="invia" className="mt-4">
            <div className="max-w-lg">
              <SmsCompose />
            </div>
          </TabsContent>

          <TabsContent value="campagne" className="mt-4">
            <SmsCampagneList />
          </TabsContent>

          <TabsContent value="automazioni" className="mt-4">
            <SmsAutomations />
          </TabsContent>

          <TabsContent value="contatti" className="mt-4">
            <SmsContattiList />
          </TabsContent>

          <TabsContent value="template" className="mt-4">
            <SmsTemplateList />
          </TabsContent>

          <TabsContent value="storico" className="mt-4">
            <SmsHistory />
          </TabsContent>
        </Tabs>
      )}

      <SmsRicaricaModal open={ricaricaOpen} onOpenChange={setRicaricaOpen} />
    </div>
  );
}
