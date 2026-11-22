import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {useIsMobile} from '@/hooks/use-mobile';

afterEach(()=>{cleanup();vi.restoreAllMocks()});
describe('Breakpoint telefono e tablet',()=>{
 it('inizia con la misura reale e si aggiorna al cambio di orientamento',()=>{
  const handlers=new Set<()=>void>();
  vi.spyOn(window,'matchMedia').mockImplementation(query=>({media:query,matches:false,onchange:null,addListener:()=>{},removeListener:()=>{},dispatchEvent:()=>true,addEventListener:(_event:string,fn:()=>void)=>{handlers.add(fn)},removeEventListener:(_event:string,fn:()=>void)=>{handlers.delete(fn)}}) as MediaQueryList);
  const original=window.innerWidth;
  Object.defineProperty(window,'innerWidth',{value:820,configurable:true,writable:true});
  const {result,unmount}=renderHook(()=>({telefono:useIsMobile(),compatto:useIsMobile(1024)}));
  expect(result.current).toEqual({telefono:false,compatto:true});
  act(()=>{window.innerWidth=390;handlers.forEach(fn=>fn())});
  expect(result.current).toEqual({telefono:true,compatto:true});
  act(()=>{window.innerWidth=1180;handlers.forEach(fn=>fn())});
  expect(result.current).toEqual({telefono:false,compatto:false});
  unmount();
  expect(handlers.size).toBe(0);
  Object.defineProperty(window,'innerWidth',{value:original,configurable:true,writable:true});
 });
});
