import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { CompanyLayout } from "@/components/layouts/CompanyLayout";
import { SettingsLayout } from "@/components/layouts/SettingsLayout";
import { useAuth } from "@/contexts/AuthContext";

// Company pages
const CompanyDashboard = lazy(() => import("@/pages/azienda/CompanyDashboard"));
const CruscottoAziendale = lazy(() => import("@/pages/azienda/CruscottoAziendale"));
const CruscottoHub = lazy(() => import("@/pages/azienda/CruscottoHub"));
const SettingsProfile = lazy(() => import("@/pages/azienda/settings/SettingsProfile"));
const SettingsCatalog = lazy(() => import("@/pages/azienda/settings/SettingsCatalog"));
const SettingsOrderStatus = lazy(() => import("@/pages/azienda/settings/SettingsOrderStatus"));
const SettingsPipelines = lazy(() => import("@/pages/azienda/settings/SettingsPipelines"));
const SettingsSuppliers = lazy(() => import("@/pages/azienda/settings/SettingsSuppliers"));
// SettingsUsers, SettingsSalespeople, SettingsStaff, SettingsTeams → rimpiazzati da SettingsPeople
// SettingsSecurity, SettingsSecurityDashboard, SettingsActivityLog, SettingsPrivacy → rimpiazzati da SettingsSecurityHub
const SettingsUserDetail = lazy(() => import("@/pages/azienda/settings/SettingsUserDetail"));
const SettingsSedi = lazy(() => import("@/pages/azienda/settings/SettingsSedi"));
const SettingsPeople = lazy(() => import("@/pages/azienda/settings/SettingsPeople"));
const SettingsSecurityHub = lazy(() => import("@/pages/azienda/settings/SettingsSecurityHub"));
const SettingsTags = lazy(() => import("@/pages/azienda/settings/SettingsTags"));
const SettingsCustomFields = lazy(() => import("@/pages/azienda/settings/SettingsCustomFields"));
const SettingsMarketingCalendars = lazy(() => import("@/pages/azienda/settings/SettingsMarketingCalendars"));
const SettingsIntegrations = lazy(() => import("@/pages/azienda/settings/SettingsIntegrations"));
const SettingsCostCategories = lazy(() => import("@/pages/azienda/settings/SettingsCostCategories"));
const SettingsFinanceAutomation = lazy(() => import("@/pages/azienda/settings/SettingsFinanceAutomation"));
const SettingsCredits = lazy(() => import("@/pages/azienda/settings/SettingsCredits"));
const SettingsQuoteMaterials = lazy(() => import("@/pages/azienda/settings/SettingsQuoteMaterials"));
const SettingsQuoteTemplates = lazy(() => import("@/pages/azienda/settings/SettingsQuoteTemplates"));
const SettingsTariffe = lazy(() => import("@/pages/azienda/settings/SettingsTariffe"));
const ListinoManutenzione = lazy(() => import("@/pages/azienda/settings/ListinoManutenzione"));
const SettingsMargini = lazy(() => import("@/pages/azienda/settings/SettingsMargini"));
const SettingsApiKeys = lazy(() => import("@/pages/azienda/settings/SettingsApiKeys"));
const SettingsWebhooks = lazy(() => import("@/pages/azienda/settings/SettingsWebhooks"));
const SettingsBranding = lazy(() => import("@/pages/azienda/settings/SettingsBranding"));
const SettingsBilling = lazy(() => import("@/pages/azienda/settings/SettingsBilling"));
const SettingsSubscriptionBilling = lazy(() => import("@/pages/azienda/settings/SettingsSubscriptionBilling"));
const SettingsFormBuilder = lazy(() => import("@/pages/azienda/settings/SettingsFormBuilder"));
const SettingsPhoneNumbers = lazy(() => import("@/pages/azienda/settings/SettingsPhoneNumbers"));
const OrdersList = lazy(() => import("@/pages/azienda/OrdersList"));
const CreateOrder = lazy(() => import("@/pages/azienda/CreateOrder"));
const OrderDetail = lazy(() => import("@/pages/azienda/OrderDetail"));
const OrderDiaryPage = lazy(() => import("@/pages/azienda/OrderDiaryPage"));
const EditOrder = lazy(() => import("@/pages/azienda/EditOrder"));
const CustomersList = lazy(() => import("@/pages/azienda/CustomersList"));
const CreateCustomer = lazy(() => import("@/pages/azienda/CreateCustomer"));
const CompanyCustomerDetail = lazy(() => import("@/pages/azienda/CompanyCustomerDetail"));
const CashFlowForecast = lazy(() => import("@/pages/azienda/CashFlowForecast"));
const Warehouse = lazy(() => import("@/pages/azienda/Warehouse"));
const WarehouseManager = lazy(() => import("@/pages/azienda/WarehouseManager"));
const CompanyCosts = lazy(() => import("@/pages/azienda/CompanyCosts"));
const Calendar = lazy(() => import("@/pages/azienda/Calendar"));
const UnifiedTasks = lazy(() => import("@/pages/azienda/UnifiedTasks"));
const AttivitaStaff = lazy(() => import("@/pages/azienda/AttivitaStaff"));
const TimbraturePersonali = lazy(() => import("@/pages/azienda/TimbraturePersonali"));
const FeriePersonali = lazy(() => import("@/pages/azienda/FeriePersonali"));
const CedoliniPersonali = lazy(() => import("@/pages/azienda/CedoliniPersonali"));

