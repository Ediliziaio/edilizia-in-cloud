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
});
