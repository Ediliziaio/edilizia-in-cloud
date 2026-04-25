import { lazy } from "react";
import { Route, Navigate, useParams } from "react-router-dom";

/** Redirect /azienda/interventi/:id → /azienda/assistenza/:id (unificazione) */
function InterventoDetailRedirect() {
  const { id } = useParams();
  return <Navigate to={`/azienda/assistenza/${id ?? ""}`} replace />;
}

/** Redirect /azienda/interventi/:id/chiudi → /azienda/assistenza/:id/chiudi */
function InterventoChiusuraRedirect() {
  const { id } = useParams();
  return <Navigate to={`/azienda/assistenza/${id ?? ""}/chiudi`} replace />;
}
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { FeatureRoute } from "@/components/auth/FeatureRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { CompanyLayout } from "@/components/layouts/CompanyLayout";
import { SettingsLayout } from "@/components/layouts/SettingsLayout";
import { useAuth } from "@/contexts/AuthContext";

// Company pages
const CompanyDashboard = lazy(() => import("@/pages/azienda/CompanyDashboard"));
const UpgradePage = lazy(() => import("@/pages/azienda/UpgradePage"));
const CruscottoAziendale = lazy(() => import("@/pages/azienda/CruscottoAziendale"));
const CruscottoHub = lazy(() => import("@/pages/azienda/CruscottoHub"));
const CruscottoDashboardPage = lazy(() => import("@/pages/azienda/CruscottoDashboardPage"));
const DashboardsList = lazy(() => import("@/pages/azienda/dashboards/DashboardsList"));
const DashboardView = lazy(() => import("@/pages/azienda/dashboards/DashboardView"));
const DashboardBuilder = lazy(() => import("@/pages/azienda/dashboards/DashboardBuilder"));
const SettingsProfile = lazy(() => import("@/pages/azienda/settings/SettingsProfile"));
const SettingsCatalog = lazy(() => import("@/pages/azienda/settings/SettingsCatalog"));
const SettingsCatalogImport = lazy(() => import("@/pages/azienda/settings/SettingsCatalogImport"));
const SettingsFamilyEditor = lazy(() => import("@/pages/azienda/settings/SettingsFamilyEditor"));
const SettingsBundle = lazy(() => import("@/pages/azienda/settings/SettingsBundle"));
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
const SettingsWhatsAppBot = lazy(() => import("@/pages/azienda/settings/SettingsWhatsAppBot"));
const SettingsCostCategories = lazy(() => import("@/pages/azienda/settings/SettingsCostCategories"));
const SettingsFinanceAutomation = lazy(() => import("@/pages/azienda/settings/SettingsFinanceAutomation"));
const SettingsCredits = lazy(() => import("@/pages/azienda/settings/SettingsCredits"));
const SettingsQuoteMaterials = lazy(() => import("@/pages/azienda/settings/SettingsQuoteMaterials"));
const SettingsQuoteTemplates = lazy(() => import("@/pages/azienda/settings/SettingsQuoteTemplates"));
const SettingsTariffe = lazy(() => import("@/pages/azienda/settings/SettingsTariffe"));
const ListinoManutenzione = lazy(() => import("@/pages/azienda/settings/ListinoManutenzione"));
const SettingsFinanziamenti = lazy(() => import("@/pages/azienda/settings/SettingsFinanziamenti"));
const SettingsFinanziamentiNuova = lazy(() => import("@/pages/azienda/settings/SettingsFinanziamentiNuova"));
const SettingsFinanziamentiDetail = lazy(() => import("@/pages/azienda/settings/SettingsFinanziamentiDetail"));
const SettingsFinanziamentiCalcolatore = lazy(() => import("@/pages/azienda/settings/SettingsFinanziamentiCalcolatore"));
const ListiniFornitoriPage = lazy(() =>
  import("@/features/serramenti-listini").then((m) => ({ default: m.ListiniFornitoriPage })),
);
const MatriceListiniPage = lazy(() =>
  import("@/features/serramenti-listini").then((m) => ({ default: m.MatriceListiniPage })),
);
const SettingsMargini = lazy(() => import("@/pages/azienda/settings/SettingsMargini"));
const SettingsScontistica = lazy(() => import("@/pages/azienda/settings/SettingsScontistica"));
const SettingsApiKeys = lazy(() => import("@/pages/azienda/settings/SettingsApiKeys"));
const SettingsWebhooks = lazy(() => import("@/pages/azienda/settings/SettingsWebhooks"));
const SettingsEmailDomain = lazy(() => import("@/pages/azienda/settings/SettingsEmailDomain"));
const SettingsEmailPreferences = lazy(() => import("@/pages/azienda/settings/SettingsEmailPreferences"));
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
 * company_admin + company_staff + employee + subcontractor → AttivitaStaff
 *   (dashboard personale con meteo, calendario, task)
 * altri ruoli → UnifiedTasks (task manager completo)
 */
