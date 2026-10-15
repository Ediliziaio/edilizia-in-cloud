import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
const state = vi.hoisted(() => ({ error: false, data: [{ id: 's', companyId: 'c', nome: 'Base aziendale', testo: '<p style="font-size:9pt">Clausola {{cliente.nome_completo}}</p>' }] }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: state.data, isPending: false, isError: state.error, refetch: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { CopiaCondizioni } from '@/components/preventivi/CopiaCondizioni';
afterEach(() => { cleanup(); vi.restoreAllMocks(); state.error = false; });
const choose = () => { fireEvent.click(screen.getByRole('button', { name: 'Copia da…' })); fireEvent.change(screen.getByRole('combobox'), { target: { value: 's' } }); };
describe('Copia da e modifica qui', () => {
  it('non cambia nulla prima della conferma e conserva i campi e la formattazione', () => {
    const onChange = vi.fn();
    render(<CopiaCondizioni companyId="c" value="" onChange={onChange} />);
    choose(); expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copia e modifica qui' }));
    expect(onChange).toHaveBeenCalledWith(state.data[0].testo);
    expect(screen.getByRole('status').textContent).toContain('l’originale non cambia');
  });
  it('annullare la sostituzione conserva le modifiche', () => {
    const onChange = vi.fn(); vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<CopiaCondizioni companyId="c" value="Mio testo" onChange={onChange} />);
    choose(); fireEvent.click(screen.getByRole('button', { name: 'Copia e modifica qui' }));
    expect(onChange).not.toHaveBeenCalled();
  });
  it('non rende copiabili fonti di un’altra azienda dopo un cambio azienda', () => {
    render(<CopiaCondizioni companyId="altra" value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copia da…' }));
    expect(screen.queryByRole('option', { name: 'Base aziendale' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Copia e modifica qui' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('mostra gli errori senza modificare il testo e rispetta la sola lettura', () => {
    state.error = true;
    const { rerender } = render(<CopiaCondizioni companyId="c" value="Mio testo" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copia da…' }));
    expect(screen.getByRole('alert').textContent).toContain('Il tuo testo non cambia');
    rerender(<CopiaCondizioni companyId="c" value="Mio testo" disabled onChange={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Copia da…' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
