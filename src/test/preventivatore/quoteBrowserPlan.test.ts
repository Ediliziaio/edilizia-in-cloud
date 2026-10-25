import {beforeEach,describe,it,expect,vi} from 'vitest';
import {readPlanInBrowser} from '@/lib/preventivi/quoteBrowserPlan';
import {readPlanReading} from '@/lib/preventivi/planReading';
const mock=vi.hoisted(()=>({pages:2,destroy:vi.fn(),getDocument:vi.fn(),dimensions:vi.fn()}));
vi.mock('@/lib/preventivi/quoteVision',()=>({localImageDimensions:mock.dimensions}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url',()=>({default:'worker-local.js'}));
vi.mock('pdfjs-dist',()=>({GlobalWorkerOptions:{workerSrc:''},getDocument:mock.getDocument}));
const pdf=()=>new Blob(['%PDF-1.7 synthetic'],{type:'application/pdf'});
const signal=()=>new AbortController().signal;
beforeEach(()=>{
  vi.clearAllMocks();mock.pages=2;mock.dimensions.mockResolvedValue({width:1000,height:600});
  mock.getDocument.mockImplementation(()=>({destroy:mock.destroy,promise:Promise.resolve({numPages:mock.pages,getPage:async()=>({
    getViewport:()=>({width:100,height:200,convertToViewportPoint:(x:number,y:number)=>[x,200-y]}),
    streamTextContent:()=>new ReadableStream({start(c){c.enqueue({items:[{str:'Bagno',transform:[1,0,0,1,10,180],width:30,height:10}]});c.close();}})
  })})}));
});
describe('Web attachments without a local OCR server',()=>{
  it('extracts selected PDF text locally and preserves a truthful engine',async()=>{
    const reading=await readPlanInBrowser(pdf(),2,signal());
    expect(readPlanReading(reading)).toEqual(reading);expect(reading).toMatchObject({engine:'Testo PDF nel browser',page:2,pages:2,lines:[{text:'Bagno',bbox:[.1,.05,.3,.05]}]});
    expect(mock.getDocument.mock.calls[0][0]).toMatchObject({disableAutoFetch:true});expect(mock.getDocument.mock.calls[0][0].data).toBeInstanceOf(Uint8Array);expect(mock.destroy).toHaveBeenCalledOnce();
  });
  it('prepares images without claiming OCR or starting a provider call',async()=>{
    const png=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0])],{type:'image/png'});
    expect(await readPlanInBrowser(png,1,signal())).toMatchObject({engine:'Immagine nel browser',lines:[],pages:1});expect(mock.getDocument).not.toHaveBeenCalled();
  });
  it('rejects excessive pages and still releases the document',async()=>{
    mock.pages=21;await expect(readPlanInBrowser(pdf(),1,signal())).rejects.toThrow('20 pagine');expect(mock.destroy).toHaveBeenCalledOnce();
  });
  it('rejects invalid signatures, pages and cancellation before decoding',async()=>{
    await expect(readPlanInBrowser(new Blob(['not a drawing']),1,signal())).rejects.toThrow('PNG');
    await expect(readPlanInBrowser(pdf(),21,signal())).rejects.toThrow('limiti');
    const c=new AbortController();c.abort();await expect(readPlanInBrowser(pdf(),1,c.signal)).rejects.toThrow();expect(mock.getDocument).not.toHaveBeenCalled();
  });
});
