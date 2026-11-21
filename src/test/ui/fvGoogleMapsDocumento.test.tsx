import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preparaMappeDocumentoFv } from "../../lib/fotovoltaico/googleMapsDocumento";
const mocks=vi.hoisted(()=>({load:vi.fn(),auth:[] as Array<()=>void>,maps:[] as Array<{host:HTMLElement;options:Record<string,unknown>;events:Record<string,()=>void>;unbindAll:ReturnType<typeof vi.fn>}>}));
vi.mock("@/components/fotovoltaico/tetto/googleMapsJsFv",()=>({caricaGoogleMapsFv:mocks.load,ascoltaErroreGoogleFv:(fn:()=>void)=>{mocks.auth.push(fn);return()=>{mocks.auth=mocks.auth.filter(f=>f!==fn);};}}));
beforeEach(()=>{
  vi.useFakeTimers();mocks.load.mockReset();mocks.maps=[];mocks.auth=[];
  class Map {events:Record<string,()=>void>={};unbindAll=vi.fn();constructor(public host:HTMLElement,public options:Record<string,unknown>){mocks.maps.push(this);}getCenter(){return{toJSON:()=>this.options.center};}getZoom(){return this.options.zoom;}addListener(name:string,fn:()=>void){this.events[name]=fn;return{remove:()=>{delete this.events[name];}};}}
  mocks.load.mockResolvedValue({Map});
});
afterEach(()=>{vi.useRealTimers();document.body.innerHTML="";});
function documento(){const d=document.implementation.createHTMLDocument("PDF");d.body.innerHTML=`<div data-fv-google-pdf="${encodeURIComponent(JSON.stringify({centro:{lat:45.46378,lng:9.18983},zoom:20,w:640,h:440}))}"><div data-fv-google-frame><div data-fv-google-map></div><svg data-overlay><polygon points="1,2 3,4 5,6"/></svg></div><p data-fv-google-status>Attendi</p></div>`;return d;}
describe("Google nel documento: caricamento reale prima della stampa",()=>{
  it("usa il massimo locale e riproietta l'overlay invece di stampare tile grigie",async()=>{
    const api=await mocks.load();
    api.MaxZoomService=class {getMaxZoomAtLatLng(_c:unknown,cb:(r:{status:string;zoom:number})=>void){cb({status:"OK",zoom:20});}};
    const d=documento(),host=d.querySelector<HTMLElement>('[data-fv-google-pdf]')!;
    host.dataset.fvGooglePdf=encodeURIComponent(JSON.stringify({centro:{lat:45.46378,lng:9.18983},zoom:21,w:640,h:440}));
    const p=preparaMappeDocumentoFv(d);await vi.advanceTimersByTimeAsync(1);
    expect(mocks.maps[0].options).toMatchObject({zoom:20,minZoom:20,maxZoom:20});
    expect(d.querySelector('[data-fv-google-scale]')?.getAttribute('transform')).toBe('translate(320 220) scale(0.5) translate(-320 -220)');
    mocks.maps[0].events.tilesloaded();const cleanup=await p;
    expect(host.dataset.fvGoogleZoom).toBe('20');
    expect(d.querySelector('[data-overlay] polygon')?.getAttribute('points')).toBe('1,2 3,4 5,6');
    cleanup();expect(d.querySelector('[data-fv-google-scale]')).toBeNull();
    expect(d.querySelector('[data-overlay] polygon')?.getAttribute('points')).toBe('1,2 3,4 5,6');
  });
  it("se i metadati Google falliscono usa zoom 20 e attende comunque le immagini reali",async()=>{
    const api=await mocks.load();
    api.MaxZoomService=class {getMaxZoomAtLatLng(_c:unknown,cb:(r:{status:string})=>void){cb({status:"ERROR"});}};
    const d=documento(),p=preparaMappeDocumentoFv(d);await vi.advanceTimersByTimeAsync(1);
    expect(mocks.maps[0].options.zoom).toBe(20);
    expect(d.querySelector('[data-fv-google-ready]')).toBeNull();
    mocks.maps[0].events.tilesloaded();(await p)();
  });
  it("il timeout dei metadati non impedisce di preparare la foto, senza segnalarla pronta prima delle tile",async()=>{
    const api=await mocks.load();
    api.MaxZoomService=class {getMaxZoomAtLatLng(){}};
    const d=documento(),p=preparaMappeDocumentoFv(d);await vi.advanceTimersByTimeAsync(5001);
    expect(mocks.maps[0].options.zoom).toBe(20);
    expect(d.querySelector('[data-fv-google-ready]')).toBeNull();
    mocks.maps[0].events.tilesloaded();const cleanup=await p;
    expect(d.querySelector('[data-fv-google-ready="true"]')).not.toBeNull();cleanup();
  });
  it("non carica Google se la vista non è nel documento",async()=>{await preparaMappeDocumentoFv(document);expect(mocks.load).not.toHaveBeenCalled();});
  it("usa lo stesso SDK e la camera salvata, conserva overlay e attribuzioni e attende tilesloaded",async()=>{
    const d=documento(),done=vi.fn();const p=preparaMappeDocumentoFv(d).then(fn=>{done();return fn;});
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.maps).toHaveLength(1);expect(done).not.toHaveBeenCalled();
    expect(mocks.maps[0].host.ownerDocument).toBe(d);
    expect(mocks.maps[0].options).toMatchObject({center:{lat:45.46378,lng:9.18983},zoom:20,mapTypeId:"satellite",renderingType:"RASTER",tilt:0,heading:0});
    mocks.maps[0].events.tilesloaded();const cleanup=await p;
    expect(d.querySelector('[data-fv-google-ready="true"]')).not.toBeNull();
    expect(d.querySelector('[data-overlay] polygon')?.getAttribute('points')).toBe('1,2 3,4 5,6');
    expect(d.querySelector('[data-fv-google-status]')?.hasAttribute('hidden')).toBe(true);
    cleanup();expect(mocks.maps[0].unbindAll).toHaveBeenCalled();
  });
  it("non segna la foto pronta se Google non risponde e permette un nuovo tentativo",async()=>{
    const d=documento();const p=preparaMappeDocumentoFv(d);const rejected=expect(p).rejects.toThrow("non sono arrivate");
    await vi.advanceTimersByTimeAsync(20001);await rejected;
    expect(d.querySelector('[data-fv-google-ready]')).toBeNull();
    const retry=preparaMappeDocumentoFv(d);await vi.advanceTimersByTimeAsync(1);mocks.maps.at(-1)!.events.tilesloaded();(await retry)();
  });
  it("non segna la foto pronta quando Google rifiuta l’autenticazione",async()=>{
    const d=documento();const p=preparaMappeDocumentoFv(d);const rejected=expect(p).rejects.toThrow("non ha autorizzato");
    await vi.advanceTimersByTimeAsync(1);mocks.auth[0]();await rejected;
    expect(d.querySelector('[data-fv-google-ready]')).toBeNull();
  });
  it.each(["pronta", "timeout"])("prepara anche la stampa fuori vista e ripristina pagina e iframe (%s)",async esito=>{
    const iframe=document.createElement("iframe");
    iframe.style.cssText="position:fixed;left:-10000px;top:12px;width:794px;height:1123px";
    document.body.appendChild(iframe);
    vi.spyOn(iframe,"getBoundingClientRect").mockReturnValue({left:-10000,right:-9206,top:12,bottom:1135,width:794,height:1123,x:-10000,y:12,toJSON:()=>({})});
    const d=iframe.contentDocument!,win=iframe.contentWindow!;
    d.body.innerHTML=documento().body.innerHTML;
    const scroll=vi.spyOn(win,"scrollTo").mockImplementation(()=>{});
    Object.defineProperty(win,"scrollY",{value:123,configurable:true});
    vi.spyOn(d.querySelector('[data-fv-google-pdf]')!,"getBoundingClientRect").mockReturnValue({left:0,right:640,top:5000,bottom:5440,width:640,height:440,x:0,y:5000,toJSON:()=>({})});
    const p=preparaMappeDocumentoFv(d);
    const rejected=esito==="timeout" ? expect(p).rejects.toThrow("non sono arrivate") : null;
    await vi.advanceTimersByTimeAsync(1);
    expect(iframe.style.left).toBe("0px");expect(iframe.style.opacity).toBe("0");
    expect(scroll).toHaveBeenCalledWith({left:0,top:5099,behavior:"instant"});
    if(esito==="pronta"){mocks.maps[0].events.tilesloaded();(await p)();}
    else {await vi.advanceTimersByTimeAsync(20001);await rejected;}
    expect(scroll).toHaveBeenLastCalledWith({left:0,top:123,behavior:"instant"});
    expect(iframe.style.left).toBe("-10000px");expect(iframe.style.top).toBe("12px");expect(iframe.style.opacity).toBe("");
  });
});
