import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {FvTabBar} from '@/lib/fotovoltaico/wizardUI';
import {BarraFasi} from '@/components/preventivatore/BarraFasi';

afterEach(cleanup);
const tabs=['Cliente','Immobile','Consumi','Tetto','Impianto','Finanza'].map((label,i)=>({num:i+1,label}));

describe('Cambio fase rapido su telefono e tablet',()=>{
 it('FV: permette la fase successiva ma mantiene bloccate quelle future',async()=>{
  const select=vi.fn();
  render(<FvTabBar tabs={tabs} current={3} completed={new Set([1,2])} onSelect={select}/>);
  fireEvent.keyDown(screen.getByRole('button',{name:'Scegli passo del preventivo, 3 di 6'}), {key:'Enter'});
  const menu=await screen.findByRole('menu');
  expect(within(menu).getByRole('menuitem',{name:/5\. Impianto/})).toHaveAttribute('data-disabled');
  fireEvent.click(within(menu).getByRole('menuitem',{name:/4\. Tetto/}));
  expect(select).toHaveBeenCalledExactlyOnceWith(4);
 });
 it('FV: conserva la possibilità esplicita di saltare alle altre fasi',async()=>{
  const select=vi.fn();
  render(<FvTabBar tabs={tabs} current={1} completed={new Set()} allowJumpForward onSelect={select}/>);
  fireEvent.keyDown(screen.getByRole('button',{name:'Scegli passo del preventivo, 1 di 6'}), {key:'Enter'});
  fireEvent.click(screen.getByRole('menuitem',{name:/6\. Finanza/}));
  expect(select).toHaveBeenCalledExactlyOnceWith(6);
 });
 it('moduli edili e serramenti: mantiene stato, avvisi e blocchi nella navigazione diretta',async()=>{
  const select=vi.fn();
  render(<BarraFasi passi={tabs.map(t=>({key:String(t.num),label:t.label}))} corrente="3" completati={new Set(['1'])} conAvviso={new Set(['2'])} bloccati={new Set(['6'])} onSelect={select}/>);
  fireEvent.keyDown(screen.getByRole('button',{name:'Scegli passo del preventivo, 3 di 6'}), {key:'Enter'});
  const menu=await screen.findByRole('menu');
  expect(within(menu).getByRole('menuitem',{name:/2\. Immobile, da completare/})).toBeInTheDocument();
  expect(within(menu).getByRole('menuitem',{name:/6\. Finanza, bloccato/})).toHaveAttribute('data-disabled');
  fireEvent.click(within(menu).getByRole('menuitem',{name:/1\. Cliente, completato/}));
  expect(select).toHaveBeenCalledExactlyOnceWith('1');
 });
 it('una sola fase non aggiunge un menu ridondante',()=>{
  render(<BarraFasi passi={[{key:'pdf',label:'PDF'}]} corrente="pdf" onSelect={vi.fn()}/>);
  expect(screen.queryByRole('button',{name:/Scegli passo/})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'PDF'}));
 });
});
