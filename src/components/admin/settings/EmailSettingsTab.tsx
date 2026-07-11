import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, DollarSign, BarChart3, ScrollText, MessageSquare, Inbox } from "lucide-react";
import { EmailProviderConfig } from "./email/EmailProviderConfig";
import { EmailWebhookConfig } from "./email/EmailWebhookConfig";
import { EmailPricingConfig } from "./email/EmailPricingConfig";
import { EmailDashboard } from "./email/EmailDashboard";
import { EmailDeliveryLog } from "./email/EmailDeliveryLog";
import { WhatsAppPricingConfig } from "./email/WhatsAppPricingConfig";
import { EmailOutboxPanel } from "./email/EmailOutboxPanel";

export default function EmailSettingsTab() {
  return (
    <Tabs defaultValue="providers" className="space-y-6">
      {/* Scroll orizzontale: 6 trigger non stanno nella main area a larghezze
          medie (sidebar shell a sinistra) e senza scroll sbordano dalla card. */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <TabsList className="w-max">
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
          <TabsTrigger value="outbox" className="gap-2">
            <Inbox className="h-4 w-4" /> Outbox
          </TabsTrigger>
          <TabsTrigger value="whatsapp-pricing" className="gap-2">
            <MessageSquare className="h-4 w-4" /> Prezzi WhatsApp
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="providers" className="space-y-6">
        <EmailWebhookConfig />
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

      <TabsContent value="outbox">
        <EmailOutboxPanel />
      </TabsContent>

      <TabsContent value="whatsapp-pricing">
        <WhatsAppPricingConfig />
      </TabsContent>
    </Tabs>
  );
}
