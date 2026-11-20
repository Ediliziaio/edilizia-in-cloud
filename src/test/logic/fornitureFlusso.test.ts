import { describe, expect, it } from 'vitest';
import { quantitaFornitura, totalePagamentiFornitura } from '@/lib/orders/odaContabilita';
import { impegniAcquisti } from '@/lib/orders/impegniAcquisti';
import { proponiPrezziFattura, righeDocumentoFattura, righePrezzoDiQuestoDdt } from '@/lib/ddt/proponiPrezziFattura';

describe('Fornitura con due consegne e due fatture', () => {
  it('mostra 4 ricevuti e 6 residui, poi il completamento', () => {
    expect(quantitaFornitura([{ quantity: 10, quantity_received: 4, unit_of_measure: 'pz' }])).toMatchObject({ completa: false, unita: [{ ordinate: 10, ricevute: 4, residue: 6 }] });
    expect(quantitaFornitura([{ quantity: 10, quantity_received: 10, unit_of_measure: 'pz' }]).completa).toBe(true);
  });
  it('non somma metri e pezzi e non nasconde un residuo con un eccesso su un’altra riga', () => {
    const q = quantitaFornitura([{ quantity: 10, quantity_received: 12, unit_of_measure: 'pz' }, { quantity: 10, quantity_received: 8, unit_of_measure: 'pz' }, { quantity: 50, quantity_received: 40, unit_of_measure: 'm' }]);
    expect(q.unita).toEqual([{ um: 'pz', ordinate: 20, ricevute: 20, residue: 2 }, { um: 'm', ordinate: 50, ricevute: 40, residue: 10 }]);
    expect(q.completa).toBe(false);
  });
  it('somme complete, pagamenti parziali e storni: ogni costo conta una volta', () => {
    const a = { id: 'a', totale: 58.56, pagato: 20, residuo: 38.56, da_verificare: false };
    const b = { id: 'b', totale: 109.8, pagato: 0, residuo: 109.8, da_verificare: true };
    expect(totalePagamentiFornitura([a, b, a])).toEqual({ totale: 168.36, pagato: 20, residuo: 148.36, daVerificare: true });
  });
  it('una fattura condivisa pesa solo per la quota assegnata all’ordine', () => {
    expect(totalePagamentiFornitura([{ id: 'f', totale: 1220, pagato: 400, residuo: 820, da_verificare: false, quota: 0.25 }])).toMatchObject({ totale: 305, pagato: 100, residuo: 205 });
  });
});

describe('Costi registrati e impegni già nel margine', () => {
  const ordini = [{ id: 'o', subtotal: 100 }];
  it('l’ordine non fatturato è un impegno, un acconto lo distingue dal costo', () => {
    expect(impegniAcquisti(ordini, [], [], [])).toEqual({ registrato: 0, impegno: 100 });
    expect(impegniAcquisti(ordini, [{ id: 'c', purchase_order_id: 'o', amount: 48 }], [], [])).toEqual({ registrato: 48, impegno: 52 });
  });
  it('due fatture più alte dell’ordine sono costi, senza un impegno aggiunto', () => {
    expect(impegniAcquisti(ordini, [{ id: 'c', purchase_order_id: 'o', amount: 48 }, { id: 'd', purchase_order_id: 'o', amount: 90 }], [], [])).toEqual({ registrato: 138, impegno: 0 });
  });
  it('una nota di credito non riapre un impegno già fatturato', () => {
    expect(impegniAcquisti(ordini, [{ id: 'c', purchase_order_id: 'o', amount: 80 }], [], [{ company_cost_id: 'c', imponibile_totale: 20 }])).toEqual({ registrato: 80, impegno: 0 });
  });
  it('le quote contano quando la fattura è contabilizzata e ha il suo costo', () => {
    const quota = { purchase_order_id: 'o', importo: 60, fattura: { stato: 'contabilizzata', company_cost_id: 'c' } };
    expect(impegniAcquisti(ordini, [], [quota], [])).toEqual({ registrato: 60, impegno: 40 });
    expect(impegniAcquisti(ordini, [], [{ ...quota, fattura: { ...quota.fattura, stato: 'letta' } }], [])).toEqual({ registrato: 0, impegno: 100 });
  });
});

