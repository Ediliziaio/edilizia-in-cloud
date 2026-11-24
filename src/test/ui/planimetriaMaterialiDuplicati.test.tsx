import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import bilocale from '../../../shared/planimetrie/esempi/bilocale.json';
import Scheda from '@/pages/azienda/RenderPlanimetriaScheda';
vi.mock('@/lib/planimetrie/archivio',()=>({
 usePlanimetria:()=>({data:{riga:{titolo:'Pianta demo',company_id:'azienda-demo'},versione:{numero:1,documento:bilocale}}}),
 useVersionePlanimetria:()=>({}),
 useVersioniPlanimetria:(): { data: never[] } => ({ data: [] }),
}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:'azienda-demo'}})}));
vi.mock('@/lib/planimetrie/render/renderDallaPianta',()=>({useRenderDellaPianta:()=>({data:[] as never[]})}));
vi.mock('@/lib/planimetrie/collegamenti',async(importOriginal)=>({
 ...await importOriginal<typeof import('@/lib/planimetrie/collegamenti')>(),
 useCollegamentiPiante:(): {data: undefined}=>({data:undefined}),
}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({solaLettura:false})}));
vi.mock('@/components/planimetrie/MaterialiProgetto',()=>({MaterialiProgetto:()=> <section aria-label="Materiali comuni">Materiali</section>}));
vi.mock('@/components/planimetrie/EsportaPiantaDialog',()=>({EsportaPiantaDialog:({aperto,onChiudi}:{aperto:boolean;onChiudi:()=>void})=>aperto?<button onClick={onChiudi}>Chiudi esportazione</button>:null}));
vi.mock('@/components/planimetrie/Vista3DPigra',()=>({Vista3DPigra:(): null=>null}));
vi.mock('@/components/planimetrie/NuovaCostruzione',()=>({NuovaCostruzione:(): null=>null}));
vi.mock('@/components/planimetrie/RiepilogoProgetto',()=>({RiepilogoProgetto:(): null=>null}));
vi.mock('@/components/planimetrie/AbachiPianta',()=>({AbachiPianta:(): null=>null}));
vi.mock('@/components/planimetrie/ProspettiDialog',()=>({ProspettiDialog:(): null=>null}));
vi.mock('@/components/planimetrie/RenderInSerieDialog',()=>({RenderInSerieDialog:(): null=>null}));
vi.mock('@/components/planimetrie/RenderEsterniDialog',()=>({RenderEsterniDialog:(): null=>null}));
vi.mock('@/components/planimetrie/PrimaEDopo',()=>({PrimaEDopo:(): null=>null}));
vi.mock('@/components/planimetrie/GalleriaStanza',()=>({GalleriaStanza:(): null=>null}));
vi.mock('@/components/planimetrie/UnitaEdificio',()=>({UnitaEdificio:(): null=>null}));
vi.mock('@/components/planimetrie/VerifichePianta',()=>({VerifichePianta:(): null=>null}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('mantiene un solo pannello materiali dopo aperture e chiusure dell’esportazione',()=>{
 const errors=vi.spyOn(console,'error').mockImplementation(()=>undefined);
 const queryClient=new QueryClient();
 render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/azienda/planimetrie/prova?sezione=dettagli']}><Scheda/></MemoryRouter></QueryClientProvider>);
 expect(screen.getByRole('button',{name:'Verifica tavola'})).toBeInTheDocument();
 for(let i=0;i<3;i++) {
  fireEvent.keyDown(screen.getByRole('button',{name:'Altre azioni della planimetria'}),{key:'Enter'});
  fireEvent.click(screen.getByRole('menuitem',{name:'Esporta'}));
  fireEvent.click(screen.getByRole('button',{name:'Chiudi esportazione'}));
  expect(screen.getAllByRole('region',{name:'Materiali comuni'})).toHaveLength(1);
 }
 expect(errors.mock.calls.flat().join(' ')).not.toContain('same key');
});