/**
 * AttivitaRouter — mostra la pagina corretta in base al ruolo.
 * company_staff → AttivitaStaff (landing personale + timbratura sede)
 * tutti gli altri → UnifiedTasks (task manager completo)
 */
function AttivitaRouter() {
  const { role } = useAuth();
  if (role === "company_staff") return <AttivitaStaff />;
  return <UnifiedTasks />;
}
// GlobalErrors rendered as tab inside OrdersList — lazy import removed
const MessagingBeta = lazy(() => import("@/pages/azienda/MessagingBeta"));
const AutomazioniUnified = lazy(() => import("@/pages/azienda/AutomazioniUnified"));
const AgentiAIPage = lazy(() => import("@/pages/azienda/AgentiAIPage"));
const AgentDetailPage = lazy(() => import("@/pages/azienda/AgentDetailPage"));
const RenderHub = lazy(() => import("@/pages/azienda/RenderHub"));
const RenderNew = lazy(() => import("@/pages/azienda/RenderNew"));
const RenderGallery = lazy(() => import("@/pages/azienda/RenderGallery"));
const RenderGalleryDetail = lazy(() => import("@/pages/azienda/RenderGalleryDetail"));
const InternalChat = lazy(() => import("@/pages/azienda/InternalChat"));
const Tesoreria = lazy(() => import("@/pages/azienda/Tesoreria"));
const FirmaElettronicaHub = lazy(() => import("@/pages/azienda/firma-elettronica/index"));
const NuovoTemplate = lazy(() => import("@/pages/azienda/firma-elettronica/nuovo-template"));
const InvoicesList = lazy(() => import("@/pages/azienda/billing/InvoicesList"));
const InvoiceDetail = lazy(() => import("@/pages/azienda/billing/InvoiceDetail"));
const Scadenzario = lazy(() => import("@/pages/azienda/billing/Scadenzario"));

