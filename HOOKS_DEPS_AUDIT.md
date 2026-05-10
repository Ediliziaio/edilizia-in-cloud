# Hooks Dependencies Audit — react-hooks/exhaustive-deps

**Generato**: 2026-05-10  ·  **Warning attivi**: 88  ·  **File**: 57

Lista warning `react-hooks/exhaustive-deps` ATTIVI nel codebase.
Ognuno è un potenziale **stale closure bug**: l'hook usa una variabile catturata
che non si aggiorna quando cambia. Da auditare uno-per-uno.

Per ogni warning, valuta:
- ✅ **Aggiungere la dep** (caso più comune)
- ✅ **Stabilizzare via `useCallback`** se è una funzione che cambia ad ogni render
- ✅ **Estrarre via `useRef`** se è un valore esterno che NON deve triggerare re-run
- ⚠ **Suppress con `// eslint-disable-next-line` + commento esplicativo**
    (caso valido SOLO se davvero voluto, es. mount-only effect)

Quando completi un warning, RIMUOVILO da questo file.

---

## `src/components/admin/company/PaymentMethodCard.tsx` (1 warning)

- **L108:6** `useEffect` — manca: 'company.bank_account_holder', 'company.bank_iban', 'company.bank_name', 'company.payment_method', and 'company.payment_notes'

## `src/components/admin/referral/PayoutDialog.tsx` (1 warning)

- **L67:6** `useEffect` — manca: 'form' and 'referrer'

## `src/components/attivita/TaskDetailPanel.tsx` (1 warning)

- **L153:6** `useEffect` — manca: 'task?.title'

## `src/components/clients/CustomerDiaryPanel.tsx` (1 warning)

- **L186:9** `?` — The 'queryKey' array makes the dependencies of useEffect Hook (at line 246) change on every render. To fix this, wrap the initialization of ...

## `src/components/flow-builder/FlowBuilderConfigPanel.tsx` (3 warnings)

- **L140:5** `useMemo` — manca: 'selectedNode'
- **L369:6** `useEffect` — manca: 'config.contact_id' and 'onChange'
- **L476:6** `useEffect` — manca: 'onChange' and 'value'

## `src/components/flow-builder/FlowBuilderPage.tsx` (4 warnings)

- **L145:6** `useEffect` — manca: 'isNewFlowRoute', 'openCatalog', and 'openCatalogForEdge'
- **L198:5** `useCallback` — manca: 'openCatalogForEdge'
- **L235:5** `useCallback` — manca: 'addNodeFromItem'
- **L383:5** `useCallback` — manca: 'openCatalog'

## `src/components/flow-builder/catalog/ActionCatalogList.tsx` (1 warning)

- **L96:6** `useMemo` — manca: 'CATEGORY_ORDER'

## `src/components/flow-builder/catalog/TriggerCatalogList.tsx` (1 warning)

- **L63:6** `useMemo` — manca: 'CATEGORY_ORDER'

## `src/components/forecast/CashForecastTab.tsx` (2 warnings)

- **L68:9** `?` — The 'now' object construction makes the dependencies of useMemo Hook (at line 239) change on every render. To fix this, wrap the initializat...
- **L101:6** `useMemo` — manca: 'now'

## `src/components/forecast/CollectedTab.tsx` (3 warnings)

- **L44:9** `?` — The 'now' object construction makes the dependencies of useMemo Hook (at line 190) change on every render. To fix this, wrap the initializat...
- **L44:9** `?` — The 'now' object construction makes the dependencies of useMemo Hook (at line 204) change on every render. To fix this, wrap the initializat...
- **L44:9** `?` — The 'now' object construction makes the dependencies of useMemo Hook (at line 248) change on every render. To fix this, wrap the initializat...

## `src/components/forecast/CostsForecastTab.tsx` (2 warnings)

- **L51:7** `useMemo` — manca: 'nextMonthInterval', 'thisMonthEnd', and 'thisMonthStart'
- **L58:6** `useMemo` — manca: 'now'

## `src/components/forecast/TreasuryTab.tsx` (2 warnings)

- **L348:6** `useMemo` — manca: 'buildMonthlyMap' and 'mergeMonthly'
- **L402:6** `useMemo` — manca: 'buildMonthlyMap' and 'mergeMonthly'

## `src/components/integrations/steps/FieldMappingStep.tsx` (1 warning)

- **L117:6** `useEffect` — manca: 'loadFormFields'

## `src/components/integrations/steps/FormListStep.tsx` (1 warning)

- **L32:6** `useEffect` — manca: 'loadForms'

## `src/components/landing/QuickContactModal.tsx` (1 warning)

- **L68:6** `useEffect` — manca: 'close'

## `src/components/layouts/CompanyLayout.tsx` (2 warnings)

- **L777:6** `useEffect` — manca: 'setOpenMobile'
- **L811:6** `useEffect` — manca: 'findActiveAreaId' and 'openAreaId'

