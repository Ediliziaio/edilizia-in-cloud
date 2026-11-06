import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PreviewFattura } from '@/components/fatturazione/PreviewFattura';
import type { EditorState } from '@/pages/azienda/fatturazione/editor/useEditorState';
afterEach(cleanup);
const campione = {
  tipo: 'ddt', numero: 'DEMO', data_emissione: '2026-11-05',
  righe: [{ descrizione: 'Materiale demo', quantita: 2, unita_misura: 'pz', prezzo_unitario: 10, aliquota_iva: 22, importo_totale: 20 }],
  totale_documento: 24.4, totale_imponibile: 20, totale_iva: 4.4,
  ddt_indirizzo_consegna: {indirizzo:'Via demo 1'}, ddt_vettore: {descrizione:'Vettore demo'},
  ddt_causale_trasporto: 'vendita', ddt_numero_colli: 3, ddt_aspetto_beni: 'Scatole', ddt_porto: 'franco',
};
it('DDT espone trasporto e quantità senza prezzi o riepilogo economico', () => {
  const {container} = render(<PreviewFattura documento={campione as unknown as EditorState} azienda={null} />);
  expect(screen.getByText('Materiale demo')).toBeInTheDocument();
  expect(screen.getByText('Colli: 3')).toBeInTheDocument();
  expect(screen.getByText('Aspetto dei beni: Scatole')).toBeInTheDocument();
  expect(screen.getByText('Porto: franco')).toBeInTheDocument();
  expect(screen.getByText('Consegna: Via demo 1')).toBeInTheDocument();
  expect(screen.getByText('Vettore: Vettore demo')).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', {name:'Prezzo'})).not.toBeInTheDocument();
  expect(container.querySelector('.fd-conti')).toBeNull();
  expect(container.textContent).not.toContain('€');
});
it('la fattura conserva prezzi e totali', () => {
  const {container} = render(<PreviewFattura documento={{...campione,tipo:'fattura'} as unknown as EditorState} azienda={null} />);
  expect(screen.getByRole('columnheader', {name:'Prezzo'})).toBeInTheDocument();
  expect(container.querySelector('.fd-conti')).not.toBeNull();
  expect(screen.queryByText('Colli: 3')).not.toBeInTheDocument();
});