// Billing mode guard
import { BillingModeGuard } from "@/components/billing/BillingModeGuard";
const DocumentiFiscaliList = lazy(() => import("@/pages/azienda/fatturazione/DocumentiFiscaliList"));
const EditorDocumento = lazy(() => import("@/pages/azienda/fatturazione/EditorDocumento"));
const DocumentoDetail = lazy(() => import("@/pages/azienda/fatturazione/DocumentoDetail"));
const CassettoSDI = lazy(() => import("@/pages/azienda/fatturazione/CassettoSDI"));
const FattureRicevutePage = lazy(() => import("@/pages/azienda/fatturazione/FattureRicevutePage"));
const RegistroIncassi = lazy(() => import("@/pages/azienda/fatturazione/RegistroIncassi"));
const RegistroIVA = lazy(() => import("@/pages/azienda/fatturazione/RegistroIVA"));
const AnagraficheList = lazy(() => import("@/pages/azienda/fatturazione/AnagraficheList"));
const AnagraficaDetail = lazy(() => import("@/pages/azienda/fatturazione/AnagraficaDetail"));
const ReportFatturazione = lazy(() => import("@/pages/azienda/fatturazione/ReportFatturazione"));
const ImpostazioniFatturazione = lazy(() => import("@/pages/azienda/fatturazione/ImpostazioniFatturazione"));
const PrimaNota = lazy(() => import("@/pages/azienda/PrimaNota"));
const PersonalePage = lazy(() => import("@/pages/azienda/personale/PersonalePage"));
const TimbraturaKiosk = lazy(() => import("@/pages/azienda/personale/TimbraturaKiosk"));
// PurchaseOrdersList now rendered as tab inside OrdersList — lazy import removed
const PurchaseOrderDetail = lazy(() => import("@/pages/azienda/PurchaseOrderDetail"));
const SicurezzaCantiere = lazy(() => import("@/pages/azienda/SicurezzaCantiere"));
const GiornaleLavori = lazy(() => import("@/pages/azienda/GiornaleLavori"));
const SubappaltatoriPage = lazy(() => import("@/pages/azienda/SubappaltatoriPage"));
const SubappaltatoreDetail = lazy(() => import("@/pages/azienda/SubappaltatoreDetail"));
// MarginalitaCantieri now rendered as tab inside OrdersList — lazy import removed
const TicketsList = lazy(() => import("@/pages/azienda/TicketsList"));
const TicketDetail = lazy(() => import("@/pages/azienda/TicketDetail"));
const CreateCompanyTicket = lazy(() => import("@/pages/azienda/CreateCompanyTicket"));
const InterventiList = lazy(() => import("@/pages/azienda/InterventiList"));
const InterventiDetail = lazy(() => import("@/pages/azienda/InterventiDetail"));
const ChiusuraIntervento = lazy(() => import("@/pages/azienda/ChiusuraIntervento"));
const ManutenzioneList = lazy(() => import("@/pages/azienda/ManutenzioneList"));
const ImpiantoDetail = lazy(() => import("@/pages/azienda/ImpiantoDetail"));
const StoricoImpianto = lazy(() => import("@/pages/azienda/StoricoImpianto"));
const AssistenzaLavoriHub = lazy(() => import("@/pages/azienda/AssistenzaLavoriHub"));

// Marketing
const MarketingDashboard = lazy(() => import("@/pages/azienda/marketing/MarketingDashboard"));
const MarketingContacts = lazy(() => import("@/pages/azienda/marketing/MarketingContacts"));
const MarketingOpportunities = lazy(() => import("@/pages/azienda/marketing/MarketingOpportunities"));
const MarketingCalendar = lazy(() => import("@/pages/azienda/marketing/MarketingCalendar"));
// MarketingAutomations → sostituito da AutomazioniUnified
// MarketingTasks → sostituito da UnifiedTasks
const MarketingAutomationBuilder = lazy(() => import("@/pages/azienda/marketing/MarketingAutomationBuilder"));
const MarketingContactDetail = lazy(() => import("@/pages/azienda/marketing/MarketingContactDetail"));
const EmailMarketing = lazy(() => import("@/pages/azienda/marketing/EmailMarketing"));
const CampaignEditor = lazy(() => import("@/pages/azienda/marketing/CampaignEditor"));
const CampaignSendSettings = lazy(() => import("@/pages/azienda/marketing/CampaignSendSettings"));
const DragDropEmailBuilder = lazy(() => import("@/pages/azienda/marketing/DragDropEmailBuilder"));
const MarketingWhatsApp = lazy(() => import("@/pages/azienda/marketing/MarketingWhatsApp"));
const SmsMarketingPage = lazy(() => import("@/pages/azienda/sms-marketing/index"));
const SmsPage = lazy(() => import("@/pages/azienda/sms/index"));
const OnboardingPage = lazy(() => import("@/pages/azienda/OnboardingPage"));
const ReportisticaPage = lazy(() => import("@/pages/azienda/ReportisticaPage"));
const SalesOSDashboard = lazy(() => import("@/pages/azienda/marketing/SalesOSDashboard"));
const FacebookFormsPage = lazy(() => import("@/pages/azienda/marketing/FacebookFormsPage"));
const Preventivi = lazy(() => import("@/pages/azienda/marketing/Preventivi"));
const QuoteBuilder = lazy(() => import("@/pages/azienda/marketing/QuoteBuilder"));
const QuoteDetail = lazy(() => import("@/pages/azienda/marketing/QuoteDetail"));
// AnalisiPreventivi now rendered as tab inside Preventivi — lazy import removed
const RitenuteGaranzia = lazy(() => import("@/pages/azienda/RitenuteGaranzia"));
const ContabilitaFiscale = lazy(() => import("@/pages/azienda/ContabilitaFiscale"));
const ArchivioSostitutivo = lazy(() => import("@/pages/azienda/ArchivioSostitutivo"));

