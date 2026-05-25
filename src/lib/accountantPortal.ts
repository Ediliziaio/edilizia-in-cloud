export type AccountantSection =
  | "dashboard"
  | "aziende"
  | "documenti"
  | "controllo"
  | "cantieri"
  | "richieste"
  | "profilo";

export type AccountantRisk = "ok" | "warning" | "critical";

export type AccountantAccessMode = "solo_lettura" | "operativo" | "approvazione";

export interface AccountantCompany {
  id: string;
  name: string;
  vatNumber: string;
  owner: string;
  plan: string;
  risk: AccountantRisk;
  accessMode: AccountantAccessMode;
  lastSync: string;
  monthStatus: string;
  missingDocuments: number;
  openRequests: number;
  invoicesToReview: number;
  cashBalance: number;
  expectedMargin: number;
  marginDelta: number;
  activeJobs: number;
  blockedJobs: number;
  permissions: string[];
  nextAction: string;
}

export interface AccountantRequest {
  id: string;
  companyId: string;
  title: string;
  area: string;
  due: string;
  status: "aperta" | "in_revisione" | "risolta";
  owner: string;
}

export interface AccountantJobInsight {
  id: string;
  companyId: string;
  code: string;
  title: string;
  status: string;
  expectedMargin: number;
  missingItems: string[];
  lastUpdate: string;
}

export interface AccountantDocumentQueue {
  id: string;
  companyId: string;
  title: string;
  count: number;
  severity: AccountantRisk;
  cta: string;
}

export interface AccountantPriorityItem {
  id: string;
  companyId: string;
  title: string;
  reason: string;
  severity: AccountantRisk;
  area: string;
  due: string;
  action: string;
  score: number;
}

export interface AccountantAiSuggestion {
  id: string;
  label: string;
  prompt: string;
  response: string;
}

export interface AccountantDeadline {
  id: string;
  companyId: string;
  title: string;
  type: "fiscale" | "operativa" | "documentale";
  due: string;
  owner: string;
  status: "da_fare" | "in_corso" | "pronta";
}

export interface AccountantReport {
  id: string;
  companyId: string;
  title: string;
  period: string;
  status: "pronto" | "bozza" | "da_generare";
  highlights: string[];
}

export interface AccountantDelegation {
  id: string;
  companyId: string;
  title: string;
  status: "attiva" | "in_scadenza" | "mancante";
  expiresAt: string;
  scope: string[];
}

export interface AccountantTeamMember {
  id: string;
  name: string;
  role: string;
  clients: number;
  openTasks: number;
  focus: string;
}

export interface AccountantAuditEvent {
  id: string;
  companyId: string;
  actor: string;
  action: string;
  target: string;
  when: string;
}

