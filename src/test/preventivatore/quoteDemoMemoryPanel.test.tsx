import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuoteDemoMemoryPanel } from '@/components/quotes/dev/QuoteDemoMemoryPanel';
import { localSnapshot } from './localPlanFixtures';
afterEach(cleanup);
describe('Copia Demo 2 esplicita e senza upload automatico', () => {
  it('richiede ispezione e un secondo click esplicito prima di inviare il dossier', async () => {
    const demo = { inspect: vi.fn().mockResolvedValue(null), upload: vi.fn().mockResolvedValue(1), restore: vi.fn() };
    render(<QuoteDemoMemoryPanel demo={demo} />);
    expect(demo.inspect).not.toHaveBeenCalled(); expect(demo.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Riprendi su un altro dispositivo · Demo 2'));
    expect(screen.queryByRole('button', { name: 'Salva prima copia demo' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Controlla copia demo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Salva prima copia demo' }));
    await screen.findByText(/Copia demo salvata · versione 1/); expect(demo.upload).toHaveBeenCalledWith(0);
    expect(demo.restore).not.toHaveBeenCalled();
  });
  it('mostra la versione remota, non la ripristina al caricamento e non ritenta un conflitto', async () => {
    const copy = { version: 3, snapshot: localSnapshot(), updatedAt: '2026-10-22T08:00:00.000Z' };
    const demo = { inspect: vi.fn().mockResolvedValue(copy), upload: vi.fn().mockRejectedValue(new Error('Conflitto: nessuna sovrascrittura')), restore: vi.fn() };
    render(<QuoteDemoMemoryPanel demo={demo} />); fireEvent.click(screen.getByText('Riprendi su un altro dispositivo · Demo 2'));
    fireEvent.click(screen.getByRole('button', { name: 'Controlla copia demo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sostituisci copia demo v3' }));
    await screen.findByText('Conflitto: nessuna sovrascrittura'); expect(demo.upload).toHaveBeenCalledTimes(1); expect(demo.restore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Riprendi copia e conserva versione locale' }));
    expect(demo.restore).toHaveBeenCalledWith(copy);
  });
  it('attiva la copia automatica solo dopo ispezione e consenso esplicito con la versione attesa', async () => {
    const copy = { version: 4, snapshot: localSnapshot(), updatedAt: '2026-10-22T08:00:00.000Z' };
    const auto = { enabled: false, pending: false, status: '', start: vi.fn().mockResolvedValue(undefined), stop: vi.fn() };
    const demo = { inspect: vi.fn().mockResolvedValue(copy), upload: vi.fn(), restore: vi.fn(), auto };
    render(<QuoteDemoMemoryPanel demo={demo} />);
    fireEvent.click(screen.getByText('Riprendi su un altro dispositivo · Demo 2'));
    expect(screen.queryByRole('button', { name: /Attiva copia automatica/ })).not.toBeInTheDocument();
    expect(auto.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Controlla copia demo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Attiva copia automatica da questa bozza · sostituisce v4' }));
    expect(auto.start).toHaveBeenCalledWith(4);
    expect(demo.upload).not.toHaveBeenCalled(); expect(demo.restore).not.toHaveBeenCalled();
  });
  it('impedisce upload e ripristino concorrenti mentre la copia automatica è attiva', async () => {
    const copy = { version: 4, snapshot: localSnapshot(), updatedAt: '2026-10-22T08:00:00.000Z' };
    const auto = { enabled: true, pending: false, status: 'Copia automatica attiva · v4', start: vi.fn(), stop: vi.fn() };
    const demo = { inspect: vi.fn().mockResolvedValue(copy), upload: vi.fn(), restore: vi.fn(), auto };
    render(<QuoteDemoMemoryPanel demo={demo} />);
    fireEvent.click(screen.getByText('Riprendi su un altro dispositivo · Demo 2'));
    fireEvent.click(screen.getByRole('button', { name: 'Controlla copia demo' }));
    expect(await screen.findByRole('button', { name: 'Sostituisci copia demo v4' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Riprendi copia e conserva versione locale' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Disattiva copia automatica' }));
    expect(auto.stop).toHaveBeenCalledOnce(); expect(demo.upload).not.toHaveBeenCalled(); expect(demo.restore).not.toHaveBeenCalled();
  });
});
