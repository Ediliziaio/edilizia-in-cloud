import { describe, expect, it } from 'vitest';
import { issuedPurchaseOrderNumber } from '@/lib/orders/materialProcurement';

describe('materiali delle fasi: impegni realmente emessi', () => {
  it.each(['bozza', 'annullato', 'unknown'])('%s non fa apparire il materiale già ordinato', status => {
    expect(issuedPurchaseOrderNumber({ status, oda_number: 'ODA-TEST' })).toBeNull();
  });
  it.each(['inviato', 'confermato', 'parziale', 'ricevuto'])('%s è una copertura emessa', status => {
    expect(issuedPurchaseOrderNumber({ status, oda_number: 'ODA-TEST' })).toBe('ODA-TEST');
  });
  it('gestisce una relazione assente', () => {
    expect(issuedPurchaseOrderNumber(null)).toBeNull();
    expect(issuedPurchaseOrderNumber(undefined)).toBeNull();
  });
});
