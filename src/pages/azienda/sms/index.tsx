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
  MessageSquare,
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

// Componenti "Singolo" (esistenti in questa cartella)
import { SmsCompose } from "./SmsCompose";
import { SmsHistory } from "./SmsHistory";
import { SmsAutomations } from "./SmsAutomations";

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
  const initial = TAB_ALIASES[defaultTab] ?? defaultTab;
  const [activeTab, setActiveTab] = useState(initial);
  const isMobile = useIsMobile();
  const schedaVisibile = isMobile && !SCHEDE_TELEFONO.includes(activeTab) ? "panoramica" : activeTab;
  const [ricaricaOpen, setRicaricaOpen] = useState(false);
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
      {/* Header — telefono: solo il titolo (e il credito) */}
      <div className="flex items-start justify-between gap-4 flex-wrap max-md:items-center max-md:gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2 max-md:text-lg">
            <MessageSquare className="h-6 w-6 text-[#1E3A5F] max-md:hidden" />
            SMS
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5 max-md:hidden">
            Campagne bulk, invii singoli, automazioni — tutto in un unico posto.
          </p>
        </div>
        {onboardingOk && <SmsWalletBadge onRicarica={() => setRicaricaOpen(true)} />}
      </div>

      {/* Onboarding bloccante: se manca Telnyx, mostra solo l'onboarding.
          In platformMode (super admin) niente paywall €30/mese. */}
      {!onboardingOk ? (
        isMobile ? (
          // Telefono: il numero (acquisto e verifica) si attiva da computer o tablet.
          <AvvisoSoloDaComputer titolo="Il numero SMS si attiva da computer o tablet" />
        ) : platformMode ? (
          <PlatformSmsActivationCard />
        ) : (
          <SmsOnboarding onCompleted={() => { /* react-query si invalida automaticamente */ }} />
        )
      ) : (
        <Tabs value={schedaVisibile} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-4xl grid-cols-3 sm:grid-cols-7 max-md:h-auto max-md:p-1">
            <TabsTrigger value="panoramica" className="gap-1.5 max-md:text-[13px]">
              <BarChart3 className="h-4 w-4 max-md:hidden" />
              <span className="hidden sm:inline max-md:inline">Panoramica</span>
            </TabsTrigger>
            <TabsTrigger value="invia" className="gap-1.5 max-md:text-[13px]">
              <Send className="h-4 w-4 max-md:hidden" />
              <span className="hidden sm:inline max-md:inline">Invia ora</span>
            </TabsTrigger>
            <TabsTrigger value="campagne" className="gap-1.5 max-md:hidden">
              <Megaphone className="h-4 w-4" />
              <span className="hidden sm:inline">Campagne</span>
            </TabsTrigger>
            <TabsTrigger value="automazioni" className="gap-1.5 max-md:hidden">
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">Automazioni</span>
            </TabsTrigger>
            <TabsTrigger value="contatti" className="gap-1.5 max-md:hidden">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Contatti</span>
            </TabsTrigger>
            <TabsTrigger value="template" className="gap-1.5 max-md:hidden">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Template</span>
            </TabsTrigger>
            <TabsTrigger value="storico" className="gap-1.5 max-md:text-[13px]">
              <History className="h-4 w-4 max-md:hidden" />
              <span className="hidden sm:inline max-md:inline">Storico</span>
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
