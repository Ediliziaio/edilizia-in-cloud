/**
 * Layout per l'area campo (operai e subappaltatori).
 * Usa la stessa UX white-sidebar dell'app principale.
 * Su mobile la sidebar diventa un sheet laterale.
 */
import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { isNative } from "@/lib/mobile";
import {
  Home,
  Calendar,
  MessageSquare,
  HardHat,
  Eye,
  LogOut,
  ClipboardCheck,
  FileText,
  Mic,
  Shield,
  CreditCard,
  Ticket,
  Settings,
  Clock,
  CalendarDays,
  Receipt,
  ArrowLeft,
  ListChecks,
  Package,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { useInternalChatUnreadTotal } from "@/hooks/useInternalChatUnreadTotal";
import { usePreviewToken } from "@/hooks/usePreviewToken";
import { PreviewSessionContext } from "@/contexts/PreviewSessionContext";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import OfflineBanner from "@/components/campo/OfflineBanner";
import { NavLink } from "@/components/NavLink";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PoweredByBadge } from "@/components/shared/PoweredByBadge";
import { CampoBottomNav } from "@/components/campo/CampoBottomNav";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { CompanyContextSwitcher } from "@/components/layouts/CompanyContextSwitcher";
import { AreaSwitcher } from "@/components/layouts/AreaSwitcher";
import { QuickLoginReturnBanner } from "@/components/admin/QuickLoginReturnBanner";

type CampoNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: number;
};

