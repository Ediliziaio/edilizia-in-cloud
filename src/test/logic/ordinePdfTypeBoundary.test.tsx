import { isValidElement } from 'react';
import { Document } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';
import { createOrdinePDFDocument, OrdinePDF } from '@/components/orders/OrdinePDF';

function content(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(content).join(' ');
  if (isValidElement<{ children?: unknown }>(value)) return content(value.props.children);
  return '';
}

const order = Object.freeze({ id: 'palma-local', order_code: 'O-0001', total_amount: 3522.5, vat_rate: 22 });
const items = Object.freeze([1800, 143, 93, 346.5, 550, 590].map((unit_price, i) => Object.freeze({
  id: `riga-${i}`, name: `Lavorazione ${i + 1}`, quantity: 1, unit_price, purchase_price: 20, discount_percent: 0,
})));

describe('PDF commessa: confine dei tipi e importi originali', () => {
  it('consegna a react-pdf un Document e mantiene il venduto e l’IVA di Palma', () => {
    const props = { order, items: [...items], showCosts: false, showMargins: false };
    const root = createOrdinePDFDocument(props);
    expect(root.type).toBe(Document);
    const text = content(root).replace(/\s/g, ' ');
    expect(text).toContain('3.522,50');
    expect(text).toContain('4.297,45');
    expect(text).not.toContain('Costo Acq.');
    expect(text).not.toContain('Margine Lordo');
    expect(content(OrdinePDF(props))).toBe(content(root));
    expect(order.total_amount).toBe(3522.5);
    expect(items.map(i => i.unit_price)).toEqual([1800, 143, 93, 346.5, 550, 590]);
  });

  it('mantiene la visibilità economica già scelta dal chiamante', () => {
    const root = createOrdinePDFDocument({ order, items: [...items], showCosts: true, showMargins: true });
    const text = content(root);
    expect(text).toContain('Costo Acq.');
    expect(text).toContain('Margine Lordo');
  });
});
