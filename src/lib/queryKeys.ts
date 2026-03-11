/**
 * Centralized query key factory for React Query.
 * 
 * Usage:
 *   queryKey: queryKeys.orders.list(companyId)
 *   queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
 * 
 * Convention:
 *   - `.all`       → broadest invalidation scope (prefix array)
 *   - `.list(...)` → filtered list query
 *   - `.detail(id)`→ single-entity query
 */

export const queryKeys = {
  // ── Orders ──────────────────────────────────────────────
  orders: {
    all: ["orders"] as const,
    list: (companyId: string | undefined) => ["orders", "list", companyId] as const,
    detail: (orderId: string | undefined) => ["orders", "detail", orderId] as const,
    statuses: (companyId: string | undefined) => ["orders", "statuses", companyId] as const,
    installments: (orderId: string | undefined) => ["orders", "installments", orderId] as const,
    recent: (companyId: string | undefined) => ["orders", "recent", companyId] as const,
  },

  // ── Customers / Profiles ───────────────────────────────
  customers: {
    all: ["customers"] as const,
    list: (companyId: string | undefined) => ["customers", "list", companyId] as const,
    detail: (customerId: string | undefined) => ["customers", "detail", customerId] as const,
  },

  // ── Marketing Contacts ─────────────────────────────────
  marketingContacts: {
    all: ["marketing-contacts"] as const,
    list: (companyId: string | undefined) => ["marketing-contacts", "list", companyId] as const,
    detail: (contactId: string | undefined) => ["marketing-contacts", "detail", contactId] as const,
    notes: (contactId: string | null | undefined, opportunityId?: string | null) =>
      ["marketing-contacts", "notes", contactId, opportunityId] as const,
    activities: (contactId: string | undefined, companyId?: string | undefined) =>
      ["marketing-contacts", "activities", contactId, companyId] as const,
    documents: (contactId: string | undefined) =>
      ["marketing-contacts", "documents", contactId] as const,
    attribution: (contactId: string | undefined) =>
      ["marketing-contacts", "attribution", contactId] as const,
    attributionSessions: (contactId: string | undefined) =>
      ["marketing-contacts", "attribution-sessions", contactId] as const,
  },

  // ── Marketing Opportunities ────────────────────────────
  opportunities: {
    all: ["marketing-opportunities"] as const,
    list: (companyId: string | undefined, pipelineId: string | null) =>
      ["marketing-opportunities", "list", companyId, pipelineId] as const,
    detail: (opportunityId: string | undefined) =>
      ["marketing-opportunities", "detail", opportunityId] as const,
    byContact: (contactId: string | undefined) =>
      ["marketing-opportunities", "by-contact", contactId] as const,
  },

  // ── Marketing Custom Fields ────────────────────────────
  customFields: {
    all: ["marketing-custom-fields"] as const,
    byType: (companyId: string | undefined, objectType: string) =>
      ["marketing-custom-fields", companyId, objectType] as const,
    contactValues: (contactId: string | null) =>
      ["marketing-custom-fields", "contact-values", contactId] as const,
    opportunityValues: (opportunityId: string | null) =>
      ["marketing-custom-fields", "opportunity-values", opportunityId] as const,
  },

  // ── Marketing Tags ────────────────────────────────────
  tags: {
    all: ["marketing-tags"] as const,
    list: (companyId: string | undefined) => ["marketing-tags", "list", companyId] as const,
  },

  // ── Internal Call Logs ─────────────────────────────────
  internalCallLogs: {
    all: ["internal-call-logs"] as const,
    list: (companyId: string | undefined) => ["internal-call-logs", "list", companyId] as const,
    detail: (id: string | undefined) => ["internal-call-logs", "detail", id] as const,
    actions: (callId: string | undefined) => ["internal-call-logs", "actions", callId] as const,
  },

  // ── Internal Campaigns ─────────────────────────────────
  internalCampaigns: {
    all: ["internal-campaigns"] as const,
    stats: ["internal-campaigns", "stats"] as const,
  },

  // ── Marketing Pipelines ────────────────────────────────
  pipelines: {
    all: ["marketing-pipelines"] as const,
    list: (companyId: string | undefined) => ["marketing-pipelines", "list", companyId] as const,
  },

  // ── Email Marketing ────────────────────────────────────
  emailCampaigns: {
    all: ["email-campaigns"] as const,
    paginated: (
      companyId: string | undefined,
      search: string,
      category: string,
      folderId: string | null,
      page: number,
      perPage: number,
    ) => ["email-campaigns", "paginated", companyId, search, category, folderId, page, perPage] as const,
    folders: (companyId: string | undefined) => ["email-campaigns", "folders", companyId] as const,
  },

  emailTemplates: {
    all: ["email-templates"] as const,
    paginated: (
      companyId: string | undefined,
      search: string,
      folderId: string | null,
      page: number,
      perPage: number,
    ) => ["email-templates", "paginated", companyId, search, folderId, page, perPage] as const,
    folders: (companyId: string | undefined) => ["email-templates", "folders", companyId] as const,
  },

  // ── Notifications ──────────────────────────────────────
  notifications: {
    all: ["notifications"] as const,
    list: (companyId: string | undefined, userId: string | undefined) =>
      ["notifications", "list", companyId, userId] as const,
  },

  // ── Dashboard ──────────────────────────────────────────
  dashboard: {
    all: ["dashboard"] as const,
    company: (companyId: string | undefined, preset?: string) =>
      ["dashboard", "company", companyId, preset] as const,
    admin: () => ["dashboard", "admin"] as const,
  },

  // ── Cruscotto ──────────────────────────────────────────
  cruscotto: {
    all: ["cruscotto"] as const,
    marketing: (companyId: string | undefined, ...rest: any[]) =>
      ["cruscotto", "marketing", companyId, ...rest] as const,
    installments: (companyId: string | undefined) =>
      ["cruscotto", "installments", companyId] as const,
    operations: (companyId: string | undefined, ...rest: any[]) =>
      ["cruscotto", "operations", companyId, ...rest] as const,
    finance: (companyId: string | undefined, ...rest: any[]) =>
      ["cruscotto", "finance", companyId, ...rest] as const,
    invoiceStats: (companyId: string | undefined) =>
      ["cruscotto", "invoice-stats", companyId] as const,
    targets: (companyId: string | undefined) =>
      ["cruscotto", "targets", companyId] as const,
    weekly: (companyId: string | undefined) =>
      ["cruscotto", "weekly", companyId] as const,
    today: (companyId: string | undefined, dateFrom?: string, dateTo?: string) =>
      ["cruscotto", "today", companyId, dateFrom, dateTo] as const,
    cashFlowForecast: (companyId: string | undefined) =>
      ["cruscotto", "cashflow-forecast", companyId] as const,
  },

  // ── Cash Flow / Forecast ───────────────────────────────
  cashflow: {
    all: ["cashflow"] as const,
    installments: (companyId: string | undefined) =>
      ["cashflow", "installments", companyId] as const,
    externalTeams: (companyId: string | undefined) =>
      ["cashflow", "external-teams", companyId] as const,
    companyCosts: (companyId: string | undefined) =>
      ["cashflow", "company-costs", companyId] as const,
    commissions: (companyId: string | undefined) =>
      ["cashflow", "commissions", companyId] as const,
    pendingItems: (companyId: string | undefined) =>
      ["cashflow", "pending-items", companyId] as const,
    supplierBalances: (companyId: string | undefined) =>
      ["cashflow", "supplier-balances", companyId] as const,
    scadenze: (companyId: string | undefined) =>
      ["cashflow", "scadenze", companyId] as const,
    treasuryPaidCosts: (companyId: string | undefined) =>
      ["cashflow", "treasury", companyId, "paid-costs"] as const,
    treasuryPaidTeams: (companyId: string | undefined) =>
      ["cashflow", "treasury", companyId, "paid-teams"] as const,
    treasuryPaidCommissions: (companyId: string | undefined) =>
      ["cashflow", "treasury", companyId, "paid-commissions"] as const,
    treasuryPaidSuppliers: (companyId: string | undefined) =>
      ["cashflow", "treasury", companyId, "paid-suppliers"] as const,
    treasuryEmployees: (companyId: string | undefined) =>
      ["cashflow", "treasury", companyId, "employees"] as const,
    treasuryCategories: (companyId: string | undefined) =>
      ["cashflow", "treasury", companyId, "categories"] as const,
    bankBalance: (companyId: string | undefined) =>
      ["cashflow", "bank-balance", companyId] as const,
    treasury: (companyId: string | undefined) =>
      ["cashflow", "treasury", companyId] as const,
    primaNotaYear: (companyId: string | undefined) =>
      ["cashflow", "prima-nota-year", companyId] as const,
    summary: (companyId: string | undefined) =>
      ["cashflow", "summary", companyId] as const,
  },

  // ── Company Costs ──────────────────────────────────────
  costs: {
    all: ["costs"] as const,
    list: (companyId: string | undefined) => ["costs", "list", companyId] as const,
    suppliers: (companyId: string | undefined) => ["costs", "suppliers", companyId] as const,
    orderItems: (companyId: string | undefined) => ["costs", "order-items", companyId] as const,
    externalTeams: (companyId: string | undefined) => ["costs", "external-teams", companyId] as const,
    employees: (companyId: string | undefined) => ["costs", "employees", companyId] as const,
    commissions: (companyId: string | undefined) => ["costs", "commissions", companyId] as const,
    ordersForCosts: (companyId: string | undefined) => ["costs", "orders-for-costs", companyId] as const,
    categories: (companyId: string | undefined) => ["costs", "categories", companyId] as const,
    budgets: (companyId: string | undefined) => ["costs", "budgets", companyId] as const,
  },

  // ── Warehouse ──────────────────────────────────────────
  warehouse: {
    all: ["warehouse"] as const,
    items: (companyId: string | undefined, ...filters: any[]) =>
      ["warehouse", "items", companyId, ...filters] as const,
    badgeCounts: (companyId: string | undefined) =>
      ["warehouse", "badge-counts", companyId] as const,
    stockNames: (companyId: string | undefined) =>
      ["warehouse", "stock-names", companyId] as const,
    uniqueOrders: (companyId: string | undefined) =>
      ["warehouse", "unique-orders", companyId] as const,
  },

  // ── Suppliers ──────────────────────────────────────────
  suppliers: {
    all: ["suppliers"] as const,
    list: (companyId: string | undefined) => ["suppliers", "list", companyId] as const,
    operational: (companyId: string | undefined) => ["suppliers", "operational", companyId] as const,
    detail: (supplierId: string | undefined) => ["suppliers", "detail", supplierId] as const,
    oda: (supplierId: string | undefined) => ["suppliers", "oda", supplierId] as const,
    scadenze: (supplierId: string | undefined) => ["suppliers", "scadenze", supplierId] as const,
    primaNota: (supplierId: string | undefined) => ["suppliers", "prima-nota", supplierId] as const,
  },

  // ── Tickets ────────────────────────────────────────────
  tickets: {
    all: ["tickets"] as const,
    list: (companyId: string | undefined) => ["tickets", "list", companyId] as const,
    detail: (ticketId: string | undefined) => ["tickets", "detail", ticketId] as const,
    unreadCounts: (companyId: string | undefined) => ["tickets", "unread-counts", companyId] as const,
  },

  // ── Employees / HR ─────────────────────────────────────
  employees: {
    all: ["employees"] as const,
    list: (companyId: string | undefined) => ["employees", "list", companyId] as const,
    detail: (employeeId: string | undefined) => ["employees", "detail", employeeId] as const,
    workLogs: (companyId: string | undefined, ...filters: any[]) =>
      ["employees", "work-logs", companyId, ...filters] as const,
    leave: (companyId: string | undefined) => ["employees", "leave", companyId] as const,
  },

  // ── Company Staff ──────────────────────────────────────
  staff: {
    all: ["staff"] as const,
    roles: (companyId: string | undefined) => ["staff", "roles", companyId] as const,
    salespeople: (companyId: string | undefined) => ["staff", "salespeople", companyId] as const,
    callCenter: (companyId: string | undefined) => ["staff", "call-center", companyId] as const,
  },

  // ── Quotes ──────────────────────────────────────────────
  quotes: {
    all: ["quotes"] as const,
    list: (companyId: string | undefined) => ["quotes", "list", companyId] as const,
    detail: (quoteId: string | undefined) => ["quotes", "detail", quoteId] as const,
    items: (quoteId: string | undefined) => ["quotes", "items", quoteId] as const,
    attachments: (quoteId: string | undefined) => ["quotes", "attachments", quoteId] as const,
  },

  // ── Quote Templates ────────────────────────────────────
  quoteTemplates: {
    all: ["quote-templates"] as const,
    list: (companyId: string | undefined) => ["quote-templates", "list", companyId] as const,
  },

  // ── Internal Automations ─────────────────────────────
  internalAutomations: {
    all: ["internal-automation-flows"] as const,
    flows: (companyId: string | undefined) => ["internal-automation-flows", companyId] as const,
    flow: (flowId: string | undefined) => ["internal-automation-flows", "detail", flowId] as const,
    nodes: (flowId: string | undefined) => ["internal-automation-flows", "nodes", flowId] as const,
    connections: (flowId: string | undefined) => ["internal-automation-flows", "connections", flowId] as const,
    log: (flowId: string | undefined) => ["internal-automation-flows", "log", flowId] as const,
  },

  // ── Internal AI Agents ──────────────────────────────
  internalAgents: {
    all: ["internal-ai-agents"] as const,
    list: (companyId: string | undefined) => ["internal-ai-agents", "list", companyId] as const,
    detail: (agentId: string | undefined) => ["internal-ai-agents", "detail", agentId] as const,
  },

  // ── Automation ─────────────────────────────────────────
  automations: {
    all: ["automations"] as const,
    flows: (companyId: string | undefined) => ["automations", "flows", companyId] as const,
    flow: (flowId: string | undefined) => ["automations", "flow", flowId] as const,
    nodes: (flowId: string | undefined) => ["automations", "nodes", flowId] as const,
    connections: (flowId: string | undefined) => ["automations", "connections", flowId] as const,
    executionCounts: (flowId: string | undefined) => ["automations", "execution-counts", flowId] as const,
  },

  // ── Messaging ──────────────────────────────────────────
  messaging: {
    all: ["messaging"] as const,
    conversationsAll: ["messaging-conversations"] as const,
    conversations: (companyId: string | undefined, filter?: string) =>
      ["messaging-conversations", companyId, filter] as const,
    messagesAll: ["messaging-messages"] as const,
    messages: (conversationId: string | null) =>
      ["messaging-messages", conversationId] as const,
    aiRunsAll: ["messaging-ai-runs"] as const,
    aiRuns: (messageId: string | null) =>
      ["messaging-ai-runs", messageId] as const,
  },

  // ── WhatsApp ───────────────────────────────────────────
  whatsapp: {
    all: ["whatsapp"] as const,
    config: (companyId: string | undefined) =>
      ["whatsapp-config", companyId] as const,
    broadcasts: (companyId: string | undefined) =>
      ["whatsapp-broadcasts", companyId] as const,
    templates: (companyId: string | undefined) =>
      ["whatsapp-templates", companyId] as const,
  },

  // ── Global Search ──────────────────────────────────────
  globalSearch: {
    all: ["global-search"] as const,
    results: (companyId: string | undefined, query: string) =>
      ["global-search", companyId, query] as const,
  },

  // ── Customer Portal ────────────────────────────────────
  customerPortal: {
    all: ["customer-portal"] as const,
    orders: (clientId: string | undefined) => ["customer-portal", "orders", clientId] as const,
    documents: (clientId: string | undefined) => ["customer-portal", "documents", clientId] as const,
    installments: (clientId: string | undefined) => ["customer-portal", "installments", clientId] as const,
    appointments: (clientId: string | undefined) => ["customer-portal", "appointments", clientId] as const,
    messages: (clientId: string | undefined, companyId: string | undefined) =>
      ["customer-portal", "messages", clientId, companyId] as const,
  },

  // ── Signatures ─────────────────────────────────────────
  signatures: {
    all: ["signatures"] as const,
    byOrder: (orderId: string | undefined) => ["signatures", "by-order", orderId] as const,
  },

  // ── Partner / Referral ─────────────────────────────────
  partner: {
    all: ["partner"] as const,
    referrer: (userId: string | undefined) => ["partner", "referrer", userId] as const,
    companies: (referrerId: string | undefined) => ["partner", "companies", referrerId] as const,
    ledger: (referrerId: string | undefined) => ["partner", "ledger", referrerId] as const,
    clicks: (referrerId: string | undefined) => ["partner", "clicks", referrerId] as const,
  },

  // ── Marketing Calendar ───────────────────────────────────
  marketingCalendar: {
    all: ["marketing-calendar"] as const,
    appointments: (companyId: string | undefined, ...rest: any[]) =>
      ["marketing-calendar", "appointments", companyId, ...rest] as const,
    calendars: (companyId: string | undefined) =>
      ["marketing-calendar", "calendars", companyId] as const,
    users: (companyId: string | undefined) =>
      ["marketing-calendar", "users", companyId] as const,
  },

  // ── Marketing Dashboard ─────────────────────────────────
  marketing: {
    all: ["marketing"] as const,
    dashboard: (
      companyId: string | undefined,
      dateFrom?: string,
      dateTo?: string,
      assignedIds?: string[] | null,
      sources?: string[],
      pipelineId?: string | null,
    ) => ["marketing", "dashboard", companyId, dateFrom, dateTo, assignedIds, sources, pipelineId] as const,
  },

  // ── Admin ──────────────────────────────────────────────
  admin: {
    all: ["admin"] as const,
    dashboard: () => ["admin", "dashboard"] as const,
    revenueIntelligence: () => ["admin", "revenue-intelligence"] as const,
    companyDetail: (id: string | undefined) => ["admin", "company-detail", id] as const,
    companyTeam: (id: string | undefined) => ["admin", "company-team", id] as const,
  },

  // ── Prima Nota ─────────────────────────────────────────
  primaNota: {
    all: ["prima-nota"] as const,
    list: (companyId: string | undefined, filters?: any) => ["prima-nota", "list", companyId, filters] as const,
    saldo: (companyId: string | undefined, fromDate?: string, toDate?: string) =>
      ["prima-nota", "saldo", companyId, fromDate, toDate] as const,
  },

  // ── Scadenzario ────────────────────────────────────────
  scadenzario: {
    all: ["scadenzario"] as const,
    list: (companyId: string | undefined) => ["scadenzario", "list", companyId] as const,
    summary: (companyId: string | undefined) => ["scadenzario", "summary", companyId] as const,
  },

  // ── Attribution ────────────────────────────────────────
  attribution: {
    all: ["attribution"] as const,
    report: (companyId: string | undefined, ...rest: any[]) =>
      ["attribution", "report", companyId, ...rest] as const,
  },

  // ── API Health ─────────────────────────────────────────
  apiHealth: {
    all: ["api-health"] as const,
  },

  // ── Brand Settings ─────────────────────────────────────
  branding: {
    all: ["branding"] as const,
    settings: (companyId: string | undefined) => ["branding", "settings", companyId] as const,
  },

  // ── Feature Flags ──────────────────────────────────────
  featureFlags: {
    all: ["feature-flags"] as const,
    list: (companyId: string | undefined) => ["feature-flags", "list", companyId] as const,
  },

  // ── Calendars ──────────────────────────────────────────
  calendars: {
    all: ["calendars"] as const,
    list: (companyId: string | undefined) => ["calendars", "list", companyId] as const,
  },

  // ── Appointments ───────────────────────────────────────
  appointments: {
    all: ["appointments"] as const,
    list: (companyId: string | undefined, ...filters: any[]) =>
      ["appointments", "list", companyId, ...filters] as const,
  },

  // ── AI Agents (Marketing/Sales) ─────────────────────
  aiAgents: {
    all: ["ai-agents"] as const,
    list: () => ["ai-agents", "list"] as const,
    detail: (agentId: string | undefined) => ["ai-agents", "detail", agentId] as const,
    listMinimal: () => ["ai-agents", "list-minimal"] as const,
    conversations: (agentId: string | undefined) => ["ai-agents", "conversations", agentId] as const,
    conversationsContact: (contactId: string | undefined) => ["ai-agents", "conversations-contact", contactId] as const,
    kb: (agentId: string | undefined) => ["ai-agents", "kb", agentId] as const,
    kbGlobalCount: () => ["ai-agents", "kb-global-count"] as const,
    tests: (agentId: string | undefined) => ["ai-agents", "tests", agentId] as const,
    phoneNumbers: () => ["ai-agents", "phone-numbers"] as const,
  },

  // ── Meta Forms (Facebook Lead Ads) ────────────────────
  metaForms: {
    all: ["meta-forms"] as const,
    integration: (companyId: string | undefined) =>
      ["meta-forms", "integration", companyId] as const,
    forms: (companyId: string | undefined, integrationId: string | undefined) =>
      ["meta-forms", "forms", companyId, integrationId] as const,
    leadCounts: (companyId: string | undefined) =>
      ["meta-forms", "lead-counts", companyId] as const,
    pages: (companyId: string | undefined, integrationId: string | undefined) =>
      ["meta-forms", "pages", companyId, integrationId] as const,
  },

  // ── Margin Analysis ────────────────────────────────────
  margin: {
    all: ["margin"] as const,
    orders: (companyId: string | null) => ["margin", "orders", companyId] as const,
    items: (companyId: string | null, orderCount?: number) => ["margin", "items", companyId, orderCount] as const,
    teams: (companyId: string | null, orderCount?: number) => ["margin", "teams", companyId, orderCount] as const,
    salespeople: (companyId: string | null, orderCount?: number) => ["margin", "salespeople", companyId, orderCount] as const,
    fixedCosts: (companyId: string | null) => ["margin", "fixed-costs", companyId] as const,
    employees: (companyId: string | null) => ["margin", "employees", companyId] as const,
  },

  // ── Break-Even Historical ──────────────────────────────
  breakEven: {
    all: ["break-even"] as const,
    orders: (companyId: string | null) => ["break-even", "orders", companyId] as const,
    items: (companyId: string | null, orderCount?: number) => ["break-even", "items", companyId, orderCount] as const,
    teams: (companyId: string | null, orderCount?: number) => ["break-even", "teams", companyId, orderCount] as const,
    fixedCosts: (companyId: string | null) => ["break-even", "fixed-costs", companyId] as const,
    employees: (companyId: string | null) => ["break-even", "employees", companyId] as const,
  },
} as const;
