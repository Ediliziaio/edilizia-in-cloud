import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useScopedStorage } from '@/hooks/warehouse/useScopedStorage';
beforeEach(()=>localStorage.clear());
afterEach(()=>vi.restoreAllMocks());
it('cambia azienda caricando le sue preferenze senza sovrascriverle con quelle precedenti',()=>{
 localStorage.setItem('a','["quantita"]');localStorage.setItem('b','["valore"]');
 const {result,rerender}=renderHook(({scope})=>useScopedStorage(scope,[] as string[]),{initialProps:{scope:'a'}});
 expect(result.current[0]).toEqual(['quantita']);
 act(()=>result.current[1](['giacenza']));rerender({scope:'b'});
 expect(result.current[0]).toEqual(['valore']);expect(JSON.parse(localStorage.getItem('a')!)).toEqual(['giacenza']);expect(JSON.parse(localStorage.getItem('b')!)).toEqual(['valore']);
});
it('riparte dal default se lo storage è corrotto',()=>{
 localStorage.setItem('broken','{');const {result}=renderHook(()=>useScopedStorage('broken',['default']));expect(result.current[0]).toEqual(['default']);
});
it('consente modifiche anche se il browser nega lo storage',()=>{
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new DOMException('Denied');});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Quota');});
 const {result}=renderHook(()=>useScopedStorage('a',1));act(()=>result.current[1](x=>x+1));expect(result.current[0]).toBe(2);
});
it('senza ambito non scrive preferenze aziendali',()=>{
 const save=vi.spyOn(Storage.prototype,'setItem');const {result}=renderHook(()=>useScopedStorage(null,1));act(()=>result.current[1](2));expect(save).not.toHaveBeenCalled();
});
