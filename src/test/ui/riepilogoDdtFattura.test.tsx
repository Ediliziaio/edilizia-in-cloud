// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RiepilogoDdtFattura, type RiepilogoDdt } from "@/components/fatturazione/RiepilogoDdtFattura";
const consegne=vi.hoisted(()=>({conferma:vi.fn()}));
vi.mock("@/lib/ddt/consegneFattura",()=>({confermaConsegneFattura:consegne.conferma}));

const stato=vi.hoisted(()=>({data:null as RiepilogoDdt|null,error:null as {message:string}|null,chiamate:[] as string[]}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:async(nome:string)=>{stato.chiamate.push(nome);return stato;}}}));
const bolla=(n:number,esito:RiepilogoDdt['ddt'][number]['esito']='collegato'):RiepilogoDdt['ddt'][number]=>({id:`l${n}`,numero:`DDT-${n}`,data:null,ddt_id:esito==='mancante'?null:`d${n}`,esito,destinazioni:esito==='collegato'?[{tipo:'commessa',id:`c${n}`,codice:`C-${n}`,valida:true}]:[]});
const monta=(p:Partial<RiepilogoDdt>,onCollegaDdt?:()=>void)=>{
  stato.data={ddt:[],completo:false,motivo:'Verifica le quote',automatico:true,senza_costo:false,allineata:false,manuale:false,gestita_altrove:false,...p};stato.error=null;
  return render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><RiepilogoDdtFattura companyId="azienda" fatturaId="fattura" puoModificare onCollegaDdt={onCollegaDdt} /></QueryClientProvider></MemoryRouter>);
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
  it('molti DDT da collegare: una riga che si apre invece dell\'elenco intero (23/11/2026)',async()=>{
    monta({ddt:Array.from({length:12},(_,i)=>bolla(i+1,i>=1?'mancante':'collegato'))});
    expect(await screen.findByText('11 DDT da collegare')).toBeInTheDocument();
  });
  it('bolle tutte caricate e collegamento automatico spento: «Dividi come le bolle» (23/11/2026)',async()=>{
    monta({ddt:[bolla(1),bolla(2)],completo:true,automatico:false});
    stato.chiamate=[];
    fireEvent.click(await screen.findByRole('button',{name:'Dividi come le bolle'}));
    await vi.waitFor(()=>expect(stato.chiamate).toContain('fattura_ddt_applica_bolle'));
  });
  it('divisione a mano che non torna: si sostituisce solo dopo la conferma',async()=>{
    const conferma=vi.spyOn(window,'confirm').mockReturnValue(false);
    monta({ddt:[bolla(1)],completo:true,manuale:true});
    stato.chiamate=[];
    fireEvent.click(await screen.findByRole('button',{name:'Dividi come le bolle'}));
    expect(conferma).toHaveBeenCalled();
    expect(stato.chiamate).not.toContain('fattura_ddt_applica_bolle');
    conferma.mockRestore();
  });
  it('«Conferma le consegne» conferma le bolle collegate, dopo la domanda (23/11/2026)',async()=>{
    const domanda=vi.spyOn(window,'confirm').mockReturnValue(true);
    consegne.conferma.mockReset().mockResolvedValue({confermate:2,righe:5,saltate:[]});
    monta({ddt:[bolla(1),bolla(2),bolla(3,'mancante')]});
    fireEvent.click(await screen.findByRole('button',{name:'Conferma le consegne'}));
    await vi.waitFor(()=>expect(consegne.conferma).toHaveBeenCalledWith(['d1','d2']));
    domanda.mockRestore();
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
  it('mostra il DDT mancante anche quando la fattura non ha ancora collegamenti',async()=>{
    const collega=vi.fn();
    monta({prezzi:{stato:"da_verificare",motivo:"ddt_mancante",riferimento:"107/A"}},collega);
    expect(await screen.findByText(/Il DDT citato va registrato o collegato/)).toHaveTextContent("DDT 107/A");
    fireEvent.click(screen.getByRole("button",{name:"Collega DDT"}));
    expect(collega).toHaveBeenCalledOnce();
  });
  it("mostra gli otto DDT valorizzati e chiede di collegare gli altri due", async () => {
    const collega = vi.fn();
    monta({
      ddt: Array.from({ length: 10 }, (_, i) => bolla(i + 1, i >= 8 ? "mancante" : "collegato")),
      prezzi: {
        stato: "parziale",
        ddt_totali: 10,
        ddt_valorizzati: 8,
        ddt_pendenti: [9, 10].map(n => ({ posizione: n, numero: `DDT-${n}`, motivo: "ddt_mancante" })),
      },
    }, collega);
    expect(await screen.findByText("8 di 10 DDT valorizzati.")).toHaveAttribute("role", "status");
    expect(screen.getByRole("alert", { name: "" })).toHaveTextContent("2 DDT da confermare");
    expect(screen.getByText("DDT DDT-9")).toBeVisible();
    expect(screen.getByText("DDT DDT-10")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Collega DDT" }));
    expect(collega).toHaveBeenCalledOnce();
  });
  it('porta alla conferma del prezzo sulla bolla della riga ambigua',async()=>{
    monta({ddt:[bolla(1),bolla(2)],prezzi:{stato:"da_verificare",motivo:"articolo",ddt_id:"d2",riga:5}});
    expect(await screen.findByText(/Conferma quale articolo/)).toHaveTextContent("riga 5 della fattura");
    expect(screen.getByRole("link",{name:"Verifica prezzi sul DDT"})).toHaveAttribute("href","/azienda/ddt/d2?fatturaPrezzi=fattura");
  });
});
