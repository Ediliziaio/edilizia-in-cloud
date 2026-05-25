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
