/**
 * La lista della spesa del magazzino (voci scritte a mano) e la sua tabella,
 * `acquisti_a_mano`. Prima stava in localStorage: qui le conversioni tra la
 * forma del modulo e la riga del database, e il confronto che decide cosa
 * scrivere quando la lista cambia. Niente React, niente rete: si prova da solo.
 *
 * Una voce ordinata diventa un costo con le sue rate nel database (migrazione
 * 20281029315000): qui non si tocca, il collegamento `company_cost_id` lo
 * scrive il trigger.
 */

export type StatoAcquisto = "da_ordinare" | "ordinato" | "in_arrivo" | "in_magazzino";

/** La voce come la usa il modulo della vista Acquisti (date vuote = ""). */
export type ManualPurchaseItem = {
  id: string;
  name: string;
  quantity: number;
  unitCost: number;
  vatRate: number;
  supplierId: string | null;
  paymentMethod: string | null;
  paymentTerm: string | null;
  expectedPaymentDate: string;
  paid: boolean;
  paidDate: string;
  depositPaid: boolean;
  depositExpectedDate: string;
  balancePaid: boolean;
  balanceExpectedDate: string;
  status: StatoAcquisto;
  warehouseId: string | null;
  orderDate: string;
  arrivalDate: string;
  priority: "alta" | "media" | "bassa";
  dueDate: string;
  notes: string;
  completed: boolean;
};

/** La riga di `acquisti_a_mano`. */
export interface RigaAcquistoAMano {
  id: string;
  company_id: string;
  nome: string;
  quantita: number;
  costo_unitario: number;
  aliquota_iva: number;
  supplier_id: string | null;
  warehouse_id: string | null;
  metodo_pagamento: string | null;
  termine_pagamento: string | null;
  pagamento_previsto_il: string | null;
  pagato: boolean;
  pagato_il: string | null;
  acconto_pagato: boolean;
  acconto_previsto_il: string | null;
  saldo_pagato: boolean;
  saldo_previsto_il: string | null;
  stato: StatoAcquisto;
  ordinato_il: string | null;
  arrivo_il: string | null;
  priorita: "alta" | "media" | "bassa";
  entro_il: string | null;
  note: string;
  completato: boolean;
}

