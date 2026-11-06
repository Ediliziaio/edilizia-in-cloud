import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PrimaNotaXBRL } from '@/components/contabilita/PrimaNotaXBRL';
const info = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { info } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('spiega il limite senza leggere movimenti o scaricare un file non valido', () => {
  const fetchAll = vi.fn();
  const creaFile = vi.spyOn(URL, 'createObjectURL');
  render(<PrimaNotaXBRL entries={[]} anno={2026} fetchAll={fetchAll} />);
  fireEvent.click(screen.getByRole('button', { name: 'XBRL non disponibile · usa CSV' }));
  expect(info).toHaveBeenCalledWith(expect.stringContaining('formato non è ancora validato'));
  expect(fetchAll).not.toHaveBeenCalled();
  expect(creaFile).not.toHaveBeenCalled();
});