export const accountantCompanies: AccountantCompany[] = [
  {
    id: "rossi-restauri",
    name: "Rossi Restauri S.r.l.",
    vatNumber: "IT04123580962",
    owner: "Marco Rossi",
    plan: "Business",
    risk: "critical",
    accessMode: "approvazione",
    lastSync: "oggi 09:42",
    monthStatus: "Chiusura aprile incompleta",
    missingDocuments: 9,
    openRequests: 4,
    invoicesToReview: 12,
    cashBalance: -34200,
    expectedMargin: 14.8,
    marginDelta: -7.4,
    activeJobs: 8,
    blockedJobs: 2,
    permissions: ["Finanza", "Controllo gestione", "Cantieri", "Documenti"],
    nextAction: "Verificare 3 fatture passive senza commessa e margine del cantiere Viale Monza.",
  },
  {
    id: "edil-nova",
    name: "Edil Nova Costruzioni",
    vatNumber: "IT08771230966",
    owner: "Giulia Neri",
    plan: "Pro",
    risk: "warning",
    accessMode: "operativo",
    lastSync: "oggi 08:15",
    monthStatus: "Dati pronti per prima revisione",
    missingDocuments: 4,
    openRequests: 2,
    invoicesToReview: 6,
    cashBalance: 18600,
    expectedMargin: 21.5,
    marginDelta: 2.1,
    activeJobs: 5,
    blockedJobs: 1,
    permissions: ["Finanza", "Documenti", "Cantieri"],
    nextAction: "Confermare split payment su fattura cliente Comune e inviare richiesta DURC aggiornata.",
  },
  {
    id: "bianchi-impianti",
    name: "Bianchi Impianti S.r.l.",
    vatNumber: "IT06651200158",
    owner: "Luca Bianchi",
    plan: "Starter",
    risk: "ok",
    accessMode: "solo_lettura",
    lastSync: "ieri 18:20",
    monthStatus: "Aprile chiuso",
    missingDocuments: 1,
    openRequests: 1,
    invoicesToReview: 2,
    cashBalance: 72400,
    expectedMargin: 28.2,
    marginDelta: 4.8,
    activeJobs: 3,
    blockedJobs: 0,
    permissions: ["Finanza", "Documenti"],
    nextAction: "Scaricare export prima nota e archiviare ricevute di pagamento.",
  },
  {
    id: "verdi-edilizia",
    name: "Verdi Edilizia Generale",
    vatNumber: "IT02314470123",
    owner: "Sara Verdi",
    plan: "Business",
    risk: "warning",
    accessMode: "approvazione",
    lastSync: "oggi 10:05",
    monthStatus: "Anomalie IVA da risolvere",
    missingDocuments: 6,
    openRequests: 3,
    invoicesToReview: 9,
    cashBalance: 9300,
    expectedMargin: 17.6,
    marginDelta: -2.8,
    activeJobs: 6,
    blockedJobs: 1,
    permissions: ["Finanza", "Controllo gestione", "Cantieri", "Documenti"],
    nextAction: "Rivedere reverse charge su subappalto e bloccare export fino a conferma.",
  },
];

export const accountantRequests: AccountantRequest[] = [
  {
    id: "req-1",
    companyId: "rossi-restauri",
    title: "Caricare DDT materiali cantiere Viale Monza",
    area: "Documenti",
    due: "oggi",
    status: "aperta",
    owner: "Amministrazione Rossi",
  },
  {
    id: "req-2",
    companyId: "rossi-restauri",
    title: "Confermare fattura passiva senza commessa",
    area: "Controllo gestione",
    due: "entro domani",
    status: "in_revisione",
    owner: "Commercialista",
  },
  {
    id: "req-3",
    companyId: "edil-nova",
    title: "Inviare DURC aggiornato",
    area: "Finanza",
    due: "27 mag",
    status: "aperta",
    owner: "Giulia Neri",
  },
  {
    id: "req-4",
    companyId: "bianchi-impianti",
    title: "Verificare export prima nota aprile",
    area: "Documenti",
    due: "fatto",
    status: "risolta",
    owner: "Studio",
  },
  {
    id: "req-5",
    companyId: "verdi-edilizia",
    title: "Revisione aliquota IVA agevolata",
    area: "Fiscale",
    due: "oggi",
    status: "in_revisione",
    owner: "Sara Verdi",
  },
];

export const accountantJobInsights: AccountantJobInsight[] = [
  {
    id: "job-1",
    companyId: "rossi-restauri",
    code: "ORD-2026-014",
    title: "Ristrutturazione Viale Monza",
    status: "Margine in calo",
    expectedMargin: 8.9,
    missingItems: ["2 fatture passive non agganciate", "rapportino manodopera mancante"],
    lastUpdate: "oggi 07:50",
  },
  {
    id: "job-2",
    companyId: "edil-nova",
    code: "ORD-2026-021",
    title: "Condominio Via Roma",
    status: "SAL da fatturare",
    expectedMargin: 24.1,
    missingItems: ["conferma SAL", "ritenuta garanzia"],
    lastUpdate: "ieri 16:30",
  },
  {
    id: "job-3",
    companyId: "verdi-edilizia",
    code: "ORD-2026-019",
    title: "Adeguamento scuola comunale",
    status: "IVA da verificare",
    expectedMargin: 16.2,
    missingItems: ["titolo edilizio", "dichiarazione cliente"],
    lastUpdate: "oggi 09:10",
  },
];