const COMPANY_ROLES = ["company_admin", "company_staff", "super_admin", "salesperson", "call_center", "multi_company_user"] as const;

export function companyRoutes() {
  return (
    <>
      {/* Full-screen Automation Builder routes - OUTSIDE CompanyLayout */}
      <Route
        path="/azienda/marketing/automazioni/nuova"
        element={
          <ProtectedRoute allowedRoles={[...COMPANY_ROLES]}>
            <ErrorBoundary title="Errore nel builder automazioni">
              <MarketingAutomationBuilder />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/azienda/marketing/automazioni/:id"
        element={
          <ProtectedRoute allowedRoles={[...COMPANY_ROLES]}>
            <ErrorBoundary title="Errore nel builder automazioni">
              <MarketingAutomationBuilder />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />

      {/* Company Admin and Staff Routes */}
      <Route
        path="/azienda"
        element={
          <ProtectedRoute allowedRoles={[...COMPANY_ROLES]}>
            <ErrorBoundary title="Errore nell'area azienda">
              <CompanyLayout />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      >
        <Route index element={<CompanyDashboard />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="cruscotto" element={<CruscottoHub />} />
        <Route path="cruscotto/aziendale" element={<CruscottoAziendale />} />
        <Route path="ordini" element={<ErrorBoundary title="Errore nel caricamento ordini"><OrdersList /></ErrorBoundary>} />
        <Route path="ordini/nuovo" element={<ErrorBoundary title="Errore nella creazione ordine"><CreateOrder /></ErrorBoundary>} />
        <Route path="ordini/:id" element={<ErrorBoundary title="Errore nel dettaglio ordine"><OrderDetail /></ErrorBoundary>} />
        <Route path="ordini/:id/diario" element={<ErrorBoundary title="Errore nel diario ordine"><OrderDiaryPage /></ErrorBoundary>} />
        <Route path="ordini/:id/modifica" element={<EditOrder />} />
        <Route path="magazzino" element={<Warehouse />} />
        <Route path="magazzino/gestione" element={<WarehouseManager />} />
        <Route path="calendario" element={<ErrorBoundary title="Errore nel caricamento calendario"><Calendar /></ErrorBoundary>} />
        <Route path="clienti" element={<CustomersList />} />
        <Route path="clienti/nuovo" element={<CreateCustomer />} />
        <Route path="clienti/:id" element={<CompanyCustomerDetail />} />
        
        <Route path="assistenza-lavori" element={<AssistenzaLavoriHub />} />
        <Route path="assistenza" element={<TicketsList />} />
        <Route path="assistenza/nuovo" element={<CreateCompanyTicket />} />
        <Route path="assistenza/:id" element={<TicketDetail />} />
        <Route path="interventi" element={<InterventiList />} />
        <Route path="interventi/:id" element={<InterventiDetail />} />
        <Route path="interventi/:id/chiudi" element={<ChiusuraIntervento />} />
        <Route path="manutenzione" element={<ManutenzioneList />} />
        <Route path="manutenzione/impianto/:id" element={<ImpiantoDetail />} />
        <Route path="impianti/:impiantoId/storico" element={<StoricoImpianto />} />
        <Route path="previsionale" element={<CashFlowForecast />} />
        <Route path="costi" element={<CompanyCosts />} />
        
        <Route path="attivita" element={<AttivitaRouter />} />
        <Route path="timbrature-personali" element={<TimbraturePersonali />} />
        <Route path="ferie-personali" element={<FeriePersonali />} />
        <Route path="cedolini-personali" element={<CedoliniPersonali />} />
        <Route path="errori" element={<Navigate to="/azienda/ordini?tab=anomalie" replace />} />
        <Route path="messaggistica-beta" element={<MessagingBeta />} />
        <Route path="chat" element={<InternalChat />} />
        <Route path="personale" element={<PersonalePage />} />
        <Route path="personale/timbratura" element={<TimbraturaKiosk />} />
        <Route path="tesoreria" element={<Tesoreria />} />
        <Route path="fatturazione" element={<BillingModeGuard requiredMode="external"><InvoicesList /></BillingModeGuard>} />
        <Route path="fatturazione/:id" element={<BillingModeGuard requiredMode="external"><InvoiceDetail /></BillingModeGuard>} />
        <Route path="scadenzario" element={<ErrorBoundary title="Errore nel caricamento scadenzario"><BillingModeGuard requiredMode="external"><Scadenzario /></BillingModeGuard></ErrorBoundary>} />
        
        {/* Native billing routes */}
        <Route path="documenti" element={<BillingModeGuard requiredMode="native"><DocumentiFiscaliList /></BillingModeGuard>} />
        <Route path="documenti/nuovo" element={<BillingModeGuard requiredMode="native"><EditorDocumento /></BillingModeGuard>} />
        <Route path="documenti/cassetto-sdi" element={<BillingModeGuard requiredMode="native"><CassettoSDI /></BillingModeGuard>} />
        <Route path="documenti/fatture-ricevute" element={<BillingModeGuard requiredMode="native"><FattureRicevutePage /></BillingModeGuard>} />
        <Route path="documenti/ddt" element={<Navigate to="/azienda/documenti?tipo=ddt" replace />} />
        <Route path="documenti/incassi" element={<BillingModeGuard requiredMode="native"><RegistroIncassi /></BillingModeGuard>} />
        <Route path="documenti/registro-iva" element={<BillingModeGuard requiredMode="native"><RegistroIVA /></BillingModeGuard>} />
        <Route path="documenti/anagrafiche" element={<BillingModeGuard requiredMode="native"><AnagraficheList /></BillingModeGuard>} />
        <Route path="documenti/anagrafiche/:id" element={<BillingModeGuard requiredMode="native"><AnagraficaDetail /></BillingModeGuard>} />
        <Route path="documenti/proforma" element={<Navigate to="/azienda/documenti?tipo=proforma" replace />} />
        <Route path="documenti/preventivi/pipeline" element={<Navigate to="/azienda/documenti?tipo=preventivo" replace />} />
        <Route path="documenti/note-credito" element={<Navigate to="/azienda/documenti?tipo=nota_credito" replace />} />
        <Route path="documenti/report" element={<BillingModeGuard requiredMode="native"><ReportFatturazione /></BillingModeGuard>} />
        <Route path="documenti/:id/dettaglio" element={<BillingModeGuard requiredMode="native"><DocumentoDetail /></BillingModeGuard>} />
        <Route path="documenti/:id" element={<BillingModeGuard requiredMode="native"><EditorDocumento /></BillingModeGuard>} />
        
        <Route path="prima-nota" element={<ErrorBoundary title="Errore nel caricamento prima nota"><PrimaNota /></ErrorBoundary>} />
        <Route path="ordini-acquisto" element={<Navigate to="/azienda/ordini?tab=acquisto" replace />} />
        <Route path="ordini-acquisto/:odaId" element={<PurchaseOrderDetail />} />
        <Route path="sicurezza-cantiere" element={<SicurezzaCantiere />} />
        <Route path="giornale-lavori" element={<GiornaleLavori />} />
        <Route path="subappaltatori" element={<SubappaltatoriPage />} />
        <Route path="subappaltatori/:id" element={<SubappaltatoreDetail />} />
        <Route path="marginalita" element={<Navigate to="/azienda/ordini?tab=marginalita" replace />} />
        {/* Unified Automazioni page — flow builder visuale + template gallery */}
        <Route path="automazioni" element={<AutomazioniUnified />} />

        {/* Backward-compatible redirects */}
        <Route path="automazioni-task" element={<Navigate to="/azienda/automazioni" replace />} />

        {/* Unified Agenti AI page (2 tabs: custom, platform) */}
        <Route path="agenti-ai" element={<AgentiAIPage />} />
        <Route path="agenti-ai/:agentId" element={<AgentDetailPage />} />

        {/* Render AI Routes */}
        <Route path="render" element={<RenderHub />} />
        <Route path="render/new" element={<RenderNew />} />
        <Route path="render/gallery" element={<RenderGallery />} />
        <Route path="render/gallery/:id" element={<RenderGalleryDetail />} />

        {/* Marketing Routes */}
        <Route path="marketing" element={<MarketingDashboard />} />
        <Route path="marketing/contatti" element={<MarketingContacts />} />
        <Route path="marketing/contatti/:id" element={<MarketingContactDetail />} />
        <Route path="marketing/opportunita" element={<MarketingOpportunities />} />
        <Route path="marketing/attivita" element={<Navigate to="/azienda/attivita?fonte=marketing" replace />} />
        <Route path="marketing/calendario" element={<MarketingCalendar />} />
        
        {/* Backward-compatible redirects for old marketing automation/agent routes */}
        <Route path="marketing/automazioni" element={<Navigate to="/azienda/automazioni" replace />} />
        <Route path="marketing/agente-ai/*" element={<Navigate to="/azienda/agenti-ai" replace />} />
        <Route path="agente-interno/*" element={<Navigate to="/azienda/agenti-ai" replace />} />
        <Route path="marketing/email" element={<EmailMarketing />} />
        <Route path="marketing/email/campagna/:id/editor" element={<CampaignEditor />} />
        <Route path="marketing/email/campagna/:id/builder" element={<DragDropEmailBuilder />} />
        <Route path="marketing/email/campagna/:id/impostazioni" element={<CampaignSendSettings />} />
        <Route path="marketing/whatsapp" element={<MarketingWhatsApp />} />
        <Route path="marketing/lead-forms" element={<Navigate to="/azienda/impostazioni/lead-forms" replace />} />
        <Route path="marketing/facebook-forms" element={<Navigate to="/azienda/impostazioni/lead-forms" replace />} />
        <Route path="marketing/reportistica" element={<ReportisticaPage />} />
        <Route path="marketing/google-ads" element={<Navigate to="/azienda/marketing/reportistica?tab=google-ads" replace />} />
        <Route path="marketing/sms" element={<Navigate to="/azienda/sms-marketing" replace />} />
        {/* Portale SMS Marketing — route principale con sub-path */}
        <Route path="sms-marketing" element={<SmsMarketingPage />} />
        <Route path="sms-marketing/campagne" element={<SmsMarketingPage defaultTab="campagne" />} />
        <Route path="sms-marketing/contatti" element={<SmsMarketingPage defaultTab="contatti" />} />
        <Route path="sms-marketing/template" element={<SmsMarketingPage defaultTab="template" />} />
        {/* SMS Transazionale — messaggi individuali + automazioni */}
        <Route path="sms" element={<SmsPage />} />
        <Route path="sms/invio" element={<SmsPage defaultTab="invio" />} />
        <Route path="sms/storico" element={<SmsPage defaultTab="storico" />} />
        <Route path="sms/automazioni" element={<SmsPage defaultTab="automazioni" />} />
        <Route path="marketing/analisi-preventivi" element={<Navigate to="/azienda/marketing/preventivi?tab=analisi" replace />} />
        <Route path="marketing/sales-os" element={<SalesOSDashboard />} />
        <Route path="marketing/preventivi" element={<Preventivi />} />
        <Route path="marketing/preventivi/nuovo" element={<QuoteBuilder />} />
        <Route path="marketing/preventivi/:id" element={<QuoteDetail />} />
        <Route path="marketing/preventivi/:id/modifica" element={<QuoteBuilder />} />
        
        <Route path="impostazioni" element={<SettingsLayout />}>
          <Route index element={<Navigate to="profilo" replace />} />
          <Route path="profilo" element={<SettingsProfile />} />
          <Route path="catalogo" element={<Navigate to="../listino" replace />} />
          <Route path="listino" element={<SettingsCatalog />} />
          <Route path="tariffe" element={<SettingsTariffe />} />
          <Route path="listino-manutenzione" element={<ListinoManutenzione />} />
          <Route path="margini" element={<SettingsMargini />} />
          <Route path="stati-ordine" element={<SettingsOrderStatus />} />
          <Route path="fornitori" element={<SettingsSuppliers />} />
          <Route path="categorie-costi" element={<SettingsCostCategories />} />
          <Route path="automazioni-finanza" element={<SettingsFinanceAutomation />} />
          <Route path="tag" element={<SettingsTags />} />
          <Route path="campi-personalizzati" element={<SettingsCustomFields />} />
          <Route path="sequenze" element={<SettingsPipelines />} />
          <Route path="calendari" element={<SettingsMarketingCalendars />} />
          {/* IMP3: Persone & Accessi — pagina unica con 4 tab */}
          <Route path="persone" element={<SettingsPeople />} />
          {/* Redirect delle 4 route precedenti → pagina unificata con tab corretto */}
          <Route path="utenti" element={<Navigate to="/azienda/impostazioni/persone?tab=utenti" replace />} />
          <Route path="utenti/:userId" element={<SettingsUserDetail />} />
          <Route path="venditori" element={<Navigate to="/azienda/impostazioni/persone?tab=venditori" replace />} />
          <Route path="staff" element={<Navigate to="/azienda/impostazioni/persone?tab=staff" replace />} />
          <Route path="sedi" element={<SettingsSedi />} />
          <Route path="team" element={<Navigate to="/azienda/impostazioni/persone?tab=team" replace />} />
          {/* IMP4: Sicurezza & Privacy — pagina unica con 4 tab */}
          <Route path="sicurezza-privacy" element={<SettingsSecurityHub />} />
          {/* Redirect delle 4 route precedenti → pagina unificata con tab corretto */}
          <Route path="sicurezza" element={<Navigate to="/azienda/impostazioni/sicurezza-privacy?tab=password" replace />} />
          <Route path="security-dashboard" element={<Navigate to="/azienda/impostazioni/sicurezza-privacy?tab=dashboard" replace />} />
          <Route path="attivita" element={<Navigate to="/azienda/impostazioni/sicurezza-privacy?tab=attivita" replace />} />
          <Route path="integrazioni" element={<SettingsIntegrations />} />
          <Route path="lead-forms" element={<FacebookFormsPage />} />
          <Route path="crediti" element={<SettingsCredits />} />
          <Route path="api" element={<SettingsApiKeys />} />
          <Route path="webhook" element={<SettingsWebhooks />} />
          <Route path="privacy" element={<Navigate to="/azienda/impostazioni/sicurezza-privacy?tab=privacy" replace />} />
          <Route path="branding" element={<SettingsBranding />} />
          <Route path="materiali-preventivi" element={<SettingsQuoteMaterials />} />
          <Route path="template-preventivi" element={<SettingsQuoteTemplates />} />
          <Route path="fatturazione" element={<SettingsBilling />} />
          <Route path="fatturazione-nativa" element={<ImpostazioniFatturazione />} />
          <Route path="abbonamento" element={<SettingsSubscriptionBilling />} />
          <Route path="form-builder" element={<SettingsFormBuilder />} />
          <Route path="numeri-telefono" element={<SettingsPhoneNumbers />} />
        </Route>

        <Route path="ritenute-garanzia" element={<ErrorBoundary title="Errore nel caricamento ritenute"><RitenuteGaranzia /></ErrorBoundary>} />
        <Route path="foto-cantiere" element={<Navigate to="/azienda/ordini?tab=foto" replace />} />
        <Route path="gantt-ordini" element={<Navigate to="/azienda/calendario?view=gantt" replace />} />
        <Route path="contabilita-fiscale" element={<ErrorBoundary title="Errore nella contabilità fiscale"><ContabilitaFiscale /></ErrorBoundary>} />
        <Route path="archivio-sostitutivo" element={<ErrorBoundary title="Errore nell'archivio sostitutivo"><ArchivioSostitutivo /></ErrorBoundary>} />

        {/* FEA — Firma Elettronica Avanzata + Documenti */}
        <Route path="firma-elettronica" element={<FirmaElettronicaHub />} />
        <Route path="firma-elettronica/nuovo-template" element={<NuovoTemplate />} />
      </Route>
    </>
  );
}
