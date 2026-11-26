import { recurrenceMultiplier } from "@/lib/forecastTypes";
import { mesiApertura } from "@/lib/controlloGestione/tempoCommessa";
import { costoMensileVero, type ParametriCostoAzienda } from "@/lib/costoPersonale";

export interface StructureFixedCost {
  amount: number | null;
  recurrence: string | null;
  allocations?: unknown;
  /** Parte rimasta in magazzino: non è spesa generale, diventa costo all'uscita della merce. */
  quota_magazzino?: number | string | null;
  /** Categoria scritta nella pagina Costi: decide il secchio (`destinazioneCosto`). */
  category?: string | null;
  cost_type?: string | null;
  /** Costo nato da un ordine d'acquisto: è già nel costo acquisti della commessa. */
  purchase_order_id?: string | null;
}

/** I tre secchi in cui può finire un costo d'azienda. */
export type DestinazioneCosto = "cantiere" | "gia_contato" | "struttura";

const radice = (valore: string | null | undefined) =>
  (valore ?? "").toLocaleLowerCase("it-IT").normalize("NFD").replace(/[^a-z]/g, "");

/** Categorie che appartengono sempre a un cantiere: senza commessa sono da attribuire, mai spese generali. */
const RADICI_CANTIERE = ["subappalt", "merc", "ditt"];
/** Categorie già dentro il costo del personale (lordo × aliquote) o nel costo acquisti. */
const RADICI_GIA_CONTATE = ["stipend", "salari", "inps", "inail", "tfr", "contribut", "cedolin", "irpef"];
/** «F24» perde le cifre nella radice e resta "f": confronto esatto, o prenderebbe «ferramenta». */
const RADICE_F24 = "f";

/**
 * Dove va un costo che non ha una commessa. Mandarli tutti in struttura è
 * sbagliato in due modi opposti: un subappalto senza commessa non è una spesa
 * generale (va attribuito, o inquina il margine di tutti gli altri cantieri),
 * e i contributi sono già dentro il costo del personale calcolato da lordo e
 * aliquote — contarli di nuovo vuol dire pagare l'INPS due volte.
 */
export function destinazioneCosto(costo: Pick<StructureFixedCost, "category" | "purchase_order_id">): DestinazioneCosto {
  if (costo.purchase_order_id) return "gia_contato";
  const categoria = radice(costo.category);
  if (!categoria) return "struttura";
  if (RADICI_CANTIERE.some((r) => categoria.startsWith(r))) return "cantiere";
  if (categoria === RADICE_F24 || RADICI_GIA_CONTATE.some((r) => categoria.startsWith(r))) return "gia_contato";
  return "struttura";
}

/**
 * La parte di un costo che resta alla struttura: quella non ripartita sulle commesse.
 * La quota ripartita (company_costs.allocations) è già nel margine delle commesse.
 *
 * La quota rimasta in magazzino (company_costs.quota_magazzino) non è né dell'una né
 * dell'altra: è valore fermo in giacenza, e diventa costo della commessa che userà
 * quella merce, quando lo scarico ne porterà il costo medio. Contarla qui vorrebbe
 * dire pagarla due volte, una come spesa generale e una all'uscita dal magazzino.
 */
export function quotaNonRipartita(
  amount: number | string | null | undefined,
  allocations: unknown,
  quotaMagazzino?: number | string | null,
): number {
  const importo = Number(amount ?? 0);
  if (!Number.isFinite(importo)) return 0;
  const magazzino = Number(quotaMagazzino ?? 0);
  const inGiacenza = Number.isFinite(magazzino) && magazzino > 0 ? magazzino : 0;
  if (!Array.isArray(allocations)) return Math.max(0, importo - inGiacenza);
  const ripartito = allocations.reduce((somma: number, a) => {
    const pct = Number((a as { pct?: unknown } | null)?.pct);
    return somma + (Number.isFinite(pct) && pct > 0 ? pct : 0);
  }, 0);
  const nonRipartita = importo * Math.max(0, 100 - Math.min(ripartito, 100)) / 100;
  return Math.max(0, nonRipartita - inGiacenza);
}

export interface StructureEmployee {
  id: string;
  gross_salary: number | null;
  inps_rate: number | null;
  role_type?: string | null;
  area?: string | null;
  qualifica?: string | null;
  profilo_costo?: string | null;
}

export interface StructureOrder {
  status?: string | null;
  percentuale_avanzamento?: number | null;
  work_start_date?: string | null;
  work_end_date?: string | null;
  /** Stato di evasione della commessa: «completed» è una chiusura dichiarata. */
  fulfillment_status?: string | null;
  /** Fase della commessa (order_statuses): l'ultima operativa e quelle di supporto chiudono il cantiere. */
  current_status_id?: string | null;
}