export const accountantDocumentQueues: AccountantDocumentQueue[] = [
  {
    id: "doc-1",
    companyId: "rossi-restauri",
    title: "Fatture passive senza commessa",
    count: 7,
    severity: "critical",
    cta: "Aggancia alle commesse",
  },
  {
    id: "doc-2",
    companyId: "verdi-edilizia",
    title: "Documenti IVA da controllare",
    count: 5,
    severity: "warning",
    cta: "Apri revisione IVA",
  },
  {
    id: "doc-3",
    companyId: "edil-nova",
    title: "Ricevute incassi da riconciliare",
    count: 4,
    severity: "warning",
    cta: "Riconcilia incassi",
  },
  {
    id: "doc-4",
    companyId: "bianchi-impianti",
    title: "Export pronto per contabile",
    count: 1,
    severity: "ok",
    cta: "Scarica export",
  },
];

export const accountantPriorityItems: AccountantPriorityItem[] = [
  {
    id: "prio-1",
    companyId: "rossi-restauri",
    title: "Cassa negativa e fatture passive non agganciate",
    reason: "Cassa sotto soglia, 7 fatture senza commessa e margine Viale Monza in calo.",
    severity: "critical",
    area: "Controllo gestione",
    due: "oggi",
    action: "Apri controllo Rossi",
    score: 96,
  },
  {
    id: "prio-2",
    companyId: "verdi-edilizia",
    title: "IVA agevolata e reverse charge da validare",
    reason: "Documenti IVA incompleti prima dell'export e 1 commessa pubblica da bloccare.",
    severity: "warning",
    area: "Fiscale",
    due: "oggi",
    action: "Apri documenti Verdi",
    score: 82,
  },
  {
    id: "prio-3",
    companyId: "edil-nova",
    title: "SAL da fatturare e DURC aggiornato",
    reason: "Manca conferma SAL su Condominio Via Roma e richiesta DURC aperta.",
    severity: "warning",
    area: "Cantieri",
    due: "48h",
    action: "Apri cantieri Edil Nova",
    score: 71,
  },
  {
    id: "prio-4",
    companyId: "bianchi-impianti",
    title: "Export prima nota pronto",
    reason: "Aprile chiuso, export contabile disponibile e una ricevuta da archiviare.",
    severity: "ok",
    area: "Documenti",
    due: "questa settimana",
    action: "Scarica export",
    score: 34,
  },
];

export const accountantAiSuggestions: AccountantAiSuggestion[] = [
  {
    id: "ai-1",
    label: "Clienti da chiamare oggi",
    prompt: "Dimmi quali clienti devo chiamare oggi e perche.",
    response: "Priorita: Rossi Restauri per cassa negativa e fatture senza commessa; Verdi Edilizia per IVA/reverse charge prima dell'export; Edil Nova per SAL e DURC.",
  },
  {
    id: "ai-2",
    label: "Richieste documenti",
    prompt: "Prepara le richieste documenti mancanti da inviare alle aziende.",
    response: "Bozza: chiedere DDT Viale Monza a Rossi, documenti IVA agevolata a Verdi, DURC aggiornato a Edil Nova e ricevuta incasso a Bianchi.",
  },
  {
    id: "ai-3",
    label: "Rischio margini",
    prompt: "Quali aziende stanno perdendo margine sulle commesse?",
    response: "Rossi Restauri e Verdi Edilizia hanno margine in calo. La causa principale e costo non allocato, SAL non fatturati e documenti mancanti.",
  },
];

export const accountantDeadlines: AccountantDeadline[] = [
  {
    id: "dead-1",
    companyId: "rossi-restauri",
    title: "Chiusura aprile con fatture passive",
    type: "fiscale",
    due: "oggi",
    owner: "Laura Studio",
    status: "in_corso",
  },
  {
    id: "dead-2",
    companyId: "verdi-edilizia",
    title: "Verifica reverse charge subappalto",
    type: "fiscale",
    due: "domani",
    owner: "Marco Studio",
    status: "da_fare",
  },
  {
    id: "dead-3",
    companyId: "edil-nova",
    title: "SAL Condominio Via Roma",
    type: "operativa",
    due: "27 mag",
    owner: "Giulia Neri",
    status: "da_fare",
  },
  {
    id: "dead-4",
    companyId: "bianchi-impianti",
    title: "Export prima nota aprile",
    type: "documentale",
    due: "questa settimana",
    owner: "Studio",
    status: "pronta",
  },
];

