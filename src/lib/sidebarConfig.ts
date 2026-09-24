import {
  LayoutDashboard,
  ClipboardList,
  Users,
  HeadphonesIcon,
  TrendingUp,
  Receipt,
  Warehouse,
  CalendarDays,
  CheckSquare,
  MessageSquare,
  MessageCircle,
  Zap,
  Contact,
  Target,
  Bot,
  Mail,
  Gauge,
  BarChart3,
  Headphones,
  PhoneCall,
  Landmark,
  FileStack,
  FileSignature,
  FileText,
  BookOpen,
  HardHat,
  Euro,
  Users2,
  Megaphone,
  Share2,
  LifeBuoy,
  CalendarClock,
  TrendingDown,
  ContactRound,
  UserCheck,
  MessagesSquare,
  Sparkles,
  PieChart,
  Workflow,
  LayoutGrid,
  ShieldAlert,
  Image,
  Settings,
  GraduationCap,
  SquarePen,
  Star,
  Calculator,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModuleKey } from "@/hooks/useSubscriptionLimits";

export interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  permissionKey?: string;
  /** Nasconde la voce se l'utente HA questo permesso (opposto di permissionKey).
   *  Es. "La mia formazione" (fruizione dipendente) si nasconde a chi gestisce il
   *  Portale: l'admin ha già il Portale come superficie corsi, la voce sarebbe un
   *  doppione. Il dipendente puro (senza canManagePortal) continua a vederla. */
  hideIfPermissionKey?: string;
  moduleKey?: ModuleKey;
  featureKey?: string;
  isBeta?: boolean;
  demoCompanyOnly?: boolean;
  /** Visibile solo se l'utente ha accesso a più aziende (console agenzia). */
  multiCompanyOnly?: boolean;
  category?: "internal" | "marketing";
  subcategory?: string;
  groupLabel?: string;
}

