import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Send, Users, FileText } from "lucide-react";
import { SmsDashboard } from "./components/SmsDashboard";
import { SmsCampagneList } from "./components/SmsCampagneList";
import { SmsContattiList } from "./components/SmsContattiList";
import { SmsTemplateList } from "./components/SmsTemplateList";

const SmsMarketingPage = () => {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">SMS Marketing</h1>
        <p className="text-muted-foreground">Gestisci campagne SMS, contatti e template</p>
      </div>

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
          <SmsDashboard />
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
    </div>
  );
};

export default SmsMarketingPage;
