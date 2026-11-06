import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {ComponentProps} from 'react';
vi.mock('@/hooks/use-mobile',()=>({useIsMobile:()=>false}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:null as null})}));
vi.mock('@/components/moduli/InviaFirmaCard',()=>({InviaFirmaCard:(): null=>null}));
vi.mock('@/components/moduli/CondizioniDelPreventivoCard',()=>({CondizioniDelPreventivoCard:(): null=>null}));
vi.mock('@/components/moduli/ConvertiInCommessaCard',()=>({ConvertiInCommessaCard:(): null=>null}));
afterEach(cleanup);
import RstStep from '@/pages/azienda/ristrutturazione/RistrutturazioneWizard/StepPdf';
vi.mock('@/hooks/useRistrutturazioneProgetto',()=>({useEffectiveCompanyId:()=> 'azienda',useRstTemplatePdf:()=>({data:{cover_title:'Titolo aziendale corrente',usp:[] as never[],chi_siamo:''}})}));
vi.mock('@/hooks/useRistrutturazionePDF',()=>({useRistrutturazionePDF:()=>({downloadPDF:vi.fn(),previewPDF:vi.fn(),isGenerating:false}),renderRstPreviewBlobUrl:vi.fn()}));
import BgnStep from '@/pages/azienda/bagni/BagniWizard/StepPdf';
vi.mock('@/hooks/useBagniProgetto',()=>({useEffectiveCompanyId:()=> 'azienda',useBgnTemplatePdf:()=>({data:{cover_title:'Titolo aziendale corrente',usp:[] as never[],chi_siamo:''}})}));
vi.mock('@/hooks/useBagniPDF',()=>({useBagniPDF:()=>({downloadPDF:vi.fn(),previewPDF:vi.fn(),isGenerating:false}),renderBgnPreviewBlobUrl:vi.fn()}));
import ClmStep from '@/pages/azienda/climatizzazione/ClimatizzazioneWizard/StepPdf';
vi.mock('@/hooks/useClimatizzazioneProgetto',()=>({useEffectiveCompanyId:()=> 'azienda',useClmTemplatePdf:()=>({data:{cover_title:'Titolo aziendale corrente',usp:[] as never[],chi_siamo:''}})}));
vi.mock('@/hooks/useClimatizzazionePDF',()=>({useClimatizzazionePDF:()=>({downloadPDF:vi.fn(),previewPDF:vi.fn(),isGenerating:false}),renderClmPreviewBlobUrl:vi.fn()}));
import EleStep from '@/pages/azienda/elettrico/ElettricoWizard/StepPdf';
vi.mock('@/hooks/useElettricoProgetto',()=>({useEffectiveCompanyId:()=> 'azienda',useEleTemplatePdf:()=>({data:{cover_title:'Titolo aziendale corrente',usp:[] as never[],chi_siamo:''}})}));
vi.mock('@/hooks/useElettricoPDF',()=>({useElettricoPDF:()=>({downloadPDF:vi.fn(),previewPDF:vi.fn(),isGenerating:false}),renderElePreviewBlobUrl:vi.fn()}));
import PisStep from '@/pages/azienda/piscine/PiscineWizard/StepPdf';
vi.mock('@/hooks/usePiscineProgetto',()=>({useEffectiveCompanyId:()=> 'azienda',usePisTemplatePdf:()=>({data:{cover_title:'Titolo aziendale corrente',usp:[] as never[],chi_siamo:''}})}));
vi.mock('@/hooks/usePiscinePDF',()=>({usePiscinePDF:()=>({downloadPDF:vi.fn(),previewPDF:vi.fn(),isGenerating:false}),renderPisPreviewBlobUrl:vi.fn()}));
import IdrStep from '@/pages/azienda/termoidraulico/TermoidraulicoWizard/StepPdf';
vi.mock('@/hooks/useTermoidraulicoProgetto',()=>({useEffectiveCompanyId:()=> 'azienda',useIdrTemplatePdf:()=>({data:{cover_title:'Titolo aziendale corrente',usp:[] as never[],chi_siamo:''}})}));
vi.mock('@/hooks/useTermoidraulicoPDF',()=>({useTermoidraulicoPDF:()=>({downloadPDF:vi.fn(),previewPDF:vi.fn(),isGenerating:false}),renderIdrPreviewBlobUrl:vi.fn()}));
import TetStep from '@/pages/azienda/tetti/TettiWizard/StepPdf';
vi.mock('@/hooks/useTettiProgetto',()=>({useEffectiveCompanyId:()=> 'azienda',useTetTemplatePdf:()=>({data:{cover_title:'Titolo aziendale corrente',usp:[] as never[],chi_siamo:''}})}));
vi.mock('@/hooks/useTettiPDF',()=>({useTettiPDF:()=>({downloadPDF:vi.fn(),previewPDF:vi.fn(),isGenerating:false}),renderTetPreviewBlobUrl:vi.fn()}));
import PavStep from '@/pages/azienda/pavimenti/PavimentiWizard/StepPdf';
vi.mock('@/hooks/usePavimentiProgetto',()=>({useEffectiveCompanyId:()=> 'azienda',usePavTemplatePdf:()=>({data:{cover_title:'Titolo aziendale corrente',usp:[] as never[],chi_siamo:''}})}));
vi.mock('@/hooks/usePavimentiPDF',()=>({usePavimentiPDF:()=>({downloadPDF:vi.fn(),previewPDF:vi.fn(),isGenerating:false}),renderPavPreviewBlobUrl:vi.fn()}));
describe('Anteprima ristrutturazione',()=>{
 const snapshot={version:1,modulo:'ristrutturazione',companyId:'azienda',modelId:'pergola-bioclimatica',capturedAt:'2026-11-04T07:56:00Z',template:{company_id:'azienda',pdf_blocchi:{modulo_intervento:'pergola-bioclimatica'},pdf_cover_hero:'Titolo congelato del cliente',cover_title:'Titolo precedente',pdf_ordine_capitoli:['copertina'],usp:[]}};
 const progetto=(modello_snapshot:unknown)=>({company_id:'azienda',cliente_nome:'Demo',cliente_cognome:'Cliente',modello_snapshot} as unknown as ComponentProps<typeof RstStep>['progetto']);
 it('usa il modello congelato anche con aziendale differente',()=>{
  render(<RstStep progetto={progetto(snapshot)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo congelato del cliente')).toBeVisible();
  expect(screen.queryByText('Titolo aziendale corrente')).not.toBeInTheDocument();
 });
 it('conserva il modello aziendale per i preventivi storici senza snapshot',()=>{
  render(<RstStep progetto={progetto(null)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo aziendale corrente')).toBeVisible();
 });
 it('non usa un modello appartenente a un’altra azienda',()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {expect(()=>render(<RstStep progetto={progetto({...snapshot,companyId:'estranea'})} computo={[]} media={[]}/>)).toThrow(/azienda/);} finally {spy.mockRestore();}
 });
});
describe('Anteprima bagni',()=>{
 const snapshot={version:1,modulo:'bagni',companyId:'azienda',modelId:'completo',capturedAt:'2026-11-04T07:56:00Z',template:{company_id:'azienda',pdf_blocchi:{modulo_intervento:'completo'},pdf_cover_hero:'Titolo congelato del cliente',cover_title:'Titolo precedente',pdf_ordine_capitoli:['copertina'],usp:[]}};
 const progetto=(modello_snapshot:unknown)=>({company_id:'azienda',cliente_nome:'Demo',cliente_cognome:'Cliente',modello_snapshot} as unknown as ComponentProps<typeof BgnStep>['progetto']);
 it('usa il modello congelato anche con aziendale differente',()=>{
  render(<BgnStep progetto={progetto(snapshot)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo congelato del cliente')).toBeVisible();
  expect(screen.queryByText('Titolo aziendale corrente')).not.toBeInTheDocument();
 });
 it('conserva il modello aziendale per i preventivi storici senza snapshot',()=>{
  render(<BgnStep progetto={progetto(null)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo aziendale corrente')).toBeVisible();
 });
 it('non usa un modello appartenente a un’altra azienda',()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {expect(()=>render(<BgnStep progetto={progetto({...snapshot,companyId:'estranea'})} computo={[]} media={[]}/>)).toThrow(/azienda/);} finally {spy.mockRestore();}
 });
});
describe('Anteprima climatizzazione',()=>{
 const snapshot={version:1,modulo:'climatizzazione',companyId:'azienda',modelId:'monosplit',capturedAt:'2026-11-04T07:56:00Z',template:{company_id:'azienda',pdf_blocchi:{modulo_intervento:'monosplit'},pdf_cover_hero:'Titolo congelato del cliente',cover_title:'Titolo precedente',pdf_ordine_capitoli:['copertina'],usp:[]}};
 const progetto=(modello_snapshot:unknown)=>({company_id:'azienda',cliente_nome:'Demo',cliente_cognome:'Cliente',modello_snapshot} as unknown as ComponentProps<typeof ClmStep>['progetto']);
 it('usa il modello congelato anche con aziendale differente',()=>{
  render(<ClmStep progetto={progetto(snapshot)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo congelato del cliente')).toBeVisible();
  expect(screen.queryByText('Titolo aziendale corrente')).not.toBeInTheDocument();
 });
 it('conserva il modello aziendale per i preventivi storici senza snapshot',()=>{
  render(<ClmStep progetto={progetto(null)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo aziendale corrente')).toBeVisible();
 });
 it('non usa un modello appartenente a un’altra azienda',()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {expect(()=>render(<ClmStep progetto={progetto({...snapshot,companyId:'estranea'})} computo={[]} media={[]}/>)).toThrow(/azienda/);} finally {spy.mockRestore();}
 });
});
describe('Anteprima elettrico',()=>{
 const snapshot={version:1,modulo:'elettrico',companyId:'azienda',modelId:'completo',capturedAt:'2026-11-04T07:56:00Z',template:{company_id:'azienda',pdf_blocchi:{modulo_intervento:'completo'},pdf_cover_hero:'Titolo congelato del cliente',cover_title:'Titolo precedente',pdf_ordine_capitoli:['copertina'],usp:[]}};
 const progetto=(modello_snapshot:unknown)=>({company_id:'azienda',cliente_nome:'Demo',cliente_cognome:'Cliente',modello_snapshot} as unknown as ComponentProps<typeof EleStep>['progetto']);
 it('usa il modello congelato anche con aziendale differente',()=>{
  render(<EleStep progetto={progetto(snapshot)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo congelato del cliente')).toBeVisible();
  expect(screen.queryByText('Titolo aziendale corrente')).not.toBeInTheDocument();
 });
 it('conserva il modello aziendale per i preventivi storici senza snapshot',()=>{
  render(<EleStep progetto={progetto(null)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo aziendale corrente')).toBeVisible();
 });
 it('non usa un modello appartenente a un’altra azienda',()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {expect(()=>render(<EleStep progetto={progetto({...snapshot,companyId:'estranea'})} computo={[]} media={[]}/>)).toThrow(/azienda/);} finally {spy.mockRestore();}
 });
});
describe('Anteprima piscine',()=>{
 const snapshot={version:1,modulo:'piscine',companyId:'azienda',modelId:'nuova',capturedAt:'2026-11-04T07:56:00Z',template:{company_id:'azienda',pdf_blocchi:{modulo_intervento:'nuova'},pdf_cover_hero:'Titolo congelato del cliente',cover_title:'Titolo precedente',pdf_ordine_capitoli:['copertina'],usp:[]}};
 const progetto=(modello_snapshot:unknown)=>({company_id:'azienda',cliente_nome:'Demo',cliente_cognome:'Cliente',modello_snapshot} as unknown as ComponentProps<typeof PisStep>['progetto']);
 it('usa il modello congelato anche con aziendale differente',()=>{
  render(<PisStep progetto={progetto(snapshot)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo congelato del cliente')).toBeVisible();
  expect(screen.queryByText('Titolo aziendale corrente')).not.toBeInTheDocument();
 });
 it('conserva il modello aziendale per i preventivi storici senza snapshot',()=>{
  render(<PisStep progetto={progetto(null)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo aziendale corrente')).toBeVisible();
 });
 it('non usa un modello appartenente a un’altra azienda',()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {expect(()=>render(<PisStep progetto={progetto({...snapshot,companyId:'estranea'})} computo={[]} media={[]}/>)).toThrow(/azienda/);} finally {spy.mockRestore();}
 });
});
describe('Anteprima termoidraulico',()=>{
 const snapshot={version:1,modulo:'termoidraulico',companyId:'azienda',modelId:'caldaia',capturedAt:'2026-11-04T07:56:00Z',template:{company_id:'azienda',pdf_blocchi:{modulo_intervento:'caldaia'},pdf_cover_hero:'Titolo congelato del cliente',cover_title:'Titolo precedente',pdf_ordine_capitoli:['copertina'],usp:[]}};
 const progetto=(modello_snapshot:unknown)=>({company_id:'azienda',cliente_nome:'Demo',cliente_cognome:'Cliente',modello_snapshot} as unknown as ComponentProps<typeof IdrStep>['progetto']);
 it('usa il modello congelato anche con aziendale differente',()=>{
  render(<IdrStep progetto={progetto(snapshot)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo congelato del cliente')).toBeVisible();
  expect(screen.queryByText('Titolo aziendale corrente')).not.toBeInTheDocument();
 });
 it('conserva il modello aziendale per i preventivi storici senza snapshot',()=>{
  render(<IdrStep progetto={progetto(null)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo aziendale corrente')).toBeVisible();
 });
 it('non usa un modello appartenente a un’altra azienda',()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {expect(()=>render(<IdrStep progetto={progetto({...snapshot,companyId:'estranea'})} computo={[]} media={[]}/>)).toThrow(/azienda/);} finally {spy.mockRestore();}
 });
});
describe('Anteprima tetti',()=>{
 const snapshot={version:1,modulo:'tetti',companyId:'azienda',modelId:'rifacimento',capturedAt:'2026-11-04T07:56:00Z',template:{company_id:'azienda',pdf_blocchi:{modulo_intervento:'rifacimento'},pdf_cover_hero:'Titolo congelato del cliente',cover_title:'Titolo precedente',pdf_ordine_capitoli:['copertina'],usp:[]}};
 const progetto=(modello_snapshot:unknown)=>({company_id:'azienda',cliente_nome:'Demo',cliente_cognome:'Cliente',modello_snapshot} as unknown as ComponentProps<typeof TetStep>['progetto']);
 it('usa il modello congelato anche con aziendale differente',()=>{
  render(<TetStep progetto={progetto(snapshot)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo congelato del cliente')).toBeVisible();
  expect(screen.queryByText('Titolo aziendale corrente')).not.toBeInTheDocument();
 });
 it('conserva il modello aziendale per i preventivi storici senza snapshot',()=>{
  render(<TetStep progetto={progetto(null)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo aziendale corrente')).toBeVisible();
 });
 it('non usa un modello appartenente a un’altra azienda',()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {expect(()=>render(<TetStep progetto={progetto({...snapshot,companyId:'estranea'})} computo={[]} media={[]}/>)).toThrow(/azienda/);} finally {spy.mockRestore();}
 });
});
describe('Anteprima pavimenti',()=>{
 const snapshot={version:1,modulo:'pavimenti',companyId:'azienda',modelId:'giardino',capturedAt:'2026-11-04T07:56:00Z',template:{company_id:'azienda',pdf_blocchi:{modulo_intervento:'giardino'},pdf_cover_hero:'Titolo congelato del cliente',cover_title:'Titolo precedente',pdf_ordine_capitoli:['copertina'],usp:[]}};
 const progetto=(modello_snapshot:unknown)=>({company_id:'azienda',cliente_nome:'Demo',cliente_cognome:'Cliente',modello_snapshot} as unknown as ComponentProps<typeof PavStep>['progetto']);
 it('usa il modello congelato anche con aziendale differente',()=>{
  render(<PavStep progetto={progetto(snapshot)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo congelato del cliente')).toBeVisible();
  expect(screen.queryByText('Titolo aziendale corrente')).not.toBeInTheDocument();
 });
 it('conserva il modello aziendale per i preventivi storici senza snapshot',()=>{
  render(<PavStep progetto={progetto(null)} computo={[]} media={[]}/>);
  expect(screen.getByText('Titolo aziendale corrente')).toBeVisible();
 });
 it('non usa un modello appartenente a un’altra azienda',()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {expect(()=>render(<PavStep progetto={progetto({...snapshot,companyId:'estranea'})} computo={[]} media={[]}/>)).toThrow(/azienda/);} finally {spy.mockRestore();}
 });
});