export default function CampoLayout() {
  // Service worker dell'area campo: shell di /campo e chunk già visti in cache,
  // così con una tacca di segnale l'app almeno si apre (timbratura, bozze). Le
  // Web Push hanno bisogno di un SW attivo: senza, le iscrizioni non nascono.
  // Solo in produzione e solo sul web (l'app nativa non ne ha bisogno).
  useEffect(() => {
    if (!import.meta.env.PROD || isNative || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => {
      console.warn("[campo] service worker non registrato:", e instanceof Error ? e.message : e);
    });
  }, []);
  const { profile, signOut, company, effectiveCompany } = useAuth();
  const { isOperaio } = useIsCampo();
  const activeCompany = effectiveCompany ?? company;
  const location = useLocation();
  const navigate = useNavigate();
  // Sotto-pagina = non la home /campo: mostra la freccia "indietro" come nell'app azienda.
  const isSubPage = location.pathname !== "/campo" && location.pathname !== "/campo/";
  // Nei flussi di compilazione (rapportino a passi, rapportino vocale,
  // checklist sicurezza) il wizard ha già la SUA barra fissa in basso:
  // tenere anche la bottom-nav crea due barre sovrapposte che mangiano
  // ~180px di schermo e mettono il FAB "Timbra" a un millimetro dal
  // bottone "Avanti" — tap sbagliati garantiti. Lì la nav si nasconde:
  // si esce col back del wizard, non cambiando tab a metà compilazione.
  // (Il rapportino vocale resta fuori: è una schermata singola senza barra
  // propria, lì la bottom-nav serve ancora.)
  const inFlussoCompilazione = /\/(rapportino|sicurezza)$/.test(location.pathname);

  // Messaggi chat team non letti. Riusa l'hook condiviso (RPC
  // get_internal_chat_sidebar_state + realtime), come nell'app azienda: le
  // tabelle "chat_channel_members"/"chat_messages" NON esistono (davano 404 in
  // loop) — i nomi reali sono internal_chat_members / internal_chat_messages.
  const unreadCount = useInternalChatUnreadTotal();

  const initials = (profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "");
  const previewSession = usePreviewToken();
  const roleLabel = isOperaio ? "Operaio" : "Subappaltatore";

  // Nav items per operaio
  const operaioItems: CampoNavItem[] = [
    { title: "Home", url: "/campo", icon: Home, end: true },
    { title: "Lavori", url: "/campo/calendario", icon: Calendar },
    { title: "Attività", url: "/campo/attivita", icon: ClipboardCheck },
    { title: "Avanzamento", url: "/campo/avanzamento", icon: ListChecks },
    // Su desktop la bottom nav è nascosta: senza queste voci Timbratura e
    // Magazzino erano raggiungibili SOLO da mobile (o per niente).
    { title: "Timbratura", url: "/campo/timbratura", icon: Clock },
    { title: "Magazzino", url: "/campo/magazzino", icon: Package },
    { title: "Presenze", url: "/campo/presenze", icon: Clock },
    { title: "Ferie e Permessi", url: "/campo/ferie", icon: CalendarDays },
    { title: "Cedolini", url: "/campo/cedolini", icon: Receipt },
    { title: "Rapportino Vocale", url: "/campo/rapportino-vocale", icon: Mic },
    { title: "Chat", url: "/campo/chat", icon: MessageSquare, badge: unreadCount },
    { title: "Sicurezza", url: "/campo/sicurezza", icon: Shield },
    { title: "Tesserino", url: "/campo/tesserino", icon: CreditCard },
    // /campo/documenti delega per ruolo (CampoDocumenti → SubDocumenti solo se
    // subappaltatore). Puntare a /campo/sub/documenti mostrava all'OPERAIO la
    // pagina documenti del subappaltatore (visura/DURC/SOA, con upload).
    { title: "Documenti", url: "/campo/documenti", icon: FileText },
    { title: "Apri Ticket", url: "/campo/ticket/nuovo", icon: Ticket },
    { title: "Impostazioni", url: "/campo/impostazioni", icon: Settings },
  ];

  // Nav items per subappaltatore
  const subItems: CampoNavItem[] = [
    { title: "Home", url: "/campo", icon: Home, end: true },
    { title: "Lavori", url: "/campo/calendario", icon: Calendar },
    { title: "Attività", url: "/campo/attivita", icon: ClipboardCheck },
    { title: "Rapportino Vocale", url: "/campo/rapportino-vocale", icon: Mic },
    { title: "Chat", url: "/campo/chat", icon: MessageSquare, badge: unreadCount },
    { title: "Sicurezza", url: "/campo/sicurezza", icon: Shield },
    // Era "SAL" (importi/ritenute): in cantiere serve segnare le fasi fatte.
    { title: "Avanzamento", url: "/campo/avanzamento", icon: ListChecks },
    { title: "Documenti", url: "/campo/documenti", icon: FileText },
    { title: "Apri Ticket", url: "/campo/ticket/nuovo", icon: Ticket },
    { title: "Impostazioni", url: "/campo/impostazioni", icon: Settings },
  ];

  const navItems = isOperaio ? operaioItems : subItems;

  return (
    <SidebarProvider>
      {/* Mobile: altezza viewport bloccata + overflow-hidden → lo scroll avviene
          nel <main> (overflow-y-auto), affidabile su Capacitor/iOS. Desktop (md):
          torna a min-h-screen/h-auto (scroll di documento). Stesso modello della
          CompanyLayout azienda, che scrolla correttamente. */}
      <div className="md:min-h-screen flex w-full bg-muted/30 md:h-auto h-[calc(100dvh-env(safe-area-inset-top))] overflow-hidden md:overflow-visible">
        {/* Sidebar */}
        <Sidebar collapsible="icon" className="border-r">
          <div className="space-y-2 border-b px-3 py-3">
            <Link
              to="/campo"
              aria-label="Vai alla home Edilizia in Cloud"
              className="flex min-w-0 items-center overflow-hidden rounded-lg transition-colors hover:bg-accent/60 group-data-[collapsible=icon]:justify-center"
            >
              <img
                src={ediliziaLogo}
                alt="Edilizia in Cloud"
                className="h-8 max-w-[158px] object-contain group-data-[collapsible=icon]:hidden"
              />
              <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[11px] font-black text-primary-foreground group-data-[collapsible=icon]:flex">
                EiC
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <HardHat className="w-4 h-4 text-primary" />
              </div>
              <div className="overflow-hidden group-data-[collapsible=icon]:hidden">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none">
                  Area {roleLabel}
                </p>
                <p className="text-sm font-semibold truncate leading-tight">
                  {profile?.first_name} {profile?.last_name}
                </p>
              </div>
            </div>
            <div className="group-data-[collapsible=icon]:hidden space-y-2">
              <CompanyContextSwitcher showSecurityNote={false} />
              {/* Chi ha anche il cappello da ufficio torna al gestionale da qui. */}
              <AreaSwitcher />
            </div>
          </div>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>
                {isOperaio ? "Area Operaio" : "Area Subappaltatore"}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end={item.end}
                          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          activeClassName="bg-accent text-accent-foreground font-medium"
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.title}</span>
                          {!!item.badge && item.badge > 0 && (
                            <Badge variant="destructive" className="ml-auto h-5 min-w-5 text-[10px] px-1">
                              {item.badge > 9 ? "9+" : item.badge}
                            </Badge>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          {/* Footer */}
          <div className="mt-auto border-t p-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="text-sm font-medium truncate">
                  {profile?.first_name} {profile?.last_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
              </div>
              <button
                onClick={() => signOut()}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors group-data-[collapsible=icon]:hidden"
                title="Esci"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 group-data-[collapsible=icon]:hidden">
              <PoweredByBadge />
            </div>
          </div>
        </Sidebar>

        {/* Main Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden md:overflow-visible">
          {/* Ritorno a admin dopo "Accedi come utente" su un operaio/subappaltatore:
              senza questo banner il super_admin restava bloccato in /campo senza
              via d'uscita (nessun controllo di logout nell'area campo). */}
          <QuickLoginReturnBanner />
          <OfflineBanner />

          {/* Preview banners */}
          {previewSession.isPreview && (
            <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-center gap-2">
              <Eye className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-sm text-amber-800 font-medium">
                Modalit&agrave; SuperAdmin — Visualizzazione come: {roleLabel} (sola lettura)
              </span>
            </div>
          )}
          {previewSession.error && (
            <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-sm text-destructive text-center">
              Token preview non valido: {previewSession.error}
            </div>
          )}

          {/* Top bar MOBILE — coerente con l'app azienda (richiesta utente: "la parte
              in alto deve essere uguale"): logo EiC + azienda/area + Impostazioni.
              Prima su mobile non c'era header; ora la cornice è uniforme tra le app. */}
          <header className="md:hidden sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background px-2">
            {isSubPage && (
              <Button
                variant="ghost"
                size="icon"
                className="-ml-1 h-10 w-10 shrink-0"
                onClick={() => navigate(-1)}
                aria-label="Torna indietro"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <Link to="/campo" aria-label="Home Edilizia in Cloud" className="shrink-0">
              <img
                src={ediliziaLogo}
                alt="Edilizia in Cloud"
                className="h-7 w-auto max-w-[120px] object-contain"
              />
            </Link>
            <div className="min-w-0 flex-1 border-l border-border/60 pl-2">
              {activeCompany?.name && (
                <p className="truncate text-xs font-semibold leading-tight">{activeCompany.name}</p>
              )}
              <p className="text-[10px] uppercase leading-none tracking-wider text-muted-foreground">
                Area {roleLabel}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => navigate("/campo/impostazioni")}
              aria-label="Impostazioni"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </header>

          {/* Top bar — hidden on mobile (bottom nav replaces it) */}
          <header className="hidden md:flex h-14 border-b bg-secondary items-center gap-3 px-4 sticky top-0 z-40">
            <div className="flex items-center gap-2 text-sm text-secondary-foreground/80">
              <HardHat className="h-4 w-4" />
              <span>Area {roleLabel}</span>
              {activeCompany?.name && (
                <>
                  <span className="text-secondary-foreground/40">&middot;</span>
                  <span className="font-medium text-secondary-foreground">{activeCompany.name}</span>
                </>
              )}
            </div>
          </header>

          {/* Page Content */}
          <main className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden md:overflow-visible px-3 py-3 sm:px-4 md:p-6 ${inFlussoCompilazione ? "pb-4" : "pb-28"} md:pb-6`}>
            <PreviewSessionContext.Provider value={previewSession}>
              <ErrorBoundary title="Errore nel caricamento della pagina">
                <Outlet />
              </ErrorBoundary>
            </PreviewSessionContext.Provider>
          </main>
        </div>

        {/* Mobile bottom navigation — nascosta nei flussi di compilazione */}
        {!inFlussoCompilazione && <CampoBottomNav unreadCount={unreadCount} />}
      </div>
    </SidebarProvider>
  );
}
