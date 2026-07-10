// MP04 + MP-FINAL — Hub WhatsApp con sub-tabs (Numeri/Template/Broadcast/Notifiche).
//
// Variante ADMIN MARKETING (/admin/marketing/whatsapp): mostra SOLO la parte
// marketing (Numeri, Template, Broadcast). "Regia operativa" (cantieri con AI)
// e "Notifiche" (ticket/cantieri) sono strumenti operativi per-azienda, fuori
// scope nell'area marketing del superadmin — richiesta esplicita di Florin.
// Il tenant (/azienda/whatsapp) resta invariato con tutti e 5 i tab.

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WhatsAppMultiNumeroTab } from "@/components/whatsapp-multi/WhatsAppMultiNumeroTab";
import TemplatesPage from "./TemplatesPage";
import NotificheConfigPage from "./NotificheConfigPage";
import BroadcastListPage from "./BroadcastListPage";
import OperationalControlPage from "./OperationalControlPage";
import { useSearchParams } from "react-router-dom";
import { Bell, Bot, Megaphone, MessageSquare } from "lucide-react";
import { useWhatsAppBase } from "./useWhatsAppBase";

const ALL_TABS = ["numeri", "regia", "template", "broadcast", "notifiche"] as const;
const MARKETING_TABS = ["numeri", "template", "broadcast"] as const;
type WhatsAppHubTab = typeof ALL_TABS[number];

export default function WhatsAppHubPage() {
  const [params, setParams] = useSearchParams();
  const { isAdminContext } = useWhatsAppBase();
  const validTabs: readonly WhatsAppHubTab[] = isAdminContext ? MARKETING_TABS : ALL_TABS;

  const normalizeTab = (value: string | null): WhatsAppHubTab =>
    validTabs.includes(value as WhatsAppHubTab) ? (value as WhatsAppHubTab) : "numeri";
  const tab = normalizeTab(params.get("tab"));

  const onChangeTab = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", normalizeTab(value));
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card px-4 py-4 md:px-6">
        <Tabs value={tab} onValueChange={onChangeTab} className="w-full">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <MessageSquare className="h-3.5 w-3.5" />
                WhatsApp Business
              </div>
              <h1 className="text-2xl font-bold">{isAdminContext ? "WhatsApp Marketing" : "Centro WhatsApp"}</h1>
              <p className="text-sm text-muted-foreground">
                {isAdminContext
                  ? "Numeri, template approvati Meta e broadcast per l'acquisizione clienti."
                  : "Tre linee aziendali: commerciale, cantieri e amministrazione. Silvio usa ogni numero con regole diverse."}
              </p>
            </div>
            {!isAdminContext && (
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <span className="rounded-lg border bg-background px-3 py-2"><Megaphone className="mr-1.5 inline h-3.5 w-3.5" />Marketing umano</span>
                <span className="rounded-lg border bg-background px-3 py-2"><MessageSquare className="mr-1.5 inline h-3.5 w-3.5" />Cantieri con AI</span>
                <span className="rounded-lg border bg-background px-3 py-2"><Bell className="mr-1.5 inline h-3.5 w-3.5" />Notifiche e ticket</span>
              </div>
            )}
          </div>
          <TabsList className={`grid w-full ${isAdminContext ? "max-w-md grid-cols-3" : "max-w-3xl grid-cols-2 sm:grid-cols-5"}`}>
            <TabsTrigger value="numeri" aria-label="Tab Numeri">Numeri</TabsTrigger>
            {!isAdminContext && (
              <TabsTrigger value="regia" aria-label="Tab Regia operativa">
                <Bot className="mr-1.5 h-3.5 w-3.5" />
                Regia
              </TabsTrigger>
            )}
            <TabsTrigger value="template" aria-label="Tab Template">Template</TabsTrigger>
            <TabsTrigger value="broadcast" aria-label="Tab Broadcast">Broadcast</TabsTrigger>
            {!isAdminContext && <TabsTrigger value="notifiche" aria-label="Tab Notifiche">Notifiche</TabsTrigger>}
          </TabsList>

          <TabsContent value="numeri" className="mt-0">
            <WhatsAppMultiNumeroTab />
          </TabsContent>
          {!isAdminContext && (
            <TabsContent value="regia" className="mt-0">
              <OperationalControlPage />
            </TabsContent>
          )}
          <TabsContent value="template" className="mt-0">
            <TemplatesPage />
          </TabsContent>
          <TabsContent value="broadcast" className="mt-0">
            <BroadcastListPage />
          </TabsContent>
          {!isAdminContext && (
            <TabsContent value="notifiche" className="mt-0">
              <NotificheConfigPage />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
