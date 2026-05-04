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

const EmailMarketing = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    requestedTab === "campagne" || requestedTab === "modelli" || requestedTab === "statistiche"
      ? requestedTab
      : "statistiche"
  );
  const { isScopriPlan } = useSubscriptionLimits();

  useEffect(() => {
    if (requestedTab === "campagne" || requestedTab === "modelli" || requestedTab === "statistiche") {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams(value === "statistiche" ? {} : { tab: value }, { replace: true });
  };

  if (isScopriPlan) return <UpgradeScopriWall type="marketing" inline />;

  return (
    <div className="space-y-6">
      <ApiHealthBanner filter={["email_marketing"]} />

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Email Marketing</h1>
            <p className="text-sm text-slate-600">Gestisci campagne, template e monitora le performance</p>
          </div>
        </div>
      </div>

      {/* Banner riepilogo crediti — minimal, mostra alert solo se saldo basso o
          quota superata. Saldo/Speso/Ricaricato + Quota mese sono nella pagina
          dedicata Impostazioni → Crediti & Saldo (link in basso al banner). */}
      <EmailCreditsBanner />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-auto gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <TabsTrigger value="statistiche" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <BarChart3 className="h-4 w-4" />
            Statistiche
          </TabsTrigger>
          <TabsTrigger value="campagne" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <Send className="h-4 w-4" />
            Campagne
          </TabsTrigger>
          <TabsTrigger value="modelli" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <FileText className="h-4 w-4" />
            Modelli
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
