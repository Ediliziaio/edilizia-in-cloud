import { describe,expect,it,vi } from 'vitest';
import { shareSubscription } from '@/lib/realtime/shareSubscription';
describe('subscription condivisa con ciclo di vita limitato', () => {
  it('due consumer creano un solo canale, chiuso dopo l’ultimo rilascio', async () => {
    const owner={};const stop=vi.fn();const start=vi.fn(()=>stop);
    const a=shareSubscription(owner,'company:user',start),b=shareSubscription(owner,'company:user',start);
    expect(start).toHaveBeenCalledTimes(1);
    a();await Promise.resolve();expect(stop).not.toHaveBeenCalled();
    b();await Promise.resolve();expect(stop).toHaveBeenCalledTimes(1);
  });
  it('replay StrictMode non apre un secondo canale né chiude quello riacquisito', async () => {
    const owner={};const stop=vi.fn();const start=vi.fn(()=>stop);
    shareSubscription(owner,'scope',start)();
    const release=shareSubscription(owner,'scope',start);
    await Promise.resolve();expect(start).toHaveBeenCalledTimes(1);expect(stop).not.toHaveBeenCalled();
    release();await Promise.resolve();expect(stop).toHaveBeenCalledTimes(1);
  });
  it('non condivide tra aziende/utenti o cache diverse', async () => {
    const owner={};const stop=vi.fn();const start=vi.fn(()=>stop);
    const releases=[shareSubscription(owner,'company1:user1',start),shareSubscription(owner,'company2:user1',start),shareSubscription({},'company1:user1',start)];
    expect(start).toHaveBeenCalledTimes(3);releases.forEach(f=>f());await Promise.resolve();expect(stop).toHaveBeenCalledTimes(3);
  });
  it('cleanup idempotente e riapertura dopo chiusura', async () => {
    const owner={};const stop=vi.fn();const start=vi.fn(()=>stop);const release=shareSubscription(owner,'s',start);
    release();release();await Promise.resolve();expect(stop).toHaveBeenCalledTimes(1);
    shareSubscription(owner,'s',start)();await Promise.resolve();expect(start).toHaveBeenCalledTimes(2);expect(stop).toHaveBeenCalledTimes(2);
  });
  it('se l’apertura fallisce non lascia un riferimento fantasma', () => {
    const owner={};expect(()=>shareSubscription(owner,'s',()=>{throw new Error('offline')})).toThrow('offline');
    const start=vi.fn(()=>vi.fn());shareSubscription(owner,'s',start)();expect(start).toHaveBeenCalledTimes(1);
  });
  it('diagnostica opt-in priva di identificativi, anche dopo cambio URL', async () => {
    const original=window.location.href;
    const log=vi.spyOn(console,'debug').mockImplementation(()=>{});
    try {
      window.history.replaceState(null,'','/?__realtimeAudit=1');
      const release=shareSubscription({},'private-company:private-user',()=>vi.fn());
      window.history.replaceState(null,'','/admin');
      release();await Promise.resolve();
      expect(log.mock.calls.map(call=>JSON.parse(call[1] as string))).toEqual([
        {event:'opened',consumers:1},{event:'released',consumers:0},{event:'closed',consumers:0},
      ]);
      expect(JSON.stringify(log.mock.calls)).not.toContain('private-');
    } finally { window.history.replaceState(null,'',original);log.mockRestore(); }
  });
  it('non registra la diagnostica senza opt-in', async () => {
    const log=vi.spyOn(console,'debug').mockImplementation(()=>{});
    try { shareSubscription({},'s',()=>vi.fn())();await Promise.resolve();expect(log).not.toHaveBeenCalled(); }
    finally { log.mockRestore(); }
  });
});