## `src/components/marketing/ContactSmsLog.tsx` (1 warning)

- **L65:6** `useEffect` — manca: 'queryKey'

## `src/components/marketing/DraggableAppointment.tsx` (1 warning)

- **L109:5** `useCallback` — manca: 'onResizeEnd'

## `src/components/marketing/automations/AutomationNodeConfig.tsx` (1 warning)

- **L174:9** `?` — The 'filters' logical expression could make the dependencies of useCallback Hook (at line 187) change on every render. To fix this, wrap the...

## `src/components/marketing/dashboard/DashboardSourcesTable.tsx` (1 warning)

- **L17:9** `?` — The 'rawRows' logical expression could make the dependencies of useMemo Hook (at line 27) change on every render. To fix this, wrap the init...

## `src/components/opportunities/OpportunityDetailDialog.tsx` (1 warning)

- **L204:6** `useEffect` — manca: 'opportunity'

## `src/components/tesoreria/BankAccountsList.tsx` (1 warning)

- **L44:6** `useEffect` — manca: 'loadAccounts'

## `src/components/tesoreria/BankAlertRules.tsx` (1 warning)

- **L43:6** `useEffect` — manca: 'loadRules'

## `src/components/tesoreria/BankConnectionsList.tsx` (1 warning)

- **L63:6** `useEffect` — manca: 'loadConnections'

## `src/components/tesoreria/CashFlowForecast.tsx` (1 warning)

- **L21:6** `useEffect` — manca: 'loadForecast'

## `src/components/tesoreria/CategorizationRules.tsx` (1 warning)

- **L51:6** `useEffect` — manca: 'loadRules'

## `src/components/tesoreria/ExpenseReports.tsx` (1 warning)

- **L49:6** `useEffect` — manca: 'loadReports'

## `src/components/tesoreria/TransactionsFeed.tsx` (1 warning)

- **L65:6** `useEffect` — manca: 'loadAccounts' and 'loadTransactions'

## `src/components/tesoreria/TreasuryOverview.tsx` (1 warning)

- **L38:6** `useEffect` — manca: 'loadData'

## `src/components/warehouse/WarehousePurchaseListTab.tsx` (4 warnings)

- **L340:9** `?` — The 'getPaymentDone' function makes the dependencies of useMemo Hook (at line 536) change on every render. Move it inside the useMemo callba...
- **L345:9** `?` — The 'getPaymentState' function makes the dependencies of useMemo Hook (at line 536) change on every render. Move it inside the useMemo callb...
- **L354:9** `?` — The 'getPaymentLabel' function makes the dependencies of useMemo Hook (at line 536) change on every render. Move it inside the useMemo callb...
- **L364:9** `?` — The 'getPaymentDetail' function makes the dependencies of useMemo Hook (at line 536) change on every render. Move it inside the useMemo call...

## `src/components/warehouse/WarehouseSectionsManager.tsx` (1 warning)

- **L250:6** `useEffect` — manca: 'updateZoneLayout'

## `src/contexts/AuthContext.tsx` (8 warnings)

- **L894:18** `?` — The ref value 'authGenRef.current' will likely have changed by the time this effect cleanup function runs. If this ref points to a node rend...
- **L981:6** `useCallback` — manca: 'queryClient'
- **L1020:6** `useEffect` — manca: 'state.user'
- **L1040:6** `useEffect` — manca: 'state.user'
- **L1102:6** `useEffect` — manca: 'state.user'
- **L1166:6** `useEffect` — manca: 'state.user'
- **L1223:6** `useEffect` — manca: 'state.user'
- **L1271:5** `useMemo` — manca: 'multiCompanyAccesses' and 'selectedMultiCompanyId'

## `src/hooks/useAutomationBuilder.ts` (1 warning)

- **L58:59** `?` — The ref value 'saveTimerRef.current' will likely have changed by the time this effect cleanup function runs. If this ref points to a node re...

## `src/hooks/useCashFlowData.ts` (1 warning)

- **L540:6** `useMemo` — manca: 'defaultPeriod'

## `src/hooks/useGoogleAdsStats.ts` (2 warnings)

- **L112:9** `?` — The 'stats' logical expression could make the dependencies of useMemo Hook (at line 113) change on every render. To fix this, wrap the initi...
- **L112:9** `?` — The 'stats' logical expression could make the dependencies of useMemo Hook (at line 114) change on every render. To fix this, wrap the initi...

## `src/hooks/useGpsContinuo.ts` (2 warnings)

- **L171:6** `useCallback` — manca: 'stopTracking'
- **L283:6** `useCallback` — RIMUOVERE dep 'stopTracking'

## `src/hooks/useOpportunitiesData.ts` (1 warning)

- **L200:6** `useEffect` — manca: 'infiniteQuery'

## `src/hooks/useSEO.ts` (1 warning)

- **L156:6** `useEffect` — manca: 'tags'

## `src/pages/admin/CsvImportPage.tsx` (1 warning)

