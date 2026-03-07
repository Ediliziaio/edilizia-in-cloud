import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Send, FileText } from "lucide-react";
import { EmailStatsTab } from "@/components/email-marketing/EmailStatsTab";
import { EmailCampaignsTab } from "@/components/email-marketing/EmailCampaignsTab";
import { EmailTemplatesTab } from "@/components/email-marketing/EmailTemplatesTab";
import { EmailCreditsWidget } from "@/components/email-marketing/EmailCreditsWidget";
import { ApiHealthBanner } from "@/components/marketing/ApiHealthBanner";

const EmailMarketing = () => {
  const [activeTab, setActiveTab] = useState("statistiche");

  return (
    <div className="space-y-6">
      <ApiHealthBanner filter={["email"]} />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Email Marketing</h1>
        <p className="text-muted-foreground">Gestisci campagne, template e monitora le performance</p>
      </div>

      <EmailCreditsWidget />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="statistiche" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Statistiche
          </TabsTrigger>
          <TabsTrigger value="campagne" className="gap-1.5">
            <Send className="h-4 w-4" />
            Campagne
          </TabsTrigger>
          <TabsTrigger value="modelli" className="gap-1.5">
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