/** Una fase del flusso dell'azienda, come la configura in Impostazioni. */
export interface StatoCommessa {
  id: string;
  position?: number | null;
  is_support_phase?: boolean | null;
}

/**
 * Le fasi che dicono «il cantiere non c'è più»: l'ultima fase operativa
 * («Lavori completati») e tutte quelle di supporto («Assistenza»), dove i
 * lavori sono finiti e resta il dopo-vendita. È la fonte più affidabile che
 * l'azienda abbia, perché la fase la sposta una persona.
 */
export function statiCheChiudono(stati: readonly StatoCommessa[]): Set<string> {
  const chiusi = new Set<string>();
  let ultima: StatoCommessa | null = null;
  for (const stato of stati) {
    if (stato.is_support_phase === true) { chiusi.add(stato.id); continue; }
    if (!ultima || finite(stato.position) > finite(ultima.position)) ultima = stato;
  }
  if (ultima) chiusi.add(ultima.id);
  return chiusi;
}

export interface CompanyStructureSnapshot {
  fixedCostsMonthly: number;
  officeSalariesMonthly: number;
  directLaborSalariesMonthly: number;
  monthlyStructure: number;
  activeOrders: number;
  monthlyPerActiveOrder: number | null;
  /** Costi che appartengono a un cantiere e non ce l'hanno: da attribuire, fuori dalla struttura. */
  daAttribuire: { righe: number; totale: number };
  /** Costi lasciati fuori perché già contati altrove (contributi, stipendi, ordini d'acquisto). */
  giaContati: { righe: number; totale: number };
}

export interface OrderStructureImpact {
  months: number | null;
  allocatedStructure: number | null;
  marginAfterStructure: number | null;
  marginAfterStructurePct: number | null;
}

const finite = (value: number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("it-IT").replaceAll("-", "_").replaceAll(" ", "_");
}

/** L'anagrafica vince; le assegnazioni storiche sono solo un fallback. */
export function isOperationalEmployee(employee: StructureEmployee, assignedToOrders: boolean): boolean {
  const role = normalized(employee.role_type);
  const area = normalized(employee.area);
  const qualification = normalized(employee.qualifica);
  if (role === "subappaltatore") return false;
  const officeRoles = ["staff_interno", "impiegato", "venditore", "commerciale", "amministrazione", "amministrativo"];
  if (officeRoles.includes(role) || ["ufficio", "amministrazione", "commerciale"].includes(area)) return false;
  if (["operaio", "employee", "capocantiere", "tecnico_cantiere"].includes(role) || area === "cantiere") return true;
  if (["operaio", "muratore", "installatore", "posatore", "elettricista", "idraulico"].some((token) => qualification.includes(token))) return true;
  return assignedToOrders;
}

/**
 * Oltre questi giorni dalla fine lavori il cantiere è chiuso comunque: un
 * avanzamento fermo a metà da mesi vuol dire che nessuno lo aggiorna più, non
 * che il cantiere è ancora aperto. Sotto questa soglia resta aperto, perché un
 * ritardo vero deve continuare a consumare struttura: è il costo del ritardo.
 */
export const GIORNI_OLTRE_FINE = 90;

const giorniTra = (da: string, a: string): number | null => {
  const x = Date.parse(da), y = Date.parse(a);
  return Number.isFinite(x) && Number.isFinite(y) ? (y - x) / 86_400_000 : null;
};

/**
 * Un cantiere è chiuso — e smette di consumare struttura — quando lo dice uno
 * qualunque di questi segnali. Prima contava solo l'avanzamento: una commessa
 * ferma all'86% con i lavori finiti da un anno risultava aperta per sempre,
 * assorbiva mesi di struttura che non le spettavano e gonfiava il numero dei
 * cantieri attivi, diluendo la quota di tutti gli altri.
 */
export function cantiereChiuso(order: StructureOrder, today: string, statiChiusi?: ReadonlySet<string>): boolean {
  if (order.current_status_id && statiChiusi?.has(order.current_status_id)) return true;
  const progress = Math.min(100, Math.max(0, finite(order.percentuale_avanzamento)));
  if (progress >= 100) return true;
  if (normalized(order.fulfillment_status) === "completed") return true;
  if (order.work_end_date) {
    if (progress <= 0 && order.work_end_date <= today) return true;
    const giorni = giorniTra(order.work_end_date, today);
    if (giorni != null && giorni > GIORNI_OLTRE_FINE) return true;
  }
  return false;
}

/**
 * Un cantiere assorbe struttura quando risulta avviato e non ancora concluso.
 * La chiusura la decide `cantiereChiuso`; qui resta solo l'avvio.
 */
