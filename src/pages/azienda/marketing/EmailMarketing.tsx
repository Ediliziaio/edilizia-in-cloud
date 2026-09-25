import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Send, FileText, Mail } from "lucide-react";
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

      {/* Telefono: solo il titolo e dove si creano le campagne, senza riquadro né icona. */}
      <div className="rounded-2xl border bg-gradient-to-br from-card via-card to-orange-50/50 p-5 shadow-sm dark:to-orange-950/20 max-sm:rounded-none max-sm:border-0 max-sm:bg-none max-sm:p-0 max-sm:shadow-none">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200 dark:shadow-orange-950 max-sm:hidden">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground max-sm:text-lg">Email Marketing</h1>
            <p className="text-sm text-muted-foreground max-sm:hidden">Gestisci campagne, template e monitora le performance</p>
            <p className="text-[11px] text-muted-foreground sm:hidden">le campagne si creano da computer o tablet</p>
          </div>
        </div>
      </div>

      {/* Banner riepilogo crediti — minimal, mostra alert solo se saldo basso o
          quota superata. Saldo/Speso/Ricaricato + Quota mese sono nella pagina
          dedicata Impostazioni → Crediti & Saldo (link in basso al banner). */}
      <EmailCreditsBanner />

      <Tabs value={schedaVisibile} onValueChange={handleTabChange}>
        {/* Telefono: Campagne e Statistiche; i modelli si preparano dal computer. */}
        <TabsList className="h-auto gap-1 rounded-2xl border bg-card p-2 shadow-sm max-sm:w-full max-sm:rounded-xl max-sm:p-1 max-sm:shadow-none">
          <TabsTrigger value="campagne" className="gap-1.5 max-sm:flex-1 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 dark:data-[state=active]:bg-orange-950/50 dark:data-[state=active]:text-orange-300">
            <Send className="h-4 w-4 max-sm:hidden" />
            Campagne
          </TabsTrigger>
          <TabsTrigger value="modelli" className="gap-1.5 max-sm:hidden data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 dark:data-[state=active]:bg-orange-950/50 dark:data-[state=active]:text-orange-300">
            <FileText className="h-4 w-4" />
            Modelli
          </TabsTrigger>
          <TabsTrigger value="statistiche" className="gap-1.5 max-sm:flex-1 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 dark:data-[state=active]:bg-orange-950/50 dark:data-[state=active]:text-orange-300">
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