- **L136:5** `useCallback` — manca: 'elaboraFile'

## `src/pages/admin/PlaybooksPage.tsx` (1 warning)

- **L267:6** `useEffect` — manca: 'playbook.actions', 'playbook.delay_hours', 'playbook.is_active', 'playbook.name', and 'playbook.trigger_event'

## `src/pages/azienda/InternalChat.tsx` (1 warning)

- **L1177:6** `useCallback` — manca: 'isSilvioAdminChannel'

## `src/pages/azienda/MarginalitaCantieri.tsx` (2 warnings)

- **L588:6** `useMemo` — manca: 'getMarginDecision' and 'getOrderAnomalySummary'
- **L623:6** `useMemo` — manca: 'getMarginDecision' and 'getOrderAnomalySummary'

## `src/pages/azienda/OrdersList.tsx` (3 warnings)

- **L291:9** `?` — The 'rawOrders' logical expression could make the dependencies of useMemo Hook (at line 444) change on every render. To fix this, wrap the i...
- **L291:9** `?` — The 'rawOrders' logical expression could make the dependencies of useMemo Hook (at line 697) change on every render. To fix this, wrap the i...
- **L1327:6** `useCallback` — RIMUOVERE dep 'yearFilter'

## `src/pages/azienda/UnifiedTasks.tsx` (2 warnings)

- **L163:6** `useMemo` — manca: 'PLATFORM_ROLES'
- **L175:6** `useMemo` — manca: 'in48h', 'now', and 'weekStart'

## `src/pages/azienda/dashboards/DashboardBuilder.tsx` (1 warning)

- **L244:6** `useEffect` — manca: 'dash.data'

## `src/pages/azienda/fatturazione/AnagraficaDetail.tsx` (1 warning)

- **L47:9** `?` — The 'documenti' logical expression could make the dependencies of useMemo Hook (at line 52) change on every render. To fix this, wrap the in...

## `src/pages/azienda/fatturazione/EditorDocumento.tsx` (1 warning)

- **L118:6** `useEffect` — manca: 'prefilled'

## `src/pages/azienda/fatturazione/RegistroIVA.tsx` (2 warnings)

- **L136:6** `useMemo` — manca: 'inPeriod'
- **L171:6** `useMemo` — manca: 'inPeriod'

## `src/pages/azienda/fatturazione/editor/EditorOrdineSection.tsx` (1 warning)

- **L49:6** `useEffect` — manca: 'linkMutation'

## `src/pages/azienda/marketing/MarketingContacts.tsx` (2 warnings)

- **L306:6** `useCallback` — manca: 'applyGroupRules'
- **L576:9** `?` — The 'contacts' logical expression could make the dependencies of useCallback Hook (at line 710) change on every render. To fix this, wrap th...

## `src/pages/azienda/marketing/MarketingOpportunities.tsx` (2 warnings)

- **L220:6** `useEffect` — manca: 'setSelectedPipelineId'
- **L223:9** `?` — The 'stages' logical expression could make the dependencies of useCallback Hook (at line 395) change on every render. To fix this, wrap the ...

## `src/pages/azienda/settings/SettingsIntegrations.tsx` (2 warnings)

- **L265:9** `?` — The 'gcalIntegrationLike' conditional could make the dependencies of useMemo Hook (at line 333) change on every render. Move it inside the u...
- **L281:9** `?` — The 'appleCalIntegrationLike' conditional could make the dependencies of useMemo Hook (at line 333) change on every render. Move it inside t...

## `src/pages/campo/CampoTesserino.tsx` (1 warning)

- **L45:6** `useEffect` — manca: 'isSubappaltatore', 'profile?.company_id', 'profile?.first_name', and 'profile?.last_name'

## `src/pages/public/FirmaOdV.tsx` (1 warning)

- **L63:6** `useEffect` — manca: 'loadOdv'

## `src/pages/public/PublicBooking.tsx` (1 warning)

- **L190:6** `useMemo` — manca: 'isSlotBusy'

## `src/pages/public/QuoteSignPage.tsx` (1 warning)

- **L84:6** `useEffect` — manca: 'loadQuote'

## `src/pages/public/SignaturePage.tsx` (1 warning)

- **L21:6** `useEffect` — manca: 'loadRequest'

---

## Status

- 2026-05-10: **5 warning fixati** come campione (fix definitivi):
  - `src/components/admin/referral/ReferralAnalytics.tsx:67` — rimossa dep inutile `payouts`
  - `src/components/attivita/TaskDetailPanel.tsx:148` — suppress mirato + commento (mount-on-task-change voluto)
  - `src/components/clients/CustomerDiaryPanel.tsx:246` — aggiunta dep `queryKey`
  - `src/components/computo/ComputoUploadModal.tsx:240` — aggiunta dep `reset`
  - `src/components/admin/referral/ReferrerDialog.tsx:119` — suppress + commento (`form` di react-hook-form stabile)
- Restanti 88 warning sono backlog (lista sopra)