export function isOrderActiveForStructure(order: StructureOrder, today: string, statiChiusi?: ReadonlySet<string>): boolean {
  if (cantiereChiuso(order, today, statiChiusi)) return false;
  const progress = Math.min(100, Math.max(0, finite(order.percentuale_avanzamento)));
  if (progress > 0) return true;

  const status = normalized(order.status);
  if (["in_corso", "in_lavorazione", "avviato", "attivo"].includes(status)) return true;

  if (!order.work_start_date || order.work_start_date > today) return false;
  return !order.work_end_date || order.work_end_date >= today;
}

/** Formula unica della struttura mensile, separata dai costi diretti. */
export function calculateCompanyStructureSnapshot(input: {
  fixedCosts: StructureFixedCost[];
  employees: StructureEmployee[];
  operationalEmployeeIds: Iterable<string>;
  orders: StructureOrder[];
  /** Le fasi che chiudono il cantiere (`statiCheChiudono`); senza, decidono avanzamento e date. */
  statiChiusi?: ReadonlySet<string>;
  today: string;
  /** Costo del personale per tipo di dipendente (vuoto = valori edili). */
  parametri?: ParametriCostoAzienda | null;
}): CompanyStructureSnapshot {
  const operationalIds = new Set(input.operationalEmployeeIds);
  const daAttribuire = { righe: 0, totale: 0 };
  const giaContati = { righe: 0, totale: 0 };
  let fixedCostsMonthly = 0;
  for (const cost of input.fixedCosts) {
    const destinazione = destinazioneCosto(cost);
    if (destinazione === "cantiere") {
      daAttribuire.righe += 1;
      daAttribuire.totale += finite(cost.amount);
      continue;
    }
    if (destinazione === "gia_contato") {
      giaContati.righe += 1;
      giaContati.totale += finite(cost.amount);
      continue;
    }
    // Solo i costi fissi entrano nella quota mensile: un costo variabile una tantum
    // non è una spesa ricorrente di struttura.
    if (cost.cost_type != null && cost.cost_type !== "fixed") continue;
    fixedCostsMonthly += quotaNonRipartita(finite(cost.amount), cost.allocations, cost.quota_magazzino)
      * recurrenceMultiplier(cost.recurrence ?? "monthly");
  }

  let officeSalariesMonthly = 0;
  let directLaborSalariesMonthly = 0;
  for (const employee of input.employees) {
    const salaryWithContributions = costoMensileVero(employee, input.parametri);
    if (isOperationalEmployee(employee, operationalIds.has(employee.id))) directLaborSalariesMonthly += salaryWithContributions;
    else officeSalariesMonthly += salaryWithContributions;
  }

  const monthlyStructure = fixedCostsMonthly + officeSalariesMonthly;
  const activeOrders = input.orders.filter((order) => isOrderActiveForStructure(order, input.today, input.statiChiusi)).length;

  return {
    fixedCostsMonthly,
    officeSalariesMonthly,
    directLaborSalariesMonthly,
    monthlyStructure,
    activeOrders,
    monthlyPerActiveOrder: monthlyStructure > 0 && activeOrders > 0
      ? monthlyStructure / activeOrders
      : null,
    daAttribuire,
    giaContati,
  };
}

/**
 * Incidenza stimata della struttura sulla singola commessa. Non modifica il
 * consuntivo: serve a leggere quanto margine diretto resta dopo il tempo.
 */
export function calculateOrderStructureImpact(input: {
  directMargin: number;
  revenue: number;
  monthlyPerActiveOrder: number | null;
  workStartDate: string | null;
  workEndDate: string | null;
  progressPercent: number | null;
  fulfillmentStatus?: string | null;
  currentStatusId?: string | null;
  statiChiusi?: ReadonlySet<string>;
  today: string;
}): OrderStructureImpact {
  if (!input.monthlyPerActiveOrder || input.monthlyPerActiveOrder <= 0) {
    return { months: null, allocatedStructure: null, marginAfterStructure: null, marginAfterStructurePct: null };
  }

  // Stessa regola del conteggio dei cantieri attivi: i mesi di un cantiere chiuso
  // si fermano alla fine lavori, non corrono fino a oggi.
  const completed = cantiereChiuso({
    percentuale_avanzamento: input.progressPercent,
    work_end_date: input.workEndDate,
    fulfillment_status: input.fulfillmentStatus,
    current_status_id: input.currentStatusId,
  }, input.today, input.statiChiusi);
  const months = mesiApertura(
    input.workStartDate,
    completed ? input.workEndDate : null,
    input.today,
  );
  if (months === null) {
    return { months: null, allocatedStructure: null, marginAfterStructure: null, marginAfterStructurePct: null };
  }

  const allocatedStructure = Math.max(0, months) * input.monthlyPerActiveOrder;
  const marginAfterStructure = finite(input.directMargin) - allocatedStructure;
  const marginAfterStructurePct = input.revenue > 0
    ? (marginAfterStructure / input.revenue) * 100
    : null;

  return { months, allocatedStructure, marginAfterStructure, marginAfterStructurePct };
}
