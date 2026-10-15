import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGenerazioneProtetta } from '@/components/shared/livePreview/useGenerazioneProtetta';

afterEach(()=>vi.useRealTimers());
describe('Anteprima del contratto durante la modifica',()=>{
  it('genera automaticamente dopo la pausa e scarta una generazione superata',async()=>{
    const pending:Array<(s:string)=>void>=[]; const dispose=vi.fn();
    const generate=vi.fn(()=>new Promise<string>(resolve=>pending.push(resolve)));
    const {result,rerender}=renderHook(({version})=>useGenerazioneProtetta(generate,version,{debounceMs:5,onScarta:dispose}),{initialProps:{version:'old'}});
    await waitFor(()=>expect(generate).toHaveBeenCalledTimes(1));
    rerender({version:'new'});
    await waitFor(()=>expect(generate).toHaveBeenCalledTimes(2));
    await act(async()=>pending[1]('new-pdf'));
    expect(result.current.risultato).toBe('new-pdf');expect(result.current.aggiornato).toBe(true);
    await act(async()=>pending[0]('old-pdf'));
    expect(result.current.risultato).toBe('new-pdf');expect(dispose).toHaveBeenCalledWith('old-pdf');
    rerender({version:'third'});
    expect(result.current.aggiornato).toBe(false);
  });
});
