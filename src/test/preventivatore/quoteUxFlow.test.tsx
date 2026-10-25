import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useQuoteChatScroll } from '@/components/quotes/dev/useQuoteChatScroll';
import { localDraftKey } from '@/lib/preventivi/localQuoteMemory';
import { memoryScope } from './localPlanFixtures';

const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: function(this: HTMLElement, options: ScrollToOptions | number) {
    this.scrollTop = typeof options === 'number' ? options : options.top ?? 0;
  } });
});
afterEach(() => {
  cleanup();
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});
function Chat({ token, active = true }: { token: string; active?: boolean }) {
  const log = useRef<HTMLDivElement>(null);
  const scroll = useQuoteChatScroll(log, token, active);
  return <><div role="log" ref={log} onScroll={scroll.onScroll}>{token}</div>{scroll.unread && <button onClick={scroll.jumpToLatest}>Nuova risposta</button>}<button onClick={scroll.followNextMessage}>Invia</button></>;
}
function geometry(element: HTMLElement, top: number) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 1500 });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 400 });
  element.scrollTop = top;
}
describe('Scorrimento rispettoso della lettura', () => {
  it('non interrompe la chat nei renderer senza API di scorrimento', () => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
    const view = render(<Chat token="prima" />);
    expect(() => view.rerender(<Chat token="seconda" />)).not.toThrow();
    expect(screen.getByRole('log')).toHaveTextContent('seconda');
  });
  it('non trascina chi sta leggendo e offre un ritorno esplicito', () => {
    const view = render(<Chat token="prima" />); const log = screen.getByRole('log');
    geometry(log, 100); fireEvent.scroll(log);
    view.rerender(<Chat token="nuova risposta" />);
    expect(log.scrollTop).toBe(100); expect(screen.getByRole('button', { name: 'Nuova risposta' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Nuova risposta' }));
    expect(log.scrollTop).toBe(1500); expect(screen.queryByRole('button', { name: 'Nuova risposta' })).not.toBeInTheDocument();
  });
  it('continua a seguire chi è già in fondo e segue il proprio nuovo messaggio', () => {
    const view = render(<Chat token="prima" />); const log = screen.getByRole('log');
    geometry(log, 1100); fireEvent.scroll(log); view.rerender(<Chat token="seconda" />);
    expect(log.scrollTop).toBe(1500);
    geometry(log, 20); fireEvent.scroll(log); fireEvent.click(screen.getByRole('button', { name: 'Invia' }));
    view.rerender(<Chat token="mio nuovo messaggio" />); expect(log.scrollTop).toBe(1500);
  });
  it('non sposta lo scroll quando la chat è nascosta', () => {
    const view = render(<Chat token="prima" active={false} />); const log = screen.getByRole('log');
    geometry(log, 100); view.rerender(<Chat token="nuova" active={false} />); expect(log.scrollTop).toBe(100);
    act(() => { fireEvent.scroll(log); });
  });
});
describe('Prove da zero isolate dalle bozze esistenti', () => {
  it('conserva la chiave precedente e isola ogni prova per account, azienda e scenario', () => {
    const old = localDraftKey(memoryScope);
    expect(old).toBe(`quote-local:v1:${memoryScope.ownerId}:${memoryScope.companyId}:plan`);
    const a = { ...memoryScope, scenarioId: 'bagno12' as const, localTrialId: 'a1000000-0000-4000-a000-000000000001' };
    expect(localDraftKey(a)).not.toBe(localDraftKey({ ...a, localTrialId: 'a1000000-0000-4000-a000-000000000002' }));
    expect(localDraftKey(a)).not.toBe(localDraftKey({ ...a, ownerId: 'a2000000-0000-4000-a000-000000000002' }));
    expect(localDraftKey(a)).not.toBe(localDraftKey({ ...a, scenarioId: 'serramenti' }));
    expect(() => localDraftKey({ ...a, companyId: 'other' })).toThrow();
    expect(() => localDraftKey({ ...a, localTrialId: '../main' })).toThrow();
  });
});