export interface MacroArea {
  id: string;
  title: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const macroAreas: MacroArea[] = [
  // 1. Cruscotto — standalone top items
  // Nota: "La mia area" è stata unificata dentro la pagina Attività con tab
  {
    id: "area_cruscotto",
    title: "Cruscotto",
    icon: LayoutGrid,
    items: [
      { title: "Attività", url: "/azienda/attivita", icon: CheckSquare },
      { title: "Email", url: "/azienda/email", icon: Mail, featureKey: "email_client", isBeta: true },
      // Una sola voce. Prima erano due — "Come stiamo andando" e "Cruscotto" —
      // e siccome /azienda/cruscotto/aziendale sta sotto /azienda/cruscotto,
      // risultavano attive entrambe insieme. Porta alla pagina che contiene
      // tutto; le dashboard personalizzate si raggiungono dal selettore in
      // cima a quella pagina, e da li' si torna indietro.
      { title: "Cruscotto", url: "/azienda/cruscotto/aziendale", icon: Gauge, permissionKey: "canViewCruscotto" },
      { title: "Chat Team", url: "/azienda/chat", icon: MessagesSquare }, // no gate — accessible to all authenticated users
      { title: "Silvio AI", url: "/azienda/silvio-ai", icon: Sparkles, isBeta: true }, // nuova interfaccia multi-conversazione
    ],
  },

  // 2. Direzione & Bilancio (modulo add-on Controllo di Gestione)
  // MacroArea con un'unica voce — le 13 sub-tab sono dentro la pagina
  // ControlloGestione.tsx con deep-link URL↔tab via URL_TO_TAB/TAB_TO_URL.
  {
    id: "area_controllo_gestione",
    title: "Direzione & Bilancio",
    icon: PieChart,
    items: [
      {
        title: "Controllo di Gestione",
        url: "/azienda/controllo-gestione",
        icon: PieChart,
        permissionKey: "canViewControlloGestione",
        featureKey: "controllo_gestione_v1",
        isBeta: true,
      },
    ],
  },

  // 3. Cantieri & Lavori
  {
    id: "area_cantieri",
    title: "Cantieri & Lavori",
    icon: HardHat,
    items: [
      // ─── Operativo ───
      // NB: Sopralluoghi non è più voce separata sidebar — è un tab dentro Commesse
      // (OrdersList.tsx). Visibile a Demo Azienda via feature flag surveys_module.
      { title: "Commesse", url: "/azienda/ordini", icon: ClipboardList, permissionKey: "canViewOrders", moduleKey: "orders" },
      // Voce dedicata: gli ODA vivono in un tab dentro Commesse e prima non
      // erano raggiungibili da NESSUN menu — si scoprivano solo per caso.
      // "Ordini d'Acquisto" non e' piu' una voce di menu: vive come tab
      // "acquisto" dentro Commesse (stessa destinazione a cui puntava questa
      // voce). Doppia porta per lo stesso posto = menu piu' lungo e basta.
      { title: "Magazzino", url: "/azienda/magazzino", icon: Warehouse, permissionKey: "canViewWarehouse", moduleKey: "warehouse" },
      { title: "Mezzi e attrezzature", url: "/azienda/mezzi", icon: Truck, permissionKey: "canViewMezzi", moduleKey: "mezzi" },
      { title: "Clienti", url: "/azienda/clienti", icon: Users, permissionKey: "canViewCustomers", moduleKey: "customers" },
      { title: "Subappaltatori", url: "/azienda/subappaltatori", icon: HardHat, permissionKey: "canViewSubappaltatori", featureKey: "subappaltatori" },
      { title: "Firma Elettronica", url: "/azienda/firma-elettronica", icon: FileSignature, permissionKey: "canViewFirmaElettronica", featureKey: "firma_fea" },
      // ─── Pianificazione ───
      // Assistenza ora aggrega tutto: ticket di supporto + interventi sul campo.
      // "Interventi" come voce separata è stata rimossa — accessibile via tab/filtro
      // all'interno di /azienda/assistenza.
      { title: "Assistenza", url: "/azienda/assistenza", icon: LifeBuoy, permissionKey: "canViewTickets", moduleKey: "tickets", groupLabel: "Pianificazione" },
      { title: "Manutenzione", url: "/azienda/manutenzione", icon: Settings, permissionKey: "canViewManutenzione", featureKey: "manutenzione_modulo", groupLabel: "Pianificazione" },
      { title: "Calendario", url: "/azienda/calendario", icon: CalendarDays, permissionKey: "canViewCalendar", moduleKey: "calendar" },
      // ─── Controllo ───
      { title: "Sicurezza Cantiere", url: "/azienda/sicurezza-cantiere", icon: ShieldAlert, permissionKey: "canViewSicurezzaCantiere", featureKey: "cantieri_avanzati" },
    ],
  },

  // 3. Finanza
  {
    id: "area_finanza",
    title: "Finanza",
    icon: Euro,
    items: [
      // ─── Sub-gruppo: Fatturazione e Documenti (billing_native) ───
      { title: "Fatture", url: "/azienda/documenti", icon: FileText, permissionKey: "canViewBilling", featureKey: "billing_native", groupLabel: "Fatturazione e Documenti" },
      // Report Fiscali e Impostazioni Fatt. rimosse dalla sidebar (non navigazione quotidiana).
      // Le pagine restano intatte e raggiungibili dall'header della pagina Fatture.
      // ─── Fatturazione esterna (billing_external) ───
      { title: "Fatturazione", url: "/azienda/fatturazione", icon: Receipt, permissionKey: "canViewBilling", featureKey: "billing_external", groupLabel: "Fatturazione e Documenti" },
      { title: "Scadenzario", url: "/azienda/scadenzario", icon: CalendarClock, permissionKey: "canViewScadenzario", featureKey: "fatturazione" },
      // Le fatture dei FORNITORI arrivano comunque, che tu emetta con un
      // gestionale esterno o dal modulo nativo: marcarla "billing_external"
      // la faceva sparire dal menu in modalità nativa, pur essendo una rotta
      // senza BillingModeGuard e quindi funzionante. Feature giusta: documenti.
      { title: "Fatture Ricevute", url: "/azienda/documenti/fatture-ricevute", icon: FileText, permissionKey: "canViewBilling", featureKey: "documenti" },
      // ─── Contabilità ───
      { title: "Prima Nota", url: "/azienda/prima-nota", icon: BookOpen, permissionKey: "canViewPrimaNota", featureKey: "prima_nota", groupLabel: "Contabilità" },
      { title: "Tesoreria", url: "/azienda/tesoreria", icon: Landmark, permissionKey: "canViewTesoreria", featureKey: "tesoreria" },
      { title: "Costi", url: "/azienda/costi", icon: TrendingDown, permissionKey: "canViewCosts", moduleKey: "forecast" },
      { title: "Analisi Acquisti", url: "/azienda/analisi-acquisti", icon: BarChart3, permissionKey: "canViewCosts", moduleKey: "forecast" },
      { title: "Previsionale", url: "/azienda/previsionale", icon: TrendingUp, permissionKey: "canViewForecast", moduleKey: "forecast" },
    ],
  },

  // 4. Persone
  {
    id: "area_persone",
    title: "Persone",
    icon: Users2,
    items: [
      { title: "Personale & HR", url: "/azienda/personale", icon: UserCheck, permissionKey: "canViewPersone", featureKey: "hr_personale" },
      // MP-CLEANUP: "Messaggi Esterni" rimosso (feature legacy sostituita da Hub WhatsApp multi-numero)
    ],
  },

  // 4b. Formazione — area a sé, staccata da "Persone" (era annidata lì).
  // È il portale corsi + fruizione learner. Vision: catalogo corsi vendibili
  // stile Kajabi (il superadmin li crea e vende in /admin) + community stile Skool.
  // Tre livelli distinti (permessi separati):
  //  • "Crea corsi" = builder/authoring (/azienda/corsi) — gated canCreateCourses.
  //  • "Portale" = libreria dei TUOI corsi (creati + comprati) + assegnazioni/
  //    report, SENZA builder — gated canManagePortal. Il dipendente NON lo vede.
  //  • "La mia formazione" = fruizione — gated canViewFormazione (default ON per
  //    gli staff): vede i corsi assegnati/comprati e i materiali. hideIfPermissionKey
  //    canManagePortal → NASCOSTA a chi gestisce il Portale (per l'admin sarebbe un
  //    doppione: il Portale è già la sua superficie corsi). Resta la SOLA superficie
  //    del dipendente puro, che il Portale non lo vede.
  {
    id: "area_formazione",
    title: "Formazione",
    icon: GraduationCap,
    items: [
      { title: "Crea corsi", url: "/azienda/corsi", icon: SquarePen, permissionKey: "canCreateCourses", featureKey: "hr_personale" },
      { title: "Portale", url: "/azienda/personale/portale", icon: GraduationCap, permissionKey: "canManagePortal", featureKey: "hr_personale" },
      { title: "La mia formazione", url: "/azienda/formazione", icon: BookOpen, permissionKey: "canViewFormazione", hideIfPermissionKey: "canManagePortal", featureKey: "hr_personale" },
    ],
  },

  // 5. Marketing & Vendita
  {
    id: "area_marketing",
    title: "Marketing & Vendita",
    icon: Megaphone,
    items: [
      // ─── CRM & Vendita ───
      { title: "Contatti CRM", url: "/azienda/marketing/contatti", icon: ContactRound, permissionKey: "canViewMarketingContacts", featureKey: "crm_modulo", groupLabel: "CRM & Vendita" },
      { title: "Opportunità", url: "/azienda/marketing/opportunita", icon: Target, permissionKey: "canViewMarketingOpportunities", featureKey: "crm_modulo" },
      // Flag dedicato (non crm_modulo): il Piano Marketing tiene il CRM ma spegne i preventivi.
      { title: "Preventivi CRM", url: "/azienda/marketing/preventivi", icon: FileSignature, permissionKey: "canViewMarketingOpportunities", featureKey: "preventivi_crm" },
      { title: "Simulatore", url: "/azienda/marketing/simulatore", icon: Calculator, permissionKey: "canViewMarketingOpportunities", featureKey: "simulatore" },
      // 2026-07-12: voce "Firma Elettronica" rimossa da qui — l'hub vive solo in
      // "Cantieri & Lavori". Il commerciale invia comunque preventivi/contratti in firma
      // dal dettaglio preventivo (SendSignatureDialog in QuoteDetail/FotovoltaicoDettaglio),
      // flusso indipendente da questa voce e dal permesso canViewFirmaElettronica.
      { title: "Calendario CRM", url: "/azienda/marketing/calendario", icon: CalendarDays, permissionKey: "canViewMarketingAppointments", featureKey: "crm_modulo" },
      { title: "Sales OS", url: "/azienda/marketing/sales-os", icon: Gauge, permissionKey: "canViewSalesOs", featureKey: "sales_os" },
      { title: "Reportistica", url: "/azienda/marketing/reportistica", icon: PieChart, permissionKey: "canViewMarketingReports", featureKey: "marketing_reporting" },
      // ─── Marketing ───
      { title: "Pubblicità", url: "/azienda/marketing/pubblicita", icon: Megaphone, permissionKey: "canViewMarketingDashboard", groupLabel: "Marketing" },
      { title: "Gestione Social", url: "/azienda/marketing/social", icon: Share2, permissionKey: "canViewMarketingDashboard" },
      { title: "Reputazione", url: "/azienda/marketing/reputazione", icon: Star, permissionKey: "canViewReputazione" },
      // 2026-04-27: voce "Fotovoltaico" rimossa dalla sidebar.
      // L'accesso al modulo passa ora dall'Hub Preventivi → tab "Moduli Vendita"
      // (gated dal feature flag modulo_fotovoltaico_attivo). La route resta
      // raggiungibile via URL diretto / link card; le route in companyRoutes.tsx
      // restano gated da FeatureRoute.
    ],
  },

  // 6. Automazioni & AI — Email · SMS · WhatsApp stub · Automazioni · Agenti · Render
  {
    id: "area_automazioni",
    title: "Automazioni & AI",
    icon: Zap,
    items: [
      // TOP-LEVEL — sempre visibili anche con subcategory collassate
      // v8.6.72 — "Personas AI" fusa in /impostazioni/ai-memoria (hub Chat + Memoria + Sessioni).
      // Raggiungibile da: Impostazioni > AI Personas, FAB Silvio popover, Cmd+K.
      { title: "Automazioni", url: "/azienda/automazioni", icon: Workflow, permissionKey: "canViewAutomazioni" },
      // ─── Canali comunicazione (subcategory collassabile) ───
      { title: "Email Marketing", url: "/azienda/marketing/email", icon: Mail, permissionKey: "canViewMarketingEmail", featureKey: "email_marketing", groupLabel: "Comunicazione" },
      // MP-CLN 2026-05-25: unificato in un solo hub /sms con tab Campagne/Singolo/Automazioni.
      { title: "SMS", url: "/azienda/sms", icon: MessageSquare, permissionKey: "canViewSmsMarketing", featureKey: "sms_marketing" },
      { title: "WhatsApp", url: "/azienda/whatsapp", icon: MessageCircle, permissionKey: "canViewMarketingWhatsapp", featureKey: "whatsapp" },
      { title: "Centralino", url: "/azienda/centralino", icon: PhoneCall, permissionKey: "canViewMarketingAiAgent", featureKey: "ai_agents" },
      // ─── Altri tool AI ───
      { title: "Agenti AI", url: "/azienda/agenti-ai", icon: Bot, permissionKey: "canViewMarketingAiAgent", featureKey: "ai_agents", groupLabel: "Altri tool AI" },
      { title: "Render AI", url: "/azienda/render", icon: Image, permissionKey: "canViewRenderAi", featureKey: "render_ai" },
    ],
  },

  // 7. EiC Drive — accesso unico a file, foto, computi e inbox AI.
  // La visibilita' fine e' calcolata in CompanyLayout/MobileAppGrid con
  // canAccessMediaLibrary, perche' dipende da piu permessi OR.
  {
    id: "area_contenuti",
    title: "EiC Drive",
    icon: FileStack,
    items: [
      { title: "EiC Drive", url: "/azienda/contenuti-multimediali", icon: FileStack },
    ],
  },
];

/** @deprecated Use macroAreas instead */
export const internalNavItems: NavItem[] = [
  { title: "Dashboard", url: "/azienda", icon: LayoutDashboard, permissionKey: "canViewDashboard", category: "internal", subcategory: "gi_operazioni" },
  { title: "Commesse", url: "/azienda/ordini", icon: ClipboardList, permissionKey: "canViewOrders", moduleKey: "orders", category: "internal", subcategory: "gi_operazioni" },
  { title: "Magazzino", url: "/azienda/magazzino", icon: Warehouse, permissionKey: "canViewWarehouse", moduleKey: "warehouse", category: "internal", subcategory: "gi_operazioni" },
  { title: "Mezzi e attrezzature", url: "/azienda/mezzi", icon: Truck, permissionKey: "canViewMezzi", moduleKey: "mezzi", category: "internal", subcategory: "gi_operazioni" },
  { title: "Calendario", url: "/azienda/calendario", icon: CalendarDays, permissionKey: "canViewCalendar", moduleKey: "calendar", category: "internal", subcategory: "gi_operazioni" },
  { title: "Clienti", url: "/azienda/clienti", icon: Users, permissionKey: "canViewCustomers", moduleKey: "customers", category: "internal", subcategory: "gi_supporto" },
  { title: "Ticket Clienti", url: "/azienda/assistenza", icon: HeadphonesIcon, permissionKey: "canViewTickets", moduleKey: "tickets", category: "internal", subcategory: "gi_supporto" },
  { title: "Previsionale", url: "/azienda/previsionale", icon: TrendingUp, permissionKey: "canViewForecast", moduleKey: "forecast", category: "internal", subcategory: "gi_finanza" },
  { title: "Costi", url: "/azienda/costi", icon: Receipt, permissionKey: "canViewCosts", moduleKey: "forecast", category: "internal", subcategory: "gi_finanza" },
  { title: "Tesoreria", url: "/azienda/tesoreria", icon: Landmark, permissionKey: "canViewTesoreria", category: "internal", subcategory: "gi_finanza" },
  { title: "Fatturazione", url: "/azienda/fatturazione", icon: FileText, permissionKey: "canViewBilling", featureKey: "billing_external", category: "internal", subcategory: "gi_finanza" },
  { title: "Scadenzario", url: "/azienda/scadenzario", icon: CalendarDays, permissionKey: "canViewScadenzario", featureKey: "fatturazione", category: "internal", subcategory: "gi_finanza" },
  { title: "Fatture Ricevute", url: "/azienda/documenti/fatture-ricevute", icon: FileText, permissionKey: "canViewBilling", featureKey: "documenti", category: "internal", subcategory: "gi_finanza" },
  { title: "Fatturazione", url: "/azienda/documenti", icon: FileText, permissionKey: "canViewBilling", featureKey: "billing_native", category: "internal", subcategory: "gi_finanza" },
  // "Report" rimosso da internalNavItems (allineato con rimozione da sidebar principale)
  { title: "Prima Nota", url: "/azienda/prima-nota", icon: BookOpen, permissionKey: "canViewPrimaNota", category: "internal", subcategory: "gi_finanza" },
  
  // MP-CLEANUP: "Messaggi Esterni" rimosso
  { title: "Chat Team", url: "/azienda/chat", icon: MessageCircle, permissionKey: "canViewPersone", category: "internal", subcategory: "gi_team" },
  { title: "Silvio AI", url: "/azienda/silvio-ai", icon: Sparkles, isBeta: true, permissionKey: "canViewPersone", category: "internal", subcategory: "gi_team" },
  { title: "Personale & HR", url: "/azienda/personale", icon: Users, permissionKey: "canViewPersone", category: "internal", subcategory: "gi_team" },
  { title: "Crea corsi", url: "/azienda/corsi", icon: SquarePen, permissionKey: "canCreateCourses", category: "internal", subcategory: "gi_team" },
  { title: "Portale", url: "/azienda/personale/portale", icon: GraduationCap, permissionKey: "canManagePortal", category: "internal", subcategory: "gi_team" },
  { title: "Automazioni", url: "/azienda/automazioni", icon: Zap, permissionKey: "canViewAutomazioni", category: "internal", subcategory: "gi_automation" },
  { title: "Agenti AI Interni", url: "/azienda/agenti-ai?tipo=platform", icon: Headphones, permissionKey: "canViewSettings", featureKey: "ai_agents_internal", category: "internal", subcategory: "gi_automation" },
];

/** @deprecated Use macroAreas instead */
export const marketingNavItems: NavItem[] = [
  { title: "Dashboard", url: "/azienda/marketing", icon: LayoutDashboard, permissionKey: "canViewMarketingDashboard", category: "marketing", subcategory: "mkt_crm" },
  { title: "Contatti", url: "/azienda/marketing/contatti", icon: Contact, permissionKey: "canViewMarketingContacts", category: "marketing", subcategory: "mkt_crm" },
  { title: "Opportunità", url: "/azienda/marketing/opportunita", icon: Target, permissionKey: "canViewMarketingOpportunities", category: "marketing", subcategory: "mkt_crm" },
  { title: "Preventivi", url: "/azienda/marketing/preventivi", icon: FileSignature, permissionKey: "canViewMarketingOpportunities", featureKey: "preventivi_crm", category: "marketing", subcategory: "mkt_crm" },
  { title: "Appuntamenti", url: "/azienda/marketing/calendario", icon: CalendarDays, permissionKey: "canViewMarketingAppointments", category: "marketing", subcategory: "mkt_crm" },

  { title: "Email Marketing", url: "/azienda/marketing/email", icon: Mail, permissionKey: "canViewMarketingEmail", category: "marketing", subcategory: "mkt_comunicazione" },
  { title: "SMS", url: "/azienda/sms", icon: MessageSquare, permissionKey: "canViewSmsMarketing", category: "marketing", subcategory: "mkt_comunicazione" },
  { title: "WhatsApp", url: "/azienda/whatsapp", icon: MessageCircle, permissionKey: "canViewMarketingWhatsapp", category: "marketing", subcategory: "mkt_comunicazione" },
  { title: "Centralino", url: "/azienda/centralino", icon: PhoneCall, permissionKey: "canViewMarketingAiAgent", category: "marketing", subcategory: "mkt_comunicazione" },
  { title: "Automazioni", url: "/azienda/automazioni?tab=marketing", icon: Zap, permissionKey: "canViewMarketingAutomations", category: "marketing", subcategory: "mkt_automation" },
  { title: "Agenti AI", url: "/azienda/agenti-ai?tipo=custom", icon: Bot, permissionKey: "canViewMarketingAiAgent", category: "marketing", subcategory: "mkt_automation" },
  { title: "Sales OS", url: "/azienda/marketing/sales-os", icon: Zap, permissionKey: "canViewMarketingOpportunities", category: "marketing", subcategory: "mkt_analisi" },
  { title: "Reportistica", url: "/azienda/marketing/reportistica", icon: BarChart3, permissionKey: "canViewMarketingReports", category: "marketing", subcategory: "mkt_analisi" },
  { title: "Pubblicità", url: "/azienda/marketing/pubblicita", icon: Megaphone, permissionKey: "canViewMarketingDashboard", category: "marketing", subcategory: "mkt_analisi" },
  { title: "Reputazione", url: "/azienda/marketing/reputazione", icon: Star, permissionKey: "canViewMarketingDashboard", category: "marketing", subcategory: "mkt_analisi" },
];
