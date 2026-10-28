import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ view: true, error: false, retry: vi.fn(), documenti: vi.fn() }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canViewMezzi: m.view }) }));
vi.mock('@/hooks/useVerbaliTecniciMezzo', () => ({ useVerbaliTecniciMezzo: () => ({
  isError: m.error, refetch: m.retry,
  data: { registrazioni: [{ id: 'copia', documento_id: 'documento', manutenzione_id: 'intervento-rimosso', titolo: 'TEST verifica conservata', categoria: 'verifica_periodica', data_intervento: '2026-11-01', registrato_il: '2026-11-02T08:00:00Z', disponibile: true }] },
}) }));
vi.mock('@/components/mezzi/VerbaleTecnicoDialog', () => ({ VerbaleTecnicoDialog: () : null => null }));
vi.mock('@/hooks/useMezzi', () => ({
 useMezzoManutenzioni: () => ({ data: [] as never[], isLoading: false }),
 useSalvaManutenzioneMezzo: () => ({}), useEliminaManutenzioneMezzo: () => ({}),
 caricaFileMezzo: vi.fn(), linkFileMezzo: vi.fn(), rimuoviFileMezzo: vi.fn(),
}));
import { MezzoManutenzioniSection } from '@/components/mezzi/MezzoManutenzioniSection';
const ui = () => <MezzoManutenzioniSection companyId="azienda" mezzoId="macchina" contatoreAttuale={null} unita="ore" puoModificare={false} onVaiDocumenti={m.documenti} />;
beforeEach(() => { m.view = true; m.error = false; vi.clearAllMocks(); });
afterEach(cleanup);
it('conserva il registro consultabile anche senza più interventi operativi', () => {
 render(ui());
 expect(screen.getByText('Nessun intervento registrato.')).toBeTruthy();
 fireEvent.click(screen.getByText(/Registro delle copie tecniche/));
 expect(screen.getByText('TEST verifica conservata')).toBeTruthy();
 expect(screen.getByText(/L’intervento di origine non è più nello storico operativo/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button', {name: 'Vai ai documenti della macchina'}));
 expect(m.documenti).toHaveBeenCalledOnce();
});
it('non presenta un errore del registro come archivio vuoto', () => {
 m.error = true; render(ui());
 expect(screen.getByRole('alert').textContent).toContain('Non riesco a leggere il registro');
 fireEvent.click(screen.getByRole('button', {name: 'Riprova registro'}));
 expect(m.retry).toHaveBeenCalledOnce();
});
it('nasconde anche i dati eventualmente in cache se manca il permesso Mezzi', () => {
 m.view = false; render(ui());
 expect(screen.queryByText(/Registro delle copie tecniche/)).toBeNull();
 expect(screen.queryByText('TEST verifica conservata')).toBeNull();
});