const STATI: StatoAcquisto[] = ["da_ordinare", "ordinato", "in_arrivo", "in_magazzino"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const data = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const num = (v: unknown, minimo: number, predefinito: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= minimo ? n : predefinito;
};

export function daRiga(r: RigaAcquistoAMano): ManualPurchaseItem {
  return {
    id: r.id,
    name: r.nome,
    quantity: Number(r.quantita),
    unitCost: Number(r.costo_unitario),
    vatRate: Number(r.aliquota_iva),
    supplierId: r.supplier_id,
    paymentMethod: r.metodo_pagamento,
    paymentTerm: r.termine_pagamento,
    expectedPaymentDate: r.pagamento_previsto_il ?? "",
    paid: r.pagato,
    paidDate: r.pagato_il ?? "",
    depositPaid: r.acconto_pagato,
    depositExpectedDate: r.acconto_previsto_il ?? "",
    balancePaid: r.saldo_pagato,
    balanceExpectedDate: r.saldo_previsto_il ?? "",
    status: r.stato,
    warehouseId: r.warehouse_id,
    orderDate: r.ordinato_il ?? "",
    arrivalDate: r.arrivo_il ?? "",
    priority: r.priorita,
    dueDate: r.entro_il ?? "",
    notes: r.note ?? "",
    completed: r.completato,
  };
}

/** La riga da scrivere. Le date vuote diventano NULL, i numeri strani i valori di base. */
export function aRiga(v: ManualPurchaseItem, companyId: string): RigaAcquistoAMano {
  return {
    id: v.id,
    company_id: companyId,
    nome: v.name.trim(),
    quantita: num(v.quantity, Number.MIN_VALUE, 1),
    costo_unitario: num(v.unitCost, 0, 0),
    aliquota_iva: num(v.vatRate, 0, 22),
    supplier_id: v.supplierId,
    warehouse_id: v.warehouseId,
    metodo_pagamento: v.paymentMethod,
    termine_pagamento: v.paymentTerm,
    pagamento_previsto_il: data(v.expectedPaymentDate),
    pagato: !!v.paid,
    pagato_il: data(v.paidDate),
    acconto_pagato: !!v.depositPaid,
    acconto_previsto_il: data(v.depositExpectedDate),
    saldo_pagato: !!v.balancePaid,
    saldo_previsto_il: data(v.balanceExpectedDate),
    stato: STATI.includes(v.status) ? v.status : "da_ordinare",
    ordinato_il: data(v.orderDate),
    arrivo_il: data(v.arrivalDate),
    priorita: v.priority === "alta" || v.priority === "bassa" ? v.priority : "media",
    entro_il: data(v.dueDate),
    note: v.notes ?? "",
    completato: !!v.completed,
  };
}

/** Cosa scrivere sul database per passare da `prima` a `dopo`. */
export function differenze(prima: ManualPurchaseItem[], dopo: ManualPurchaseItem[]) {
  const vecchie = new Map(prima.map((v) => [v.id, v]));
  const nuove = new Map(dopo.map((v) => [v.id, v]));
  const aggiunte = dopo.filter((v) => !vecchie.has(v.id));
  const tolte = prima.filter((v) => !nuove.has(v.id)).map((v) => v.id);
  const cambiate = dopo.filter((v) => {
    const vecchia = vecchie.get(v.id);
    return vecchia !== undefined && JSON.stringify(vecchia) !== JSON.stringify(v);
  });
  return { aggiunte, cambiate, tolte };
}

/**
 * Le voci salvate nel browser dalla vecchia lista, pronte per la tabella.
 * Un id che non è un uuid (le voci più vecchie: `manual-…`) ne riceve uno nuovo.
 */
export function vociDalBrowser(grezzo: string | null, nuovoId: () => string): ManualPurchaseItem[] {
  if (!grezzo) return [];
  let lette: unknown;
  try {
    lette = JSON.parse(grezzo);
  } catch {
    return [];
  }
  if (!Array.isArray(lette)) return [];
  return lette
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && typeof (v as { name?: unknown }).name === "string" && !!(v as { name: string }).name.trim())
    .map((v) => {
      const testo = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
      const stato = STATI.includes(v.status as StatoAcquisto)
        ? (v.status as StatoAcquisto)
        : v.completed ? "in_magazzino" : "da_ordinare";
      return {
        id: typeof v.id === "string" && UUID.test(v.id) ? v.id : nuovoId(),
        name: testo("name").trim(),
        quantity: num(v.quantity, Number.MIN_VALUE, 1),
        unitCost: num(v.unitCost, 0, 0),
        vatRate: [0, 4, 5, 10, 22].includes(Number(v.vatRate)) ? Number(v.vatRate) : 22,
        supplierId: typeof v.supplierId === "string" ? v.supplierId : null,
        paymentMethod: typeof v.paymentMethod === "string" ? v.paymentMethod : null,
        paymentTerm: typeof v.paymentTerm === "string" ? v.paymentTerm : "consegna",
        expectedPaymentDate: testo("expectedPaymentDate"),
        paid: !!v.paid,
        paidDate: testo("paidDate"),
        depositPaid: !!v.depositPaid,
        depositExpectedDate: testo("depositExpectedDate"),
        balancePaid: !!v.balancePaid,
        balanceExpectedDate: testo("balanceExpectedDate"),
        status: stato,
        warehouseId: typeof v.warehouseId === "string" ? v.warehouseId : null,
        orderDate: testo("orderDate"),
        arrivalDate: testo("arrivalDate"),
        priority: v.priority === "alta" || v.priority === "bassa" ? v.priority : "media",
        dueDate: testo("dueDate"),
        notes: testo("notes"),
        completed: !!v.completed,
      };
    });
}