export const accountantReports: AccountantReport[] = [
  {
    id: "rep-1",
    companyId: "rossi-restauri",
    title: "Report consulenza mensile",
    period: "Aprile 2026",
    status: "bozza",
    highlights: ["Cassa -34.200,00 €", "Margine medio 14.8%", "9 documenti mancanti"],
  },
  {
    id: "rep-2",
    companyId: "edil-nova",
    title: "Report cantiere e finanza",
    period: "Aprile 2026",
    status: "pronto",
    highlights: ["Cassa positiva", "SAL da fatturare", "DURC richiesto"],
  },
  {
    id: "rep-3",
    companyId: "verdi-edilizia",
    title: "Report anomalie IVA",
    period: "Aprile 2026",
    status: "da_generare",
    highlights: ["IVA agevolata", "Reverse charge", "Export bloccato"],
  },
];

export const accountantDelegations: AccountantDelegation[] = [
  {
    id: "del-1",
    companyId: "rossi-restauri",
    title: "Mandato consulenza gestionale",
    status: "attiva",
    expiresAt: "31 dic 2026",
    scope: ["Documenti", "Controllo gestione", "Cantieri", "Export"],
  },
  {
    id: "del-2",
    companyId: "edil-nova",
    title: "Delega lettura finanza",
    status: "in_scadenza",
    expiresAt: "30 giu 2026",
    scope: ["Documenti", "Tesoreria", "Prima nota"],
  },
  {
    id: "del-3",
    companyId: "bianchi-impianti",
    title: "Consenso export contabile",
    status: "attiva",
    expiresAt: "31 dic 2026",
    scope: ["Documenti", "Export"],
  },
  {
    id: "del-4",
    companyId: "verdi-edilizia",
    title: "Mandato revisione IVA",
    status: "mancante",
    expiresAt: "Da firmare",
    scope: ["Fiscale", "Documenti", "Report"],
  },
];

export const accountantTeamMembers: AccountantTeamMember[] = [
  {
    id: "tm-1",
    name: "Laura Studio",
    role: "Responsabile contabile",
    clients: 2,
    openTasks: 8,
    focus: "Rossi Restauri",
  },
  {
    id: "tm-2",
    name: "Marco Studio",
    role: "Revisione fiscale",
    clients: 2,
    openTasks: 5,
    focus: "Verdi Edilizia",
  },
  {
    id: "tm-3",
    name: "Silvia Studio",
    role: "Documenti e richieste",
    clients: 4,
    openTasks: 11,
    focus: "Inbox documentale",
  },
];

export const accountantAuditEvents: AccountantAuditEvent[] = [
  {
    id: "aud-1",
    companyId: "rossi-restauri",
    actor: "Laura Studio",
    action: "ha aperto una richiesta documenti",
    target: "DDT Viale Monza",
    when: "oggi 10:18",
  },
  {
    id: "aud-2",
    companyId: "verdi-edilizia",
    actor: "Marco Studio",
    action: "ha bloccato l'export",
    target: "IVA agevolata da validare",
    when: "oggi 09:55",
  },
  {
    id: "aud-3",
    companyId: "edil-nova",
    actor: "Silvia Studio",
    action: "ha inviato una richiesta",
    target: "DURC aggiornato",
    when: "ieri 17:35",
  },
  {
    id: "aud-4",
    companyId: "bianchi-impianti",
    actor: "Sistema",
    action: "ha generato l'export",
    target: "Prima nota aprile",
    when: "ieri 18:20",
  },
];

export function getRiskLabel(risk: AccountantRisk) {
  if (risk === "critical") return "Critica";
  if (risk === "warning") return "Da seguire";
  return "OK";
}

export function getAccessModeLabel(accessMode: AccountantAccessMode) {
  if (accessMode === "operativo") return "Operativo";
  if (accessMode === "approvazione") return "Con approvazione";
  return "Sola lettura";
}
