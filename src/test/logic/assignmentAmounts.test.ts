import { describe, expect, it } from 'vitest';
import { formatAssignmentAmount, parseAssignmentAmount } from '@/lib/orders/assignmentAmounts';
describe('importi e quantità di assegnazione, senza parseFloat parziali', () => {
  it.each([['',0],['0',0],['12,',12],['12,50',12.5],['1.234,56',1234.56],['1.500',1500],['1234.56',1234.56],['€ 1.234,50',1234.5],['1 234,50',1234.5]])('legge %s', (raw, expected) => expect(parseAssignmentAmount(String(raw))).toBe(expected));
  it.each(['10abc','-1','1e10','NaN','Infinity','1,2,3','1.23,45','1.2.3','12,345','99999999999999'])('rifiuta %s', raw => expect(parseAssignmentAmount(raw)).toBeNull());
  it('gestisce quantità decimali e non trasforma 0.500 in 500', () => {
    expect(parseAssignmentAmount('1,5',6)).toBe(1.5); expect(parseAssignmentAmount('0.500',6)).toBe(.5);
    expect(parseAssignmentAmount('1,234567',6)).toBe(1.234567);
    for(const raw of ['1.50','1.500','1.5000']) expect(parseAssignmentAmount(raw,6)).toBe(1.5);
  });
  it('formatta solo dopo la digitazione e mantiene il valore interpretato', () => {
    expect(formatAssignmentAmount('1500')).toBe('1.500,00'); expect(formatAssignmentAmount('')).toBe('');
    expect(formatAssignmentAmount('invalido')).toBe('invalido');
    for (const value of ['0','1,5','1.234,56','9999999999.99']) expect(parseAssignmentAmount(formatAssignmentAmount(value))).toBe(parseAssignmentAmount(value));
  });
});
