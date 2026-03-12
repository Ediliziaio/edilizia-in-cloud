import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, DollarSign, BarChart3, ScrollText } from "lucide-react";
import { EmailProviderConfig } from "./email/EmailProviderConfig";
import { EmailPricingConfig } from "./email/EmailPricingConfig";
import { EmailDashboard } from "./email/EmailDashboard";
import { EmailDeliveryLog } from "./email/EmailDeliveryLog";

export default function EmailSettingsTab() {
  return (
    <Tabs defaultValue="providers" className="space-y-6">
      <TabsList>
        <TabsTrigger value="providers" className="gap-2">
          <Mail className="h-4 w-4" /> Provider
        </TabsTrigger>
        <TabsTrigger value="pricing" className="gap-2">
          <DollarSign className="h-4 w-4" /> Prezzi & Margini
        </TabsTrigger>
        <TabsTrigger value="dashboard" className="gap-2">
          <BarChart3 className="h-4 w-4" /> Dashboard
        </TabsTrigger>
        <TabsTrigger value="delivery-log" className="gap-2">
          <ScrollText className="h-4 w-4" /> Delivery Log
        </TabsTrigger>
      </TabsList>

      <TabsContent value="providers" className="space-y-6">
        <EmailProviderConfig stream="marketing" />
        <EmailProviderConfig stream="transactional" />
      </TabsContent>

      <TabsContent value="pricing">
        <EmailPricingConfig />
      </TabsContent>

      <TabsContent value="dashboard">
        <EmailDashboard />
      </TabsContent>

      <TabsContent value="delivery-log">
        <EmailDeliveryLog />
      </TabsContent>
    </Tabs>
  );
}
