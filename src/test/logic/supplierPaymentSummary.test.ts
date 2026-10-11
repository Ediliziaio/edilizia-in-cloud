import { describe, expect, it } from 'vitest';
import { supplierInvoiceCostIds, supplierPaymentSummary, type SupplierInvoice, type SupplierPurchaseCost } from '@/lib/orders/supplierPaymentSummary';

const invoice: SupplierInvoice = { id: 'f1', purchase_order_id: 'po1', company_cost_id: 'c1',
  prima_nota_id: null, cedente_ragione_sociale: 'Fornitore reale', cedente_piva: '123',
  numero_fattura: '1', totale_documento: 122, tipo_documento: 'TD01', stato: 'contabilizzata' };
const po = { id: 'po1', supplier_id: 's1', oda_number: 'ODA1', status: 'ricevuto', total: 122 };
const entry = { id: 'p1', cost_id: 'c1', supplier_id: 's1', scadenza_id: 'd1', amount: 61, direction: 'uscita' };
const due = { id: 'd1', cost_id: 'c1', supplier_id: 's1', amount: 122, paid_amount: 61, due_date: '2025-10-01', status: 'parziale' };
const base: Parameters<typeof supplierPaymentSummary>[0] = { orders: [po], invoices: [invoice], entries: [entry], dues: [due], items: [], names: { s1: 'Fornitore reale' } };

describe('Pagamenti fornitori da documenti e cassa', () => {
  it('mostra il fornitore dell’OdA anche senza articoli preventivati', () => {
    expect(supplierPaymentSummary(base)[0]).toMatchObject({ name: 'Fornitore reale', ordered: 122, invoiced: 122, paid: 61, unpaid: 61, nextDeadline: '2025-10-01' });
  });
  it('non somma la stessa cassa in prima nota e scadenza', () => {
    expect(supplierPaymentSummary({ ...base, entries: [entry, entry], dues: [due, due] })[0].paid).toBe(61);
  });
  it('contabilizzata non significa pagata e non deduce pagamenti dagli articoli', () => {
    expect(supplierPaymentSummary({ ...base, entries: [], dues: [], items: [{ supplier_id: 's1', purchase_price: 100, quantity: 1, is_paid: true } as never] })[0])
      .toMatchObject({ paid: 0, unpaid: 122, estimated: 100 });
  });
  it('un OdA non fatturato è ordinato, non da pagare', () => {
    expect(supplierPaymentSummary({ ...base, invoices: [] })[0]).toMatchObject({ ordered: 122, invoiced: 0, unpaid: 0 });
  });
  it('zero quantità resta zero', () => {
    expect(supplierPaymentSummary({ ...base, invoices: [], items: [{ supplier_id: 's1', purchase_price: 100, quantity: 0 }] })[0].estimated).toBe(0);
  });
  it('più fatture su uno stesso costo consumano il pagamento una volta', () => {
    const group = supplierPaymentSummary({ ...base, invoices: [invoice, { ...invoice, id: 'f2', totale_documento: 122 }], entries: [{ ...entry, amount: 200 }], dues: [] })[0];
    expect(group).toMatchObject({ invoiced: 244, paid: 200, unpaid: 44 });
  });
  it('fatture senza OdA ma con costo/PN mostrano il subappaltatore effettivo', () => {
    expect(supplierPaymentSummary({ ...base, orders: [], invoices: [{ ...invoice, purchase_order_id: null }] })[0])
      .toMatchObject({ name: 'Fornitore reale', paid: 61, unpaid: 61 });
  });
  it('non attribuisce tutta la cassa di un costo condiviso con altre commesse', () => {
    expect(supplierPaymentSummary({ ...base, ambiguousCostIds: ['c1'] })[0])
      .toMatchObject({ invoiced: 0, paid: 0, review: 122, reviewCount: 1 });
  });
  it('note di credito richiedono verifica invece di un pagamento inventato', () => {
    expect(supplierPaymentSummary({ ...base, invoices: [invoice, { ...invoice, id: 'credit', tipo_documento: 'TD04', totale_documento: -20 }] })[0])
      .toMatchObject({ invoiced: 0, paid: 0, reviewCount: 2 });
  });
  it('pagamenti in eccesso sono evidenziati e il residuo non diventa negativo', () => {
    expect(supplierPaymentSummary({ ...base, entries: [{ ...entry, amount: 130 }], dues: [] })[0])
      .toMatchObject({ paid: 122, unpaid: 0, review: 8, reviewCount: 1 });
  });
  it('esclude OdA annullati e fatture scartate', () => {
    expect(supplierPaymentSummary({ ...base, orders: [{ ...po, status: 'annullato' }], invoices: [{ ...invoice, stato: 'scartata' }] })[0])
      .toMatchObject({ ordered: 0, invoiced: 0, paid: 0 });
  });
  it('usa solo paid_amount, non lo stato pagata per inventare un importo', () => {
    expect(supplierPaymentSummary({ ...base, entries: [], dues: [{ ...due, status: 'pagata', paid_amount: 0 }] })[0].paid).toBe(0);
  });
  it('supporta prima nota collegata direttamente senza cost_id', () => {
    expect(supplierPaymentSummary({ ...base, invoices: [{ ...invoice, company_cost_id: null, prima_nota_id: 'p1' }],
      entries: [{ ...entry, cost_id: null }], dues: [] })[0].paid).toBe(61);
  });
  it('la stessa PN agganciata a due fatture indipendenti resta ambigua su entrambe', () => {
    const invoices: SupplierInvoice[] = [{ ...invoice, id: 'a', company_cost_id: null, prima_nota_id: 'p1' },
      { ...invoice, id: 'b', company_cost_id: null, prima_nota_id: 'p1' }];
    const result = supplierPaymentSummary({ ...base, invoices, dues: [] })[0];
    expect(result).toMatchObject({ paid: 0, invoiced: 0, reviewCount: 2 });
    expect(supplierPaymentSummary({ ...base, invoices: [...invoices].reverse(), dues: [] })[0]).toEqual(result);
  });
});

