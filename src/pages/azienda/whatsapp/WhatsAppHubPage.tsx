// MP04 + MP-FINAL — Hub WhatsApp con sub-tabs (Numeri/Template/Broadcast/Notifiche).

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WhatsAppMultiNumeroTab } from "@/components/whatsapp-multi/WhatsAppMultiNumeroTab";
import TemplatesPage from "./TemplatesPage";
import NotificheConfigPage from "./NotificheConfigPage";
import BroadcastListPage from "./BroadcastListPage";
import { useSearchParams } from "react-router-dom";

export default function WhatsAppHubPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "numeri";

  const onChangeTab = (value: string) => {
    params.set("tab", value);
    setParams(params, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card px-4 py-3 md:px-6">
        <Tabs value={tab} onValueChange={onChangeTab} className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="numeri" aria-label="Tab Numeri">Numeri</TabsTrigger>
            <TabsTrigger value="template" aria-label="Tab Template">Template</TabsTrigger>
            <TabsTrigger value="broadcast" aria-label="Tab Broadcast">Broadcast</TabsTrigger>
            <TabsTrigger value="notifiche" aria-label="Tab Notifiche">Notifiche</TabsTrigger>
          </TabsList>

          <TabsContent value="numeri" className="mt-0">
            <WhatsAppMultiNumeroTab />
          </TabsContent>
          <TabsContent value="template" className="mt-0">
            <TemplatesPage />
          </TabsContent>
          <TabsContent value="broadcast" className="mt-0">
            <BroadcastListPage />
          </TabsContent>
          <TabsContent value="notifiche" className="mt-0">
            <NotificheConfigPage />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
