import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from '@/hooks/use-mobile';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Breakpoint telefono e tablet', () => {
  it('inizia con la misura reale e si aggiorna al cambio di orientamento', () => {
    const targets: MediaQueryList[] = [];
    vi.spyOn(window, 'matchMedia').mockImplementation(query => {
      const media: MediaQueryList = Object.assign(new window.EventTarget(), {
        media: query, matches: false, onchange: null,
        addListener: () => {}, removeListener: () => {},
      });
      vi.spyOn(media, 'removeEventListener');
      targets.push(media);
      return media;
    });
    const original = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 820, configurable: true, writable: true });
    const { result, unmount } = renderHook(() => ({ telefono: useIsMobile(), compatto: useIsMobile(1024) }));
    expect(result.current).toEqual({ telefono: false, compatto: true });
    act(() => { window.innerWidth = 390; targets.forEach(t => t.dispatchEvent(new window.Event('change'))); });
    expect(result.current).toEqual({ telefono: true, compatto: true });
    act(() => { window.innerWidth = 1180; targets.forEach(t => t.dispatchEvent(new window.Event('change'))); });
    expect(result.current).toEqual({ telefono: false, compatto: false });
    unmount();
    for (const target of targets) expect(target.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    Object.defineProperty(window, 'innerWidth', { value: original, configurable: true, writable: true });
  });
});