function AttivitaRouter() {
  const { role } = useAuth();
  const STAFF_ROLES = ["company_admin", "company_staff", "employee", "subcontractor"] as const;
  if (STAFF_ROLES.includes(role as typeof STAFF_ROLES[number])) return <AttivitaStaff />;
  return <UnifiedTasks />;
}
// GlobalErrors rendered as tab inside OrdersList — lazy import removed
// MP-CLEANUP: MessagingBeta rimosso — dominio "Messaggi Esterni" eliminato.
const AutomazioniUnified = lazy(() => import("@/pages/azienda/AutomazioniUnified"));
const AgentiAIPage = lazy(() => import("@/pages/azienda/AgentiAIPage"));
const AgentDetailPage = lazy(() => import("@/pages/azienda/AgentDetailPage"));
const RenderCategoryHub = lazy(() => import("@/pages/azienda/RenderCategoryHub"));
const RenderHub = lazy(() => import("@/pages/azienda/RenderHub"));
const RenderNew = lazy(() => import("@/pages/azienda/RenderNewV2"));
const RenderGallery = lazy(() => import("@/pages/azienda/RenderGallery"));
const RenderGalleryDetail = lazy(() => import("@/pages/azienda/RenderGalleryDetail"));
const RenderBagnoHub = lazy(() => import("@/pages/azienda/RenderBagnoHub"));
const RenderBagnoNew = lazy(() => import("@/pages/azienda/RenderBagnoNew"));
const RenderBagnoGallery = lazy(() => import("@/pages/azienda/RenderBagnoGallery"));
const RenderBagnoGalleryDetail = lazy(() => import("@/pages/azienda/RenderBagnoGalleryDetail"));
const RenderPavimentoHub = lazy(() => import("@/pages/azienda/RenderPavimentoHub"));
const RenderPavimentoNew = lazy(() => import("@/pages/azienda/RenderPavimentoNew"));
const RenderPavimentoGallery = lazy(() => import("@/pages/azienda/RenderPavimentoGallery"));
const RenderPavimentoGalleryDetail = lazy(() => import("@/pages/azienda/RenderPavimentoGalleryDetail"));
const RenderFacciataHub = lazy(() => import("@/pages/azienda/RenderFacciataHub"));
const RenderFacciataNew = lazy(() => import("@/pages/azienda/RenderFacciataNew"));
const RenderFacciataGallery = lazy(() => import("@/pages/azienda/RenderFacciataGallery"));
const RenderFacciataGalleryDetail = lazy(() => import("@/pages/azienda/RenderFacciataGalleryDetail"));
const RenderPersianeHub = lazy(() => import("@/pages/azienda/RenderPersianeHub"));
const RenderPersianeNew = lazy(() => import("@/pages/azienda/RenderPersianeNew"));
const RenderPersianeGallery = lazy(() => import("@/pages/azienda/RenderPersianeGallery"));
const RenderPersianeGalleryDetail = lazy(() => import("@/pages/azienda/RenderPersianeGalleryDetail"));
const RenderTettoHub = lazy(() => import("@/pages/azienda/RenderTettoHub"));
const RenderTettoNew = lazy(() => import("@/pages/azienda/RenderTettoNew"));
const RenderTettoGallery = lazy(() => import("@/pages/azienda/RenderTettoGallery"));
const RenderTettoGalleryDetail = lazy(() => import("@/pages/azienda/RenderTettoGalleryDetail"));
const RenderPergoleHub = lazy(() => import("@/pages/azienda/RenderPergoleHub"));
const RenderPergoleNew = lazy(() => import("@/pages/azienda/RenderPergoleNew"));
const RenderPergoleGallery = lazy(() => import("@/pages/azienda/RenderPergoleGallery"));
const RenderPergoleGalleryDetail = lazy(() => import("@/pages/azienda/RenderPergoleGalleryDetail"));
const RenderPiscineHub = lazy(() => import("@/pages/azienda/RenderPiscineHub"));
const RenderPiscineNew = lazy(() => import("@/pages/azienda/RenderPiscineNew"));
const RenderPiscineGallery = lazy(() => import("@/pages/azienda/RenderPiscineGallery"));
const RenderPiscineGalleryDetail = lazy(() => import("@/pages/azienda/RenderPiscineGalleryDetail"));
const RenderStanzaHub = lazy(() => import("@/pages/azienda/RenderStanzaHub"));
const RenderStanzaNew = lazy(() => import("@/pages/azienda/RenderStanzaNew"));
const RenderStanzaGallery = lazy(() => import("@/pages/azienda/RenderStanzaGallery"));
const RenderStanzaGalleryDetail = lazy(() => import("@/pages/azienda/RenderStanzaGalleryDetail"));
const RenderTechnicalModuleHub = lazy(() => import("@/pages/azienda/RenderTechnicalModuleHub"));
const RenderTechnicalModuleNew = lazy(() => import("@/pages/azienda/RenderTechnicalModuleNew"));
const RenderTechnicalModuleGallery = lazy(() => import("@/pages/azienda/RenderTechnicalModuleGallery"));
const RenderTechnicalModuleGalleryDetail = lazy(() => import("@/pages/azienda/RenderTechnicalModuleGalleryDetail"));
const InternalChat = lazy(() => import("@/pages/azienda/InternalChat"));
const MioProfilo = lazy(() => import("@/pages/azienda/impostazioni/MioProfilo"));
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
const DDTRicezioneDetail = lazy(() => import("@/pages/azienda/DDTRicezioneDetail"));
const SicurezzaCantiere = lazy(() => import("@/pages/azienda/SicurezzaCantiere"));
const GiornaleLavori = lazy(() => import("@/pages/azienda/GiornaleLavori"));
const SubappaltatoriPage = lazy(() => import("@/pages/azienda/SubappaltatoriPage"));
const SubappaltatoreDetail = lazy(() => import("@/pages/azienda/SubappaltatoreDetail"));
// MarginalitaCantieri now rendered as tab inside OrdersList — lazy import removed
const TicketsList = lazy(() => import("@/pages/azienda/TicketsList"));
const TicketDetail = lazy(() => import("@/pages/azienda/TicketDetail"));
const CreateCompanyTicket = lazy(() => import("@/pages/azienda/CreateCompanyTicket"));
// InterventiList/InterventiDetail rimossi: funzionalità unificata in TicketsList/TicketDetail
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
// MP-CLEANUP: MarketingWhatsApp (legacy) non più referenziata: /azienda/marketing/whatsapp fa redirect al nuovo Hub.
// MP04 — Hub WhatsApp multi-numero
const WhatsAppHubPage = lazy(() => import("@/pages/azienda/whatsapp/WhatsAppHubPage"));
// MP-FINAL — Pagine granulari WhatsApp
const BroadcastListPage = lazy(() => import("@/pages/azienda/whatsapp/BroadcastListPage"));
// MP05-FIX — AiModelConfigPage azienda ELIMINATA (ownership SuperAdmin)
const BroadcastCreatePage = lazy(() => import("@/pages/azienda/whatsapp/BroadcastCreatePage"));
const BroadcastDetailPage = lazy(() => import("@/pages/azienda/whatsapp/BroadcastDetailPage"));
const WANumberDetailPage = lazy(() => import("@/pages/azienda/whatsapp/WANumberDetailPage"));
const SmsMarketingPage = lazy(() => import("@/pages/azienda/sms-marketing/index"));
const SmsPage = lazy(() => import("@/pages/azienda/sms/index"));
const OnboardingPage = lazy(() => import("@/pages/azienda/OnboardingPage"));
const OnboardingVertical = lazy(() => import("@/pages/azienda/onboarding/OnboardingVertical"));
const ReportisticaPage = lazy(() => import("@/pages/azienda/ReportisticaPage"));
const SalesOSDashboard = lazy(() => import("@/pages/azienda/marketing/SalesOSDashboard"));
const FacebookFormsPage = lazy(() => import("@/pages/azienda/marketing/FacebookFormsPage"));
const Preventivi = lazy(() => import("@/pages/azienda/marketing/Preventivi"));
const QuoteBuilder = lazy(() => import("@/pages/azienda/marketing/QuoteBuilder"));
const QuoteDetail = lazy(() => import("@/pages/azienda/marketing/QuoteDetail"));
const QuoteMargini = lazy(() => import("@/pages/azienda/marketing/QuoteMargini"));
// AnalisiPreventivi now rendered as tab inside Preventivi — lazy import removed
// QuoteApprovals now rendered as tab inside Preventivi — deep-link /approvazioni redirect sotto
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
        <Route path="onboarding/vertical" element={<ErrorBoundary title="Errore nel caricamento onboarding settore"><OnboardingVertical /></ErrorBoundary>} />
        <Route path="cruscotto" element={<CruscottoDashboardPage />} />
        <Route path="cruscotto/gestisci" element={<CruscottoHub />} />
        <Route path="cruscotto/aziendale" element={<CruscottoAziendale />} />
        {/* Upgrade fallback — mostrata da FeatureRoute quando una feature è negata */}
        <Route path="upgrade" element={<UpgradePage />} />
        {/* Dashboard Builder v1 — custom dashboards (gated: dashboard_builder_v1) */}
        <Route path="dashboards" element={<FeatureRoute featureKey="dashboard_builder_v1"><ErrorBoundary title="Errore dashboards"><DashboardsList /></ErrorBoundary></FeatureRoute>} />
        <Route path="dashboards/nuova" element={<FeatureRoute featureKey="dashboard_builder_v1"><ErrorBoundary title="Errore builder"><DashboardBuilder /></ErrorBoundary></FeatureRoute>} />
        <Route path="dashboards/:id" element={<FeatureRoute featureKey="dashboard_builder_v1"><ErrorBoundary title="Errore dashboard"><DashboardView /></ErrorBoundary></FeatureRoute>} />
        <Route path="dashboards/:id/modifica" element={<FeatureRoute featureKey="dashboard_builder_v1"><ErrorBoundary title="Errore builder"><DashboardBuilder /></ErrorBoundary></FeatureRoute>} />
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
        <Route path="assistenza/:id/chiudi" element={<FeatureRoute featureKey="cantieri_avanzati"><ChiusuraIntervento /></FeatureRoute>} />
        {/* Interventi unificati dentro Assistenza — redirect retrocompat: */}
        <Route path="interventi" element={<Navigate to="/azienda/assistenza?tipo=intervento" replace />} />
        <Route path="interventi/nuovo" element={<Navigate to="/azienda/assistenza/nuovo?tipo=intervento" replace />} />
        <Route path="interventi/:id" element={<InterventoDetailRedirect />} />
        <Route path="interventi/:id/chiudi" element={<InterventoChiusuraRedirect />} />
        <Route path="manutenzione" element={<FeatureRoute featureKey="cantieri_avanzati"><ManutenzioneList /></FeatureRoute>} />
        <Route path="manutenzione/impianto/:id" element={<FeatureRoute featureKey="cantieri_avanzati"><ImpiantoDetail /></FeatureRoute>} />
        <Route path="impianti/:impiantoId/storico" element={<FeatureRoute featureKey="cantieri_avanzati"><StoricoImpianto /></FeatureRoute>} />
        <Route path="previsionale" element={<CashFlowForecast />} />
        <Route path="costi" element={<CompanyCosts />} />
        
        <Route path="attivita" element={<AttivitaRouter />} />
        {/* Le pagine timbrature-personali, ferie-personali, cedolini-personali
            sono ora tab dentro AttivitaStaff — redirect per backward compat */}
        <Route path="timbrature-personali" element={<Navigate to="/azienda/attivita?tab=timbrature" replace />} />
        <Route path="ferie-personali" element={<Navigate to="/azienda/attivita?tab=ferie" replace />} />
        <Route path="cedolini-personali" element={<Navigate to="/azienda/attivita?tab=cedolini" replace />} />
        <Route path="errori" element={<Navigate to="/azienda/ordini?tab=anomalie" replace />} />
        {/* MP-CLEANUP: rotta messaggistica-beta rimossa — dominio eliminato. */}
        <Route path="chat" element={<InternalChat />} />
        <Route path="profilo" element={<Navigate to="/azienda/impostazioni/mio-profilo" replace />} />
        {/* HR & Personale — gated: hr_personale (addon pro/enterprise) */}
        <Route path="personale" element={<FeatureRoute featureKey="hr_personale"><PersonalePage /></FeatureRoute>} />
        <Route path="personale/timbratura" element={<FeatureRoute featureKey="hr_personale"><TimbraturaKiosk /></FeatureRoute>} />
        {/* Tesoreria — gated: tesoreria (core, default abilitato su tutti i piani) */}
        <Route path="tesoreria" element={<FeatureRoute featureKey="tesoreria"><Tesoreria /></FeatureRoute>} />
        {/* Fatturazione esterna — doppio guard: feature-level + billing mode */}
        <Route path="fatturazione" element={<FeatureRoute featureKey="fatturazione"><BillingModeGuard requiredMode="external"><InvoicesList /></BillingModeGuard></FeatureRoute>} />
        <Route path="fatturazione/:id" element={<FeatureRoute featureKey="fatturazione"><BillingModeGuard requiredMode="external"><InvoiceDetail /></BillingModeGuard></FeatureRoute>} />
        <Route path="scadenzario" element={<ErrorBoundary title="Errore nel caricamento scadenzario"><FeatureRoute featureKey="fatturazione"><BillingModeGuard requiredMode="external"><Scadenzario /></BillingModeGuard></FeatureRoute></ErrorBoundary>} />

        {/* Native billing routes — gated: documenti (core) + billing mode native */}
        <Route path="documenti" element={<FeatureRoute featureKey="documenti"><BillingModeGuard requiredMode="native"><DocumentiFiscaliList /></BillingModeGuard></FeatureRoute>} />
        <Route path="documenti/nuovo" element={<FeatureRoute featureKey="documenti"><BillingModeGuard requiredMode="native"><EditorDocumento /></BillingModeGuard></FeatureRoute>} />
        <Route path="documenti/cassetto-sdi" element={<FeatureRoute featureKey="documenti"><BillingModeGuard requiredMode="native"><CassettoSDI /></BillingModeGuard></FeatureRoute>} />
        <Route path="documenti/fatture-ricevute" element={<FeatureRoute featureKey="documenti"><BillingModeGuard requiredMode="native"><FattureRicevutePage /></BillingModeGuard></FeatureRoute>} />
        <Route path="documenti/ddt" element={<Navigate to="/azienda/documenti?tipo=ddt" replace />} />
        <Route path="documenti/incassi" element={<FeatureRoute featureKey="documenti"><BillingModeGuard requiredMode="native"><RegistroIncassi /></BillingModeGuard></FeatureRoute>} />
        <Route path="documenti/registro-iva" element={<FeatureRoute featureKey="documenti"><BillingModeGuard requiredMode="native"><RegistroIVA /></BillingModeGuard></FeatureRoute>} />
        <Route path="documenti/anagrafiche" element={<FeatureRoute featureKey="documenti"><BillingModeGuard requiredMode="native"><AnagraficheList /></BillingModeGuard></FeatureRoute>} />
        <Route path="documenti/anagrafiche/:id" element={<FeatureRoute featureKey="documenti"><BillingModeGuard requiredMode="native"><AnagraficaDetail /></BillingModeGuard></FeatureRoute>} />
        <Route path="documenti/proforma" element={<Navigate to="/azienda/documenti?tipo=proforma" replace />} />
        <Route path="documenti/preventivi/pipeline" element={<Navigate to="/azienda/documenti?tipo=preventivo" replace />} />
        <Route path="documenti/note-credito" element={<Navigate to="/azienda/documenti?tipo=nota_credito" replace />} />
        <Route path="documenti/report" element={<FeatureRoute featureKey="documenti"><BillingModeGuard requiredMode="native"><ReportFatturazione /></BillingModeGuard></FeatureRoute>} />
        <Route path="documenti/:id/dettaglio" element={<FeatureRoute featureKey="documenti"><BillingModeGuard requiredMode="native"><DocumentoDetail /></BillingModeGuard></FeatureRoute>} />
        <Route path="documenti/:id" element={<FeatureRoute featureKey="documenti"><BillingModeGuard requiredMode="native"><EditorDocumento /></BillingModeGuard></FeatureRoute>} />

        {/* Prima nota — gated: tesoreria (stesso dominio finanziario) */}
        <Route path="prima-nota" element={<ErrorBoundary title="Errore nel caricamento prima nota"><FeatureRoute featureKey="tesoreria"><PrimaNota /></FeatureRoute></ErrorBoundary>} />
        <Route path="ordini-acquisto" element={<Navigate to="/azienda/ordini?tab=acquisto" replace />} />
        <Route path="ordini-acquisto/:odaId" element={<PurchaseOrderDetail />} />
        <Route path="ddt" element={<Navigate to="/azienda/ordini?tab=ddt" replace />} />
        <Route path="ddt/:ddtId" element={<ErrorBoundary title="Errore nel dettaglio DDT"><DDTRicezioneDetail /></ErrorBoundary>} />
        {/* Cantieri avanzati — gated: cantieri_avanzati (core, default su tutti i piani) */}
        <Route path="sicurezza-cantiere" element={<FeatureRoute featureKey="cantieri_avanzati"><SicurezzaCantiere /></FeatureRoute>} />
        <Route path="giornale-lavori" element={<FeatureRoute featureKey="cantieri_avanzati"><GiornaleLavori /></FeatureRoute>} />
        <Route path="subappaltatori" element={<FeatureRoute featureKey="cantieri_avanzati"><SubappaltatoriPage /></FeatureRoute>} />
        <Route path="subappaltatori/:id" element={<FeatureRoute featureKey="cantieri_avanzati"><SubappaltatoreDetail /></FeatureRoute>} />
        <Route path="marginalita" element={<Navigate to="/azienda/ordini?tab=marginalita" replace />} />
        {/* Unified Automazioni page — flow builder visuale + template gallery */}
        <Route path="automazioni" element={<AutomazioniUnified />} />

        {/* Backward-compatible redirects */}
        <Route path="automazioni-task" element={<Navigate to="/azienda/automazioni" replace />} />

        {/* Unified Agenti AI page (2 tabs: custom, platform) — gated: ai_agents */}
        <Route path="agenti-ai" element={<FeatureRoute featureKey="ai_agents"><AgentiAIPage /></FeatureRoute>} />
        <Route path="agenti-ai/:agentId" element={<FeatureRoute featureKey="ai_agents"><AgentDetailPage /></FeatureRoute>} />

        {/* Render AI Routes — gated: render_ai */}
        <Route path="render" element={<FeatureRoute featureKey="render_ai"><RenderCategoryHub /></FeatureRoute>} />
        {/* Render Infissi */}
        <Route path="render/infissi" element={<FeatureRoute featureKey="render_ai"><RenderHub /></FeatureRoute>} />
        <Route path="render/infissi/new" element={<FeatureRoute featureKey="render_ai"><RenderNew /></FeatureRoute>} />
        <Route path="render/infissi/gallery" element={<FeatureRoute featureKey="render_ai"><RenderGallery /></FeatureRoute>} />
        <Route path="render/infissi/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderGalleryDetail /></FeatureRoute>} />
        {/* Render Bagno */}
        <Route path="render/bagno" element={<FeatureRoute featureKey="render_ai"><RenderBagnoHub /></FeatureRoute>} />
        <Route path="render/bagno/new" element={<FeatureRoute featureKey="render_ai"><RenderBagnoNew /></FeatureRoute>} />
        <Route path="render/bagno/gallery" element={<FeatureRoute featureKey="render_ai"><RenderBagnoGallery /></FeatureRoute>} />
        <Route path="render/bagno/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderBagnoGalleryDetail /></FeatureRoute>} />
        {/* Render Pavimento */}
        <Route path="render/pavimento" element={<FeatureRoute featureKey="render_ai"><RenderPavimentoHub /></FeatureRoute>} />
        <Route path="render/pavimento/new" element={<FeatureRoute featureKey="render_ai"><RenderPavimentoNew /></FeatureRoute>} />
        <Route path="render/pavimento/gallery" element={<FeatureRoute featureKey="render_ai"><RenderPavimentoGallery /></FeatureRoute>} />
        <Route path="render/pavimento/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderPavimentoGalleryDetail /></FeatureRoute>} />
        <Route path="render/facciata" element={<FeatureRoute featureKey="render_ai"><RenderFacciataHub /></FeatureRoute>} />
        <Route path="render/facciata/new" element={<FeatureRoute featureKey="render_ai"><RenderFacciataNew /></FeatureRoute>} />
        <Route path="render/facciata/gallery" element={<FeatureRoute featureKey="render_ai"><RenderFacciataGallery /></FeatureRoute>} />
        <Route path="render/facciata/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderFacciataGalleryDetail /></FeatureRoute>} />
        {/* Render Persiane */}
        <Route path="render/persiane" element={<FeatureRoute featureKey="render_ai"><RenderPersianeHub /></FeatureRoute>} />
        <Route path="render/persiane/new" element={<FeatureRoute featureKey="render_ai"><RenderPersianeNew /></FeatureRoute>} />
        <Route path="render/persiane/gallery" element={<FeatureRoute featureKey="render_ai"><RenderPersianeGallery /></FeatureRoute>} />
        <Route path="render/persiane/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderPersianeGalleryDetail /></FeatureRoute>} />
        {/* Render Tetto */}
        <Route path="render/tetto" element={<FeatureRoute featureKey="render_ai"><RenderTettoHub /></FeatureRoute>} />
        <Route path="render/tetto/new" element={<FeatureRoute featureKey="render_ai"><RenderTettoNew /></FeatureRoute>} />
        <Route path="render/tetto/gallery" element={<FeatureRoute featureKey="render_ai"><RenderTettoGallery /></FeatureRoute>} />
        <Route path="render/tetto/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderTettoGalleryDetail /></FeatureRoute>} />
        {/* Render Pergole */}
        <Route path="render/pergole" element={<FeatureRoute featureKey="render_ai"><RenderPergoleHub /></FeatureRoute>} />
        <Route path="render/pergole/new" element={<FeatureRoute featureKey="render_ai"><RenderPergoleNew /></FeatureRoute>} />
        <Route path="render/pergole/gallery" element={<FeatureRoute featureKey="render_ai"><RenderPergoleGallery /></FeatureRoute>} />
        <Route path="render/pergole/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderPergoleGalleryDetail /></FeatureRoute>} />
        {/* Render Piscine */}
        <Route path="render/piscine" element={<FeatureRoute featureKey="render_ai"><RenderPiscineHub /></FeatureRoute>} />
        <Route path="render/piscine/new" element={<FeatureRoute featureKey="render_ai"><RenderPiscineNew /></FeatureRoute>} />
        <Route path="render/piscine/gallery" element={<FeatureRoute featureKey="render_ai"><RenderPiscineGallery /></FeatureRoute>} />
        <Route path="render/piscine/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderPiscineGalleryDetail /></FeatureRoute>} />
        {/* Render Stanza */}
        <Route path="render/stanza" element={<FeatureRoute featureKey="render_ai"><RenderStanzaHub /></FeatureRoute>} />
        <Route path="render/stanza/new" element={<FeatureRoute featureKey="render_ai"><RenderStanzaNew /></FeatureRoute>} />
        <Route path="render/stanza/gallery" element={<FeatureRoute featureKey="render_ai"><RenderStanzaGallery /></FeatureRoute>} />
        <Route path="render/stanza/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderStanzaGalleryDetail /></FeatureRoute>} />
        <Route path="render/ristrutturazioni" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleHub moduleId="ristrutturazioni" /></FeatureRoute>} />
        <Route path="render/ristrutturazioni/new" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleNew moduleId="ristrutturazioni" /></FeatureRoute>} />
        <Route path="render/ristrutturazioni/gallery" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleGallery moduleId="ristrutturazioni" /></FeatureRoute>} />
        <Route path="render/ristrutturazioni/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleGalleryDetail moduleId="ristrutturazioni" /></FeatureRoute>} />
        <Route path="render/pavimenti-esterni" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleHub moduleId="pavimenti-esterni" /></FeatureRoute>} />
        <Route path="render/pavimenti-esterni/new" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleNew moduleId="pavimenti-esterni" /></FeatureRoute>} />
        <Route path="render/pavimenti-esterni/gallery" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleGallery moduleId="pavimenti-esterni" /></FeatureRoute>} />
        <Route path="render/pavimenti-esterni/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleGalleryDetail moduleId="pavimenti-esterni" /></FeatureRoute>} />
        <Route path="render/giardini" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleHub moduleId="giardini" /></FeatureRoute>} />
        <Route path="render/giardini/new" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleNew moduleId="giardini" /></FeatureRoute>} />
        <Route path="render/giardini/gallery" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleGallery moduleId="giardini" /></FeatureRoute>} />
        <Route path="render/giardini/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleGalleryDetail moduleId="giardini" /></FeatureRoute>} />
        <Route path="render/porte-blindate" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleHub moduleId="porte-blindate" /></FeatureRoute>} />
        <Route path="render/porte-blindate/new" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleNew moduleId="porte-blindate" /></FeatureRoute>} />
        <Route path="render/porte-blindate/gallery" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleGallery moduleId="porte-blindate" /></FeatureRoute>} />
        <Route path="render/porte-blindate/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleGalleryDetail moduleId="porte-blindate" /></FeatureRoute>} />
        <Route path="render/porte-interne" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleHub moduleId="porte-interne" /></FeatureRoute>} />
        <Route path="render/porte-interne/new" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleNew moduleId="porte-interne" /></FeatureRoute>} />
        <Route path="render/porte-interne/gallery" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleGallery moduleId="porte-interne" /></FeatureRoute>} />
        <Route path="render/porte-interne/gallery/:id" element={<FeatureRoute featureKey="render_ai"><RenderTechnicalModuleGalleryDetail moduleId="porte-interne" /></FeatureRoute>} />

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
        <Route path="marketing/email" element={<FeatureRoute featureKey="email_marketing"><EmailMarketing /></FeatureRoute>} />
        <Route path="marketing/email/campagna/:id/editor" element={<FeatureRoute featureKey="email_marketing"><CampaignEditor /></FeatureRoute>} />
        <Route path="marketing/email/campagna/:id/builder" element={<FeatureRoute featureKey="email_marketing"><DragDropEmailBuilder /></FeatureRoute>} />
        <Route path="marketing/email/campagna/:id/impostazioni" element={<FeatureRoute featureKey="email_marketing"><CampaignSendSettings /></FeatureRoute>} />
        {/* MP04 — redirect legacy marketing/whatsapp → nuovo Hub */}
        <Route path="marketing/whatsapp" element={<Navigate to="/azienda/whatsapp" replace />} />
        {/* MP04 — Hub WhatsApp multi-numero */}
        <Route path="whatsapp" element={<FeatureRoute featureKey="whatsapp"><WhatsAppHubPage /></FeatureRoute>} />
        {/* MP-FINAL — Routing granulare */}
        <Route path="whatsapp/numeri/:id" element={<FeatureRoute featureKey="whatsapp"><WANumberDetailPage /></FeatureRoute>} />
        <Route path="whatsapp/broadcast" element={<FeatureRoute featureKey="whatsapp"><BroadcastListPage /></FeatureRoute>} />
        <Route path="whatsapp/broadcast/nuovo" element={<FeatureRoute featureKey="whatsapp"><BroadcastCreatePage /></FeatureRoute>} />
        <Route path="whatsapp/broadcast/:id" element={<FeatureRoute featureKey="whatsapp"><BroadcastDetailPage /></FeatureRoute>} />
        {/* MP05-FIX — rotta azienda /ai-modelli RIMOSSA (config ora SuperAdmin-only) */}
        <Route path="marketing/lead-forms" element={<Navigate to="/azienda/impostazioni/lead-forms" replace />} />
        <Route path="marketing/facebook-forms" element={<Navigate to="/azienda/impostazioni/lead-forms" replace />} />
        <Route path="marketing/reportistica" element={<ReportisticaPage />} />
        <Route path="marketing/google-ads" element={<Navigate to="/azienda/marketing/reportistica?tab=google-ads" replace />} />
        <Route path="marketing/sms" element={<Navigate to="/azienda/sms-marketing" replace />} />
        {/* Portale SMS Marketing — route principale con sub-path (gated: sms_marketing) */}
        <Route path="sms-marketing" element={<FeatureRoute featureKey="sms_marketing"><SmsMarketingPage /></FeatureRoute>} />
        <Route path="sms-marketing/campagne" element={<FeatureRoute featureKey="sms_marketing"><SmsMarketingPage defaultTab="campagne" /></FeatureRoute>} />
        <Route path="sms-marketing/contatti" element={<FeatureRoute featureKey="sms_marketing"><SmsMarketingPage defaultTab="contatti" /></FeatureRoute>} />
        <Route path="sms-marketing/template" element={<FeatureRoute featureKey="sms_marketing"><SmsMarketingPage defaultTab="template" /></FeatureRoute>} />
        {/* SMS Transazionale — messaggi individuali + automazioni */}
        <Route path="sms" element={<SmsPage />} />
        <Route path="sms/invio" element={<SmsPage defaultTab="invio" />} />
        <Route path="sms/storico" element={<SmsPage defaultTab="storico" />} />
        <Route path="sms/automazioni" element={<SmsPage defaultTab="automazioni" />} />
        <Route path="marketing/analisi-preventivi" element={<Navigate to="/azienda/marketing/preventivi?tab=analisi" replace />} />
        <Route path="marketing/sales-os" element={<SalesOSDashboard />} />
        <Route path="marketing/preventivi" element={<Preventivi />} />
        <Route path="marketing/preventivi/approvazioni" element={<Navigate to="/azienda/marketing/preventivi?tab=approvazioni" replace />} />
        <Route path="marketing/preventivi/nuovo" element={<QuoteBuilder />} />
        <Route path="marketing/preventivi/:id" element={<QuoteDetail />} />
        <Route path="marketing/preventivi/:id/modifica" element={<QuoteBuilder />} />
        {/* Sprint B — Varianti Costo Manodopera: vista admin-only gated da can_view_margins */}
        <Route path="marketing/preventivi/:id/margini" element={<QuoteMargini />} />
        
        <Route path="impostazioni" element={<SettingsLayout />}>
          <Route index element={<Navigate to="mio-profilo" replace />} />
          {/* ── Il mio account (accessibile a tutti) ── */}
          <Route path="mio-profilo" element={<MioProfilo />} />
          {/* ── Impostazioni azienda (solo admin/permessi) ── */}
          <Route path="profilo" element={<SettingsProfile />} />
          <Route path="catalogo" element={<Navigate to="../listino" replace />} />
          <Route path="listino" element={<SettingsCatalog />} />
          <Route path="listino/import" element={<SettingsCatalogImport />} />
          <Route path="catalogo/import" element={<Navigate to="../listino/import" replace />} />
          <Route path="listino/famiglie" element={<Navigate to="../listino?tab=famiglie" replace />} />
          <Route path="listino/famiglie/nuova" element={<SettingsFamilyEditor />} />
          <Route path="listino/famiglie/:id" element={<SettingsFamilyEditor />} />
          <Route path="bundle-serramentista" element={<SettingsBundle />} />
          <Route path="bundle" element={<SettingsBundle />} />
          <Route path="tariffe" element={<SettingsTariffe />} />
          <Route path="listino-manutenzione" element={<ListinoManutenzione />} />
          {/* Finanziamenti — tabelle finanziarie + calcolatore (Phase A MVP) */}
          <Route path="finanziamenti" element={<SettingsFinanziamenti />} />
          <Route path="finanziamenti/nuova" element={<SettingsFinanziamentiNuova />} />
          <Route path="finanziamenti/calcolatore" element={<SettingsFinanziamentiCalcolatore />} />
          <Route path="finanziamenti/:id" element={<SettingsFinanziamentiDetail />} />
          {/* Listini Serramenti Avanzati (feature opt-in) */}
          <Route
            path="listini-serramenti/fornitori"
            element={
              <FeatureRoute featureKey="listini_serramenti_avanzati">
                <ErrorBoundary title="Errore listini serramenti">
                  <ListiniFornitoriPage />
                </ErrorBoundary>
              </FeatureRoute>
            }
          />
          <Route
            path="listini-serramenti/matrice"
            element={
              <FeatureRoute featureKey="listini_serramenti_avanzati">
                <ErrorBoundary title="Errore matrice listini">
                  <MatriceListiniPage />
                </ErrorBoundary>
              </FeatureRoute>
            }
          />
          <Route path="margini" element={<SettingsMargini />} />
          <Route path="scontistica" element={<SettingsScontistica />} />
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
          <Route path="whatsapp-bot" element={<SettingsWhatsAppBot />} />
          <Route path="lead-forms" element={<FacebookFormsPage />} />
          <Route path="crediti" element={<SettingsCredits />} />
          <Route path="api" element={<SettingsApiKeys />} />
          <Route path="webhook" element={<SettingsWebhooks />} />
          <Route path="dominio-email" element={<SettingsEmailDomain />} />
          <Route path="preferenze-email" element={<SettingsEmailPreferences />} />
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

        {/* FEA — Firma Elettronica Avanzata + Documenti (gated: firma_fea) */}
        <Route path="firma-elettronica" element={<FeatureRoute featureKey="firma_fea"><FirmaElettronicaHub /></FeatureRoute>} />
        <Route path="firma-elettronica/nuovo-template" element={<FeatureRoute featureKey="firma_fea"><NuovoTemplate /></FeatureRoute>} />
      </Route>
    </>
  );
}