describe('Una fattura fornitore con acconto e saldo su costi separati', () => {
  const costs: SupplierPurchaseCost[] = [
    { id: 'c1', purchase_order_id: 'po1', supplier_id: 's1', order_id: 'job', allocations: [], amount: 60, vat_rate: 22 },
    { id: 'saldo', purchase_order_id: 'po1', supplier_id: 's1', order_id: 'job', allocations: [], amount: 40, vat_rate: 22 },
  ];
  const input = { ...base, orderId: 'job', purchaseCosts: costs,
    entries: [{ ...entry, amount: 73.2 }], dues: [
      { ...due, amount: 73.2, paid_amount: 73.2, status: 'pagata' },
      { ...due, id: 'saldo-due', cost_id: 'saldo', amount: 48.8, paid_amount: 0, status: 'da_pagare', due_date: '2026-10-10' },
    ],
  };
  it('mostra la scadenza del saldo senza sommare due volte l’acconto', () => {
    expect(supplierPaymentSummary(input)[0]).toMatchObject({ invoiced: 122, paid: 73.2, unpaid: 48.8, nextDeadline: '2026-10-10' });
  });
  it('quando il saldo viene registrato, conta entrambi i pagamenti una sola volta', () => {
    expect(supplierPaymentSummary({ ...input, entries: [...input.entries, { ...entry, id: 'saldo-pn', cost_id: 'saldo', amount: 48.8 }],
      dues: input.dues.map(d => ({ ...d, paid_amount: d.amount, status: 'pagata' })) })[0])
      .toMatchObject({ paid: 122, unpaid: 0, nextDeadline: null, review: 0 });
  });
  it.each([20030, 24390, 17760])('verifica acconto/saldo nei tre scenari demo (%s netti)', net => {
    const amount = (n: number) => Math.round(n * 122) / 100;
    const purchaseCosts = costs.map((c, i) => ({ ...c, amount: Math.round(net * (i ? .4 : .6) * 100) / 100 }));
    const acconto = amount(purchaseCosts[0].amount), saldo = amount(purchaseCosts[1].amount), total = acconto + saldo;
    expect(supplierPaymentSummary({ ...input, purchaseCosts, orders: [{ ...po, total }], invoices: [{ ...invoice, totale_documento: total }],
      entries: [{ ...entry, amount: acconto }], dues: input.dues.map((d, i) => ({ ...d, amount: i ? saldo : acconto, paid_amount: i ? 0 : acconto })) })[0])
      .toMatchObject({ paid: acconto, unpaid: saldo, nextDeadline: '2026-10-10' });
  });
  it('non amplia costi con prezzo/IVA mancanti, fornitore diverso o importi incoerenti', () => {
    const patches: Partial<SupplierPurchaseCost>[] = [{ amount: 41 }, { amount: null }, { vat_rate: null }, { supplier_id: 'different' }, { amount: -40 }];
    for (const patch of patches) {
      const purchaseCosts = [costs[0], { ...costs[1], ...patch }];
      expect(supplierInvoiceCostIds({ orders: [po], invoices: [invoice], costs: purchaseCosts, orderId: 'job' }).size).toBe(0);
    }
  });
  it('non attribuisce il saldo di un altro cantiere o un costo ripartito al 50%', () => {
    const patches: Partial<SupplierPurchaseCost>[] = [{ order_id: 'other-job' }, { order_id: null, allocations: [{ order_id: 'job', pct: 50 }] },
      { allocations: [{ order_id: 'job', pct: 50 }, { order_id: 'other-job', pct: 50 }] }];
    for (const patch of patches) {
      expect(supplierInvoiceCostIds({ orders: [po], invoices: [invoice], costs: [costs[0], { ...costs[1], ...patch }], orderId: 'job' }).size).toBe(0);
    }
    expect(supplierInvoiceCostIds({ orders: [po], invoices: [invoice], costs: costs.map<SupplierPurchaseCost>(c => ({ ...c, order_id: null, allocations: [{ order_id: 'job', pct: 100 }] })), orderId: 'job' }).size).toBe(1);
  });
  it('rifiuta più fatture sullo stesso OdA, note di credito e costi condivisi con altre fatture', () => {
    for (const extra of [{ ...invoice, id: 'other' }, { ...invoice, id: 'credit', company_cost_id: null, tipo_documento: 'TD04', totale_documento: -10 }]) {
      expect(supplierInvoiceCostIds({ orders: [po], invoices: [invoice, extra], costs, orderId: 'job' }).size).toBe(0);
    }
    expect(supplierInvoiceCostIds({ orders: [po], invoices: [invoice], costs, orderId: 'job', ambiguousCostIds: ['saldo'] }).size).toBe(0);
    expect(supplierInvoiceCostIds({ orders: [po], invoices: [invoice], costs }).size).toBe(0);
  });
});
