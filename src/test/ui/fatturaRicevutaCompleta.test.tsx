import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FatturaRicevutaCompletaDialog } from '@/components/fatturazione/FatturaRicevutaCompletaDialog';
import type { AllegatoXml, FatturaRicevutaVista } from '@/lib/fatturazione/fatturaRicevutaHtml';

const m = vi.hoisted(() => ({ stampa: vi.fn(), allegato: vi.fn(), originale: vi.fn() }));
vi.mock('@/lib/fotovoltaico/htmlToPdf', () => ({ stampaPreventivoNativo: m.stampa }));
vi.mock('@/lib/fatturazione/downloadAllegatoXml', () => ({ scaricaAllegatoXml: m.allegato }));
const vista: FatturaRicevutaVista & { allegatiFile: AllegatoXml[] } = {
  titolo: 'Fattura TEST-001 - Fornitore',
  html: '<html><body>Dati completi del documento originale: CONTRATTO-TEST e due rate.</body></html>',
  allegatiPdf: [],
  allegatiFile: [
    { nome: 'dati.csv', base64: 'YWJj', formato: 'CSV', compressione: '', descrizione: 'Distinta' },
    { nome: 'misure.xlsx.zip', base64: 'UEs=', formato: 'XLSX', compressione: 'ZIP', descrizione: '' },
  ],
};
beforeEach(() => { vi.clearAllMocks(); m.stampa.mockResolvedValue(undefined); });

it('stampa l’intera rappresentazione e scarica l’originale attraverso il percorso dell’archivio', () => {
  render(<FatturaRicevutaCompletaDialog vista={vista} onClose={() => {}} onScaricaOriginale={m.originale} />);
  expect(screen.getByTitle(vista.titolo)).toHaveAttribute('srcdoc', vista.html);
  expect(screen.getByTitle(vista.titolo)).toHaveAttribute('sandbox', '');
  fireEvent.click(screen.getByRole('button', { name: 'Stampa / Salva PDF' }));
  expect(m.stampa).toHaveBeenCalledWith(vista.html, vista.titolo);
  fireEvent.click(screen.getByRole('button', { name: 'Scarica originale' }));
  expect(m.originale).toHaveBeenCalledOnce();
  expect(m.allegato).not.toHaveBeenCalled();
});

it('offre anche allegati diversi dai PDF senza aprirli o scaricarli automaticamente', async () => {
  render(<FatturaRicevutaCompletaDialog vista={vista} onClose={() => {}} onScaricaOriginale={m.originale} />);
  expect(m.allegato).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Allegati (2)' }), { key: 'Enter' });
  expect(await screen.findByRole('menuitem', { name: /dati.csv/ })).toBeVisible();
  const zip = screen.getByRole('menuitem', { name: /misure.xlsx.zip/ });
  expect(zip).toHaveTextContent('Compresso ZIP');
  fireEvent.click(zip);
  expect(m.allegato).toHaveBeenCalledWith(vista.allegatiFile[1]);
  expect(m.originale).not.toHaveBeenCalled();
});
