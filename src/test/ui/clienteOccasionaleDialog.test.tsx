import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorClienteSection } from '@/pages/azienda/fatturazione/editor/EditorClienteSection';
vi.mock('@/hooks/useEffectiveCompanyId', () => ({ useEffectiveCompanyId: () => 'demo' }));
vi.mock('@/hooks/useAnagraficheNative', () => ({ useAnagraficheNative: () => ({ data: [] as never[] }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
it('CHECK-103: crea lo snapshot dal dialogo senza prompt nativo', () => {
 const dispatch = vi.fn();
 render(<EditorClienteSection state={{}} dispatch={dispatch} />);
 fireEvent.click(screen.getByRole('button', { name: 'Occasionale' }));
 expect(screen.getByRole('button', { name: 'Usa cliente' })).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Nome cliente occasionale'), { target: { value: 'Mario Demo' } });
 fireEvent.click(screen.getByRole('button', { name: 'Usa cliente' }));
 expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_CLIENTE', anagrafica_id: '', snapshot: expect.objectContaining({ nome: 'Mario', cognome: 'Demo' }) }));
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
