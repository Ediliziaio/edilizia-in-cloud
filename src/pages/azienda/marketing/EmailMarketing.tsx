import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Send, FileText } from "lucide-react";
import { EmailStatsTab } from "@/components/email-marketing/EmailStatsTab";
import { EmailCampaignsTab } from "@/components/email-marketing/EmailCampaignsTab";
import { EmailTemplatesTab } from "@/components/email-marketing/EmailTemplatesTab";
import { EmailCreditsBanner } from "@/components/email-marketing/EmailCreditsBanner";
import { ApiHealthBanner } from "@/components/marketing/ApiHealthBanner";
import { MarketingDomainGateWall } from "@/components/email-marketing/MarketingDomainGateWall";
import { useMarketingDomainGate } from "@/hooks/useMarketingDomainGate";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

const EmailMarketing = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  // Default = "campagne" (primo tab): all'apertura si atterra sulla lista
  // campagne, non sulle statistiche (ora ultimo tab, dopo Modelli).
  const [activeTab, setActiveTab] = useState(
    requestedTab === "campagne" || requestedTab === "modelli" || requestedTab === "statistiche"
      ? requestedTab
      : "campagne"
  );
  const { isScopriPlan } = useSubscriptionLimits();
  const domainGate = useMarketingDomainGate();
  const isMobile = useIsMobile();
  const schedaVisibile = isMobile && activeTab === "modelli" ? "campagne" : activeTab;

  useEffect(() => {
    if (requestedTab === "campagne" || requestedTab === "modelli" || requestedTab === "statistiche") {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams(value === "campagne" ? {} : { tab: value }, { replace: true });
  };

  if (isScopriPlan) return <UpgradeScopriWall type="marketing" inline />;

  // Gate dominio proprio: senza un dominio email verificato l'azienda non
  // può fare email marketing (stessa policy del server, che resta autorità).
  if (domainGate.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (!domainGate.allowed) return <MarketingDomainGateWall />;

  return (
    <div className="space-y-6 max-sm:space-y-3">
      <ApiHealthBanner filter={["email_marketing"]} />

      {/* Solo il titolo, come sul telefono e nelle altre pagine: da tablet
          c'erano un riquadro sfumato, l'icona e un sottotitolo che ripeteva
          le schede qui sotto. */}
      <div>
        <h1 className="text-2xl font-bold text-foreground max-sm:text-lg">Email Marketing</h1>
        <p className="text-[11px] text-muted-foreground sm:hidden">le campagne si creano da computer o tablet</p>
      </div>

      {/* Banner riepilogo crediti — minimal, mostra alert solo se saldo basso o
          quota superata. Saldo/Speso/Ricaricato + Quota mese sono nella pagina
          dedicata Impostazioni → Crediti & Saldo (link in basso al banner). */}
      <EmailCreditsBanner />

      <Tabs value={schedaVisibile} onValueChange={handleTabChange}>
        {/* Telefono: Campagne e Statistiche; i modelli si preparano dal computer.
            Da tablet le schede standard dell'app: prima stavano in una card con
            ombra e la scheda attiva era arancione, diversa da ogni altra pagina. */}
        <TabsList className="gap-1 max-sm:h-auto max-sm:w-full max-sm:rounded-xl max-sm:border max-sm:bg-card max-sm:p-1">
          <TabsTrigger value="campagne" className="gap-1.5 max-sm:flex-1 max-sm:data-[state=active]:bg-orange-50 max-sm:data-[state=active]:text-orange-700 max-sm:dark:data-[state=active]:bg-orange-950/50 max-sm:dark:data-[state=active]:text-orange-300">
            <Send className="h-4 w-4 max-sm:hidden" />
            Campagne
          </TabsTrigger>
          <TabsTrigger value="modelli" className="gap-1.5 max-sm:hidden">
            <FileText className="h-4 w-4" />
            Modelli
          </TabsTrigger>
          <TabsTrigger value="statistiche" className="gap-1.5 max-sm:flex-1 max-sm:data-[state=active]:bg-orange-50 max-sm:data-[state=active]:text-orange-700 max-sm:dark:data-[state=active]:bg-orange-950/50 max-sm:dark:data-[state=active]:text-orange-300">
            <BarChart3 className="h-4 w-4 max-sm:hidden" />
            Statistiche
          </TabsTrigger>
        </TabsList>

        <TabsContent value="statistiche">
          <EmailStatsTab />
        </TabsContent>

        <TabsContent value="campagne">
          <EmailCampaignsTab />
        </TabsContent>

        <TabsContent value="modelli">
          <EmailTemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EmailMarketing;