describe('Proposte quantità e prezzi dalla fattura', () => {
  const bolla = { id: 'b', descrizione: 'Lastra cartongesso', quantita: 6, unita_misura: 'pz' };
  const righe = (over = {}) => righeDocumentoFattura({ righe: [{ descrizione: 'Lastra cartongesso', quantita: 6, prezzo_unitario: 20, imponibile: 90, unita_misura: 'pezzi', ...over }] });
  it('propone il prezzo netto dopo sconti e la quantità del lotto', () => {
    expect(proponiPrezziFattura([bolla], righe())).toEqual({ b: { q: '6', prezzo: '15' } });
  });
  it('una fattura parziale propone solo la quantità fatturata; zero è un prezzo valido', () => {
    expect(proponiPrezziFattura([bolla], righe({ quantita: 2, imponibile: 0, prezzo_unitario: 0 }))).toEqual({ b: { q: '2', prezzo: '0' } });
  });
  it('non propone conversioni di unità o righe senza UM, quantità e prezzo', () => {
    const assenti: Record<string, unknown>[] = [{ unita_misura: 'mq' }, { unita_misura: null }, { quantita: 0 }, { prezzo_unitario: null, imponibile: null }];
    for (const over of assenti) expect(proponiPrezziFattura([bolla], righe(over))).toEqual({});
  });
  it('non sceglie fra descrizioni identiche con prezzi diversi né fra posizioni indistinguibili', () => {
    const f = righe();
    expect(proponiPrezziFattura([bolla], [...f, { ...f[0], id: '2', prezzo: 99 }])).toEqual({});
    expect(proponiPrezziFattura([bolla, { ...bolla, id: 'altra' }], f)).toEqual({});
  });
  it('codici diversi prevalgono su descrizioni uguali', () => {
    expect(proponiPrezziFattura([{ ...bolla, codice_articolo: 'A' }], righe({ codice_articolo: 'B' }))).toEqual({});
  });
  it('la stessa merce consegnata su due DDT usa il prezzo della riga che cita ciascuna bolla', () => {
    const f = [...righe({ numero_linea: 5 }), ...righe({ numero_linea: 7, imponibile: 120 }), ...righe({ numero_linea: 9 })];
    const legami = { '5': ['d1'], '7': ['d2'] };
    expect(proponiPrezziFattura([bolla], righePrezzoDiQuestoDdt(f, 'd1', legami, true))).toEqual({ b: { q: '6', prezzo: '15' } });
    expect(proponiPrezziFattura([bolla], righePrezzoDiQuestoDdt(f, 'd2', legami, true))).toEqual({ b: { q: '6', prezzo: '20' } });
    expect(righePrezzoDiQuestoDdt(f, 'd3', legami, true)).toEqual([]);
  });
  it('legge il corpo XML selezionato e conserva l’unità originale', () => {
    const body = (n: number, prezzo: number) => `<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><Numero>${n}</Numero><Data>2026-11-19</Data></DatiGeneraliDocumento></DatiGenerali><DatiBeniServizi><DettaglioLinee><Descrizione>Lastra cartongesso</Descrizione><Quantita>6</Quantita><UnitaMisura>pz</UnitaMisura><PrezzoUnitario>${prezzo}</PrezzoUnitario><PrezzoTotale>${6 * prezzo}</PrezzoTotale></DettaglioLinee></DatiBeniServizi></FatturaElettronicaBody>`;
    const xml = `<FatturaElettronica><FatturaElettronicaHeader><CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdCodice>01234567890</IdCodice></IdFiscaleIVA></DatiAnagrafici></CedentePrestatore><CessionarioCommittente /></FatturaElettronicaHeader>${body(1, 10)}${body(2, 15)}</FatturaElettronica>`;
    const f = righeDocumentoFattura({ xml_raw: xml, indice_corpo: 1, righe: [] });
    expect(proponiPrezziFattura([bolla], f)).toEqual({ b: { q: '6', prezzo: '15' } });
  });
});
