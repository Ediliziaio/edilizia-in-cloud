import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DisegnoCad } from '@/lib/distinta/cad/leggiDxf';
import type { VoceMappa } from '@/lib/distinta/cad/mappaBlocchi';
import DisegnoCadPannello from '@/components/orders/materiali/DisegnoCadPannello';

const state=vi.hoisted(()=>({drawing:null as DisegnoCad|null,from:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:state.from}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'synthetic-user'}})}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:[] as VoceMappa[],refetch:vi.fn()})}));
vi.mock('@/lib/distinta/cad/leggiDisegnoCad',()=>({ISTRUZIONI_DWG:'Esporta DXF',leggiDisegnoCad:()=>({promessa:Promise.resolve(state.drawing),annulla:vi.fn()})}));
const drawing=(patch:Partial<DisegnoCad>={}):DisegnoCad=>({versione:'AC1032',insunits:4,layer:['PDF3_CAVI'],testi:[],blocchi:[],
  contorni:[],tratti:[{layer:'PDF3_CAVI',x:0,y:0,lunghezza:1000}],cerchi:[{layer:'PDF3_CAVI',x:0,y:0,r:1}],entita:{},...patch});
async function open(d:DisegnoCad) {
  state.drawing=d;
  const view=render(<DisegnoCadPannello orderId="synthetic-order" companyId="synthetic-company" fasi={[]} puoScrivere onSalvati={vi.fn()}/>);
  const f=new File(['0\nSECTION\n'],'synthetic.dxf',{type:'application/dxf'});
  Object.defineProperty(f,'slice',{value:()=>({arrayBuffer:async()=>new TextEncoder().encode('0\nSECTION\n').buffer})});
  const input=view.container.querySelector('input[type="file"]');
  if(!input)throw new Error('File input missing');
  fireEvent.change(input,{target:{files:[f]}});
  await screen.findByLabelText('Scala del disegno');
  return view;
}
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('CAD controls block unverified quantities before remote writes',()=>{
  it('does not enable circle counting automatically or use a PDF scale before confirmation',async()=>{
    await open(drawing());
    expect(screen.getByRole('checkbox',{name:'conta anche i cerchi'})).not.toBeChecked();
    expect(screen.getByRole('button',{name:'Salva i conteggi come bozza'})).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox',{name:'Conferma calibrazione CAD'}));
    expect(screen.getByRole('button',{name:'Salva i conteggi come bozza'})).toBeEnabled();
    expect(state.from).not.toHaveBeenCalled();
  });
  it('invalidates confirmation after scale edits and does not replace invalid scales with one',async()=>{
    await open(drawing());
    fireEvent.click(screen.getByRole('checkbox',{name:'Conferma calibrazione CAD'}));
    fireEvent.change(screen.getByLabelText('Scala del disegno'),{target:{value:'0'}});
    expect(screen.getByRole('checkbox',{name:'Conferma calibrazione CAD'})).not.toBeChecked();
    expect(screen.getByRole('checkbox',{name:'Conferma calibrazione CAD'})).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('positivo e finito');
    expect(screen.getByRole('button',{name:'Salva i conteggi come bozza'})).toBeDisabled();
    expect(state.from).not.toHaveBeenCalled();
  });
  it('blocks a file with both existing and proposed states, even when circles are manually enabled',async()=>{
    await open(drawing({testi:[{s:'Stato di fatto',layer:'PDF3_Text',x:0,y:0,h:1},{s:'Stato di progetto',layer:'PDF3_Text',x:10,y:0,h:1}]}));
    expect(screen.getByRole('alert')).toHaveTextContent('non sommo tavole');
    fireEvent.click(screen.getByRole('checkbox',{name:'conta anche i cerchi'}));
    expect(screen.getByRole('checkbox',{name:'Conferma calibrazione CAD'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Salva i conteggi come bozza'})).toBeDisabled();
    expect(state.from).not.toHaveBeenCalled();
  });
});
