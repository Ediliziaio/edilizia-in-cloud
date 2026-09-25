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
import { useWhatsAppBase } from "./useWhatsAppBase";
import { useIsMobile } from "@/hooks/use-mobile";
import { AvvisoSoloDaComputer } from "@/components/mobile/SoloDaComputer";

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

  // Telefono: tutto l'hub è impostazione (collegare i numeri, regia di Silvio,
  // modelli Meta, invii di massa, notifiche) e si fa da computer o tablet.
  // Le conversazioni si leggono e si rispondono dal CRM, dove stanno.
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-bold">{isAdminContext ? "WhatsApp Marketing" : "WhatsApp"}</h1>
        <AvvisoSoloDaComputer titolo="Numeri, regia AI, modelli e invii WhatsApp si impostano da computer o tablet" />
      </div>
    );
  }

  // Testata come nelle altre pagine: titolo e schede. Via la card bianca che
  // conteneva tutta la pagina (doppio margine), il bollino «WhatsApp Business»,
  // le due righe di spiegazione e i tre riquadri «Marketing umano / Cantieri
  // con AI / Notifiche e ticket», che sembravano bottoni ma non lo erano e a
  // 1024 andavano a capo. Il nome è «WhatsApp», come nel menu e sul telefono.
  return (
    <div>
      <Tabs value={tab} onValueChange={onChangeTab} className="w-full">
        <h1 className="mb-4 text-2xl font-bold">{isAdminContext ? "WhatsApp Marketing" : "WhatsApp"}</h1>
        {/* Schede larghe quanto il testo (erano colonne uguali su 768px). */}
        <TabsList className="mb-4">
          <TabsTrigger value="numeri" aria-label="Tab Numeri">Numeri</TabsTrigger>
          {!isAdminContext && (
            <TabsTrigger value="regia" aria-label="Tab Regia operativa">Regia</TabsTrigger>
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
          <BroadcastListPage nelHub />
        </TabsContent>
        {!isAdminContext && (
          <TabsContent value="notifiche" className="mt-0">
            <NotificheConfigPage />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
