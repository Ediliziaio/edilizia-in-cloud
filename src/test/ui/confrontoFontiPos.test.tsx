import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render as renderBase, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { posVuoto } from '../../../supabase/functions/_shared/posModello';
const s=vi.hoisted(()=>({leggi:vi.fn()}));
vi.mock('@/hooks/usePos',()=>({datiAppPos:s.leggi}));
import { ConfrontoFontiPos } from '@/components/sicurezza/pos/ConfrontoFontiPos';
function render(ui:ReactNode){const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});return renderBase(ui,{wrapper:({children})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>});}
afterEach(cleanup);beforeEach(()=>vi.clearAllMocks());
function props(){return {companyId:'azienda',posId:'pos',bozza:posVuoto(),onClose:vi.fn(),onApplica:vi.fn()};}
function risposta(){return {contenuto:posVuoto(),contesto:{avvisi:[],mezzi:[],subappaltatori:[]}};}
describe('Confronto fonti prima del riallineamento',()=>{
 it('mostra differenze senza preselezione e applica soltanto quelle scelte alla bozza',async()=>{
  const r=risposta();r.contenuto.impresa.ragione_sociale='Nuova società';r.contenuto.opera.cantiere.via='Via nuova';s.leggi.mockResolvedValue(r);const p=props();render(<ConfrontoFontiPos {...p}/>);
  const c=await screen.findByRole('checkbox',{name:'Sostituisci Ragione sociale'});expect((c as HTMLInputElement).checked).toBe(false);expect((screen.getByRole('button',{name:'Applica alla bozza'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(c);fireEvent.click(screen.getByRole('button',{name:'Applica alla bozza (1)'}));expect(p.onApplica).toHaveBeenCalledOnce();const nuovo=p.onApplica.mock.calls[0][0];expect(nuovo.impresa.ragione_sociale).toBe('Nuova società');expect(nuovo.opera.cantiere.via).toBe('');
 });
 it('un errore di lettura non appare come assenza di differenze e si può riprovare',async()=>{
  s.leggi.mockRejectedValueOnce(new Error('Formazione non disponibile')).mockResolvedValueOnce(risposta());render(<ConfrontoFontiPos {...props()}/>);expect(await screen.findByRole('alert')).toHaveTextContent('Formazione non disponibile');expect(screen.queryByText(/coincidono/)).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Riprova'}));await screen.findByText(/coincidono/);
 });
 it('mostra i limiti delle fonti e avvisa prima di rimuovere un dato non rilevato',async()=>{
  const r=risposta();r.contesto.avvisi=['Nomina specifica non presente'];s.leggi.mockResolvedValue(r);const p=props();p.bozza.rspp.nominativo='Consulente scritto a mano';render(<ConfrontoFontiPos {...p}/>);await screen.findByText('Nomina specifica non presente');expect(screen.getByText(/cancelli il valore/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Annulla'}));expect(p.onClose).toHaveBeenCalledOnce();expect(p.onApplica).not.toHaveBeenCalled();
 });
 it('rileggere le fonti azzera la selezione e richiede una nuova scelta',async()=>{
  const r=risposta();r.contenuto.impresa.ragione_sociale='Prima lettura';s.leggi.mockResolvedValueOnce(r).mockResolvedValueOnce({...r,contenuto:{...r.contenuto,impresa:{...r.contenuto.impresa,ragione_sociale:'Seconda lettura'}}});render(<ConfrontoFontiPos {...props()}/>);
  fireEvent.click(await screen.findByRole('checkbox',{name:'Sostituisci Ragione sociale'}));expect((screen.getByRole('button',{name:'Applica alla bozza (1)'}) as HTMLButtonElement).disabled).toBe(false);fireEvent.click(screen.getByRole('button',{name:'Rileggi fonti'}));await screen.findByText('Seconda lettura');expect((screen.getByRole('checkbox',{name:'Sostituisci Ragione sociale'}) as HTMLInputElement).checked).toBe(false);expect((screen.getByRole('button',{name:'Applica alla bozza'}) as HTMLButtonElement).disabled).toBe(true);
 });
 it('un risultato tardivo della vecchia azienda non sostituisce quello della nuova',async()=>{
  let prima:(v:ReturnType<typeof risposta>)=>void=()=>{};s.leggi.mockImplementationOnce(()=>new Promise(resolve=>{prima=resolve;})).mockResolvedValueOnce(risposta());const p=props();const view=render(<ConfrontoFontiPos {...p}/>);view.rerender(<ConfrontoFontiPos {...p} companyId="altra"/>);await screen.findByText(/coincidono/);const vecchia=risposta();vecchia.contenuto.impresa.ragione_sociale='Altra azienda';prima(vecchia);await waitFor(()=>expect(screen.queryByText('Altra azienda')).toBeNull());expect(p.onApplica).not.toHaveBeenCalled();
 });
});
