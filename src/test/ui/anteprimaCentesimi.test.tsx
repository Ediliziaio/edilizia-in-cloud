import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AnteprimaVeloce } from '@/components/preventivatore/AnteprimaVeloce';
import type { AnteprimaPreventivo } from '@/lib/preventivatore/anteprima';

afterEach(cleanup);
const dati: AnteprimaPreventivo = {
  cliente: { nome: 'Cliente fittizio', righe: [] }, titolo: 'Pittura',
  gruppi: [{ id: 'finiture', titolo: 'Finiture', righe: [
    { id: 'pareti', titolo: 'Pareti', quantita: 45.03, unita: 'mq', prezzoUnitario: 5.80, totale: 261.17 },
    { id: 'soffitto', titolo: 'Soffitto', quantita: 20, unita: 'mq', prezzoUnitario: 5.80, totale: 116 },
  ] }],
  totali: [{ id: 'netto', etichetta: 'Imponibile', importo: 377.17 }, { id: 'totale', etichetta: 'Totale', importo: 414.89, forte: true }],
  totaleDocumento: 414.89, avvisi: [], note: [],
};
describe('Anteprima: centesimi coerenti con il computo e il PDF', () => {
  it('non arrotonda a 6 euro un prezzo di prezzario di 5,80', () => {
    render(<AnteprimaVeloce dati={dati} />);
    expect(screen.getAllByText('€ 5,80 / mq')).toHaveLength(2);
    expect(screen.getByText('€ 261,17')).toBeInTheDocument();
    expect(screen.getByText('€ 377,17')).toBeInTheDocument();
    expect(screen.getByText('€ 414,89')).toBeInTheDocument();
    expect(screen.queryByText('€ 6 / mq')).toBeNull();
  });
  it('la sintesi a zero decimali resta una scelta esplicita', () => {
    render(<AnteprimaVeloce dati={dati} decimali={0} />);
    expect(screen.getAllByText('€ 6 / mq')).toHaveLength(2);
  });
});
