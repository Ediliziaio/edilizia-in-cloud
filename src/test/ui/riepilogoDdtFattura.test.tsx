// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RiepilogoDdtFattura, type RiepilogoDdt } from "@/components/fatturazione/RiepilogoDdtFattura";

const stato=vi.hoisted(()=>({data:null as RiepilogoDdt|null,error:null as {message:string}|null}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:async()=>stato}}));
const bolla=(n:number,esito:RiepilogoDdt['ddt'][number]['esito']='collegato'):RiepilogoDdt['ddt'][number]=>({id:`l${n}`,numero:`DDT-${n}`,data:null,ddt_id:esito==='mancante'?null:`d${n}`,esito,destinazioni:esito==='collegato'?[{tipo:'commessa',id:`c${n}`,codice:`C-${n}`,valida:true}]:[]});
const monta=(p:Partial<RiepilogoDdt>)=>{
  stato.data={ddt:[],completo:false,motivo:'Verifica le quote',automatico:true,senza_costo:false,allineata:false,manuale:false,gestita_altrove:false,...p};stato.error=null;
  return render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><RiepilogoDdtFattura companyId="azienda" fatturaId="fattura" puoModificare /></QueryClientProvider></MemoryRouter>);
};
afterEach(cleanup);
describe('Avvisi DDT della fattura',()=>{
  it('distingue 2 mancanti su 10 e il DDT trovato ma senza cantiere',async()=>{
    monta({ddt:Array.from({length:10},(_,i)=>bolla(i+1,i>=8?'mancante':i===7?'senza_destinazione':'collegato'))});
    expect(await screen.findByText('8 di 10 DDT collegati')).toBeVisible();
    expect(screen.getByText('2 DDT da collegare: DDT-9, DDT-10.')).toHaveAttribute('role','alert');
    expect(screen.getByText('1 DDT senza cantiere o magazzino: DDT-8.')).toHaveAttribute('role','alert');
    expect(screen.getByRole('link',{name:'C-1'})).toHaveAttribute('href','/azienda/ordini/c1');
  });
  it('non presenta il magazzino come un cantiere mancante né una ripartizione ambigua come completata',async()=>{
    monta({ddt:[{...bolla(1),destinazioni:[{tipo:'magazzino',id:'m',codice:'Magazzino',valida:true}]}],motivo:'Più commesse: mancano le quote delle righe.'});
    expect(await screen.findByText('Magazzino')).toBeVisible();
    expect(screen.queryByText(/senza cantiere/)).toBeNull();
    expect(screen.getByText('Più commesse: mancano le quote delle righe.')).toHaveAttribute('role','alert');
  });
  it('mantiene visibile una scelta manuale da verificare e non propone di sovrascriverla',async()=>{
    monta({ddt:[bolla(1),bolla(2)],completo:true,manuale:true});
    expect(await screen.findByText(/Le commesse sono state scelte manualmente/)).toBeVisible();
    expect(screen.queryByRole('button',{name:'Aggiorna commesse dai DDT'})).toBeNull();
  });
  it('una verifica non disponibile non diventa una falsa conferma di completezza',async()=>{
    monta({});stato.error={message:'Permesso negato'};
    expect(await screen.findByText(/Verifica DDT non disponibile/)).toBeVisible();
    expect(screen.queryByText(/DDT collegati/)).toBeNull();
  });
});
