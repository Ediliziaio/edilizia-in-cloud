/**
 * @file index.tsx
 * @description Hub principale del modulo SMS Transazionale.
 *              Gestisce messaggi individuali e automazioni su eventi aziendali.
 *              Separato da /azienda/sms-marketing (campagne bulk).
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { useState } from "react";
import { MessageSquare, Send, History, Zap, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTelnyxSetup } from "@/hooks/useTelnyxSetup";
import { useSmsProviderConfig } from "@/hooks/useSmsProviderConfig";
import { SmsWalletBadge } from "@/pages/azienda/sms-marketing/components/SmsWalletBadge";
import { SmsRicaricaModal } from "@/pages/azienda/sms-marketing/components/SmsRicaricaModal";
import { Skeleton } from "@/components/ui/skeleton";
import { SmsDashboard } from "./SmsDashboard";
import { SmsCompose } from "./SmsCompose";
import { SmsHistory } from "./SmsHistory";
import { SmsAutomations } from "./SmsAutomations";

interface SmsPaginaProps {
  defaultTab?: string;
}

export default function SmsPage({ defaultTab = "dashboard" }: SmsPaginaProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [ricaricaOpen, setRicaricaOpen] = useState(false);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-[#1E3A5F]" />
            SMS Transazionale
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Invio diretto e automazioni SMS basate su eventi aziendali
          </p>
        </div>
        {onboardingOk && (
          <SmsWalletBadge onRicarica={() => setRicaricaOpen(true)} />
        )}
      </div>

      {/* Avviso se Telnyx non configurato */}
      {!onboardingOk && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-700">
            Il numero SMS non è ancora attivo. Configura prima il numero nel modulo{" "}
            <a href="/azienda/sms-marketing" className="font-semibold underline underline-offset-2">
              SMS Marketing → Impostazioni
            </a>{" "}
            per poter inviare messaggi.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <MessageSquare className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="invio" className="gap-1.5" disabled={!onboardingOk}>
            <Send className="h-4 w-4" />
            Invia SMS
          </TabsTrigger>
          <TabsTrigger value="storico" className="gap-1.5">
            <History className="h-4 w-4" />
            Storico
          </TabsTrigger>
          <TabsTrigger value="automazioni" className="gap-1.5">
            <Zap className="h-4 w-4" />
            Automazioni
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <SmsDashboard />
        </TabsContent>

        <TabsContent value="invio" className="mt-6">
          <div className="max-w-lg">
            <SmsCompose />
          </div>
        </TabsContent>

        <TabsContent value="storico" className="mt-6">
          <SmsHistory />
        </TabsContent>

        <TabsContent value="automazioni" className="mt-6">
          <SmsAutomations />
        </TabsContent>
      </Tabs>

      <SmsRicaricaModal open={ricaricaOpen} onClose={() => setRicaricaOpen(false)} />
    </div>
  );
}
