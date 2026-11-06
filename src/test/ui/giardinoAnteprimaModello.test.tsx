import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import StepPdf from '@/pages/azienda/pavimenti/PavimentiWizard/StepPdf';
import type {PavProgetto} from '@/types/pavimenti';
vi.mock('@/hooks/use-mobile',()=>({useIsMobile:()=>false}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:null as null})}));
vi.mock('@/hooks/usePavimentiProgetto',()=>({useEffectiveCompanyId:()=> 'azienda',usePavTemplatePdf:()=>({data:{cover_title:'I tuoi pavimenti',usp:[],chi_siamo:''}})}));
vi.mock('@/hooks/usePavimentiPDF',()=>({usePavimentiPDF:()=>({downloadPDF:vi.fn(),previewPDF:vi.fn(),isGenerating:false}),renderPavPreviewBlobUrl:vi.fn()}));
vi.mock('@/components/moduli/InviaFirmaCard',()=>({InviaFirmaCard:(): null=>null}));
vi.mock('@/components/moduli/CondizioniDelPreventivoCard',()=>({CondizioniDelPreventivoCard:(): null=>null}));
afterEach(cleanup);
it('mostra il titolo del modello giardino congelato, anche se quello aziendale è pavimenti',()=>{
 const progetto={company_id:'azienda',cliente_nome:'Demo',cliente_cognome:'Giardino',modello_snapshot:{version:1,modulo:'pavimenti',companyId:'azienda',modelId:'giardino',capturedAt:'2026-11-04T07:56:00Z',template:{company_id:'azienda',pdf_blocchi:{modulo_intervento:'giardino'},pdf_cover_hero:'Uno spazio verde. Progettato per durare.',cover_title:'Vecchio titolo pavimenti',usp:[]}}} as unknown as PavProgetto;
 render(<StepPdf progetto={progetto} computo={[]} media={[]}/>);
 expect(screen.getByText('Uno spazio verde. Progettato per durare.')).toBeVisible();
 expect(screen.queryByText('I tuoi pavimenti')).not.toBeInTheDocument();
});
