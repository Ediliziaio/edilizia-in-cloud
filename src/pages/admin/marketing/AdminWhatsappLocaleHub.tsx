/**
 * WhatsApp Locale — un solo posto, tre tab.
 *
 * Prima c'erano due voci di menu (inbox e campagne) che si accendevano
 * insieme, e i numeri stavano altrove (Impostazioni): per collegare un numero
 * e poi usarlo bisognava girare per tre pagine. Qui: Conversazioni, Campagne,
 * Numeri e regole — stessa pagina, l'URL cambia con il tab cosi' i link
 * profondi (?chat=…, /campagne) continuano a funzionare.
 */

import { lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, MessageCircle, Send, Smartphone } from "lucide-react";
import { RequireSuperAdmin } from "@/components/auth/RequireSuperAdmin";

const Inbox = lazy(() => import("@/pages/admin/marketing/AdminWhatsappLocaleInbox"));
const Campagne = lazy(() => import("@/pages/admin/marketing/AdminWhatsappLocaleCampagne"));
const Numeri = lazy(() => import("@/components/admin/settings/whatsapp-locale/WhatsappLocalePanel"));

const BASE = "/admin/marketing/whatsapp-locale";
type Tab = "conversazioni" | "campagne" | "numeri";

function tabDaPath(pathname: string): Tab {
  if (pathname.startsWith(`${BASE}/campagne`)) return "campagne";
  if (pathname.startsWith(`${BASE}/numeri`)) return "numeri";
  return "conversazioni";
}

const Attesa = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

export default function AdminWhatsappLocaleHub() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const tab = tabDaPath(pathname);

  const vai = (t: string) => {
    if (t === "campagne") navigate(`${BASE}/campagne`);
    else if (t === "numeri") navigate(`${BASE}/numeri`);
    // La query (?chat=…) ha senso solo sulle conversazioni.
    else navigate(`${BASE}${tab === "conversazioni" ? search : ""}`);
  };

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={vai}>
        <TabsList>
          <TabsTrigger value="conversazioni" className="gap-1.5">
            <MessageCircle className="h-4 w-4" /> Conversazioni
          </TabsTrigger>
          <TabsTrigger value="campagne" className="gap-1.5">
            <Send className="h-4 w-4" /> Campagne
          </TabsTrigger>
          <TabsTrigger value="numeri" className="gap-1.5">
            <Smartphone className="h-4 w-4" /> Numeri e regole
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Suspense fallback={<Attesa />}>
        {tab === "conversazioni" && <Inbox />}
        {tab === "campagne" && <Campagne />}
        {tab === "numeri" && (
          // Collegare numeri e scrivere regole e' roba da super admin (le RLS
          // lo sono gia'): il tab lo dice invece di fallire in silenzio.
          <RequireSuperAdmin><Numeri /></RequireSuperAdmin>
        )}
      </Suspense>
    </div>
  );
}
