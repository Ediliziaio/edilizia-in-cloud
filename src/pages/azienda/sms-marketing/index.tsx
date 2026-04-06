import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Send, Users, FileText } from "lucide-react";
import { SmsDashboard } from "./components/SmsDashboard";
import { SmsCampagneList } from "./components/SmsCampagneList";
import { SmsContattiList } from "./components/SmsContattiList";
import { SmsTemplateList } from "./components/SmsTemplateList";
import { SmsOnboarding } from "./components/SmsOnboarding";
import { SmsWalletBadge } from "./components/SmsWalletBadge";
import { SmsRicaricaModal } from "./components/SmsRicaricaModal";
import { useSmsProviderConfig } from "@/hooks/useSmsProviderConfig";
import { useTelnyxSetup } from "@/hooks/useTelnyxSetup";
import { Skeleton } from "@/components/ui/skeleton";

interface SmsMarketingPageProps {
  defaultTab?: string;
}

const SmsMarketingPage = ({ defaultTab = "dashboard" }: SmsMarketingPageProps) => {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [ricaricaOpen, setRicaricaOpen] = useState(false);

  const { config, isLoading: isLoadingConfig } = useSmsProviderConfig();
  const { isOnboardingCompleto, isLoading: isLoadingTelnyx } = useTelnyxSetup();

  // Considera onboarding completo se il config dice true O se c'è un numero attivo
  const onboardingOk = config?.onboarding_completato || isOnboardingCompleto;

  const handleOnboardingCompleted = () => {
    // Il hook si invaliderà automaticamente dopo l'acquisto del numero
    // Non serve setState — le query si ricaricano
  };

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SMS Marketing</h1>
          <p className="text-muted-foreground">Gestisci campagne SMS, contatti e template</p>
        </div>
        {onboardingOk && (
          <SmsWalletBadge onRicarica={() => setRicaricaOpen(true)} />
        )}
      </div>

      {!onboardingOk ? (
        <SmsOnboarding onCompleted={handleOnboardingCompleted} />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard" className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="campagne" className="gap-1.5">
              <Send className="h-4 w-4" />
              Campagne
            </TabsTrigger>
            <TabsTrigger value="contatti" className="gap-1.5">
              <Users className="h-4 w-4" />
              Contatti
            </TabsTrigger>
            <TabsTrigger value="template" className="gap-1.5">
              <FileText className="h-4 w-4" />
              Template
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4">
            <SmsDashboard onRicarica={() => setRicaricaOpen(true)} />
          </TabsContent>
          <TabsContent value="campagne" className="mt-4">
            <SmsCampagneList />
          </TabsContent>
          <TabsContent value="contatti" className="mt-4">
            <SmsContattiList />
          </TabsContent>
          <TabsContent value="template" className="mt-4">
            <SmsTemplateList />
          </TabsContent>
        </Tabs>
      )}

      <SmsRicaricaModal open={ricaricaOpen} onOpenChange={setRicaricaOpen} />
    </div>
  );
};

export default SmsMarketingPage;
