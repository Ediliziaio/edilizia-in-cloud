import {afterEach,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {caricaModelloLocale,rilasciaModello} from '@/components/fotovoltaico/tetto/importaModello';
import {ALLINEAMENTO_BASE} from '@/components/fotovoltaico/tetto/rilievoLocale';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('legge un GLB con texture incorporate anche quando la CSP vieta fetch su blob',async()=>{
 const rete=vi.fn(()=>{throw Error('connect-src vieta blob:');});vi.stubGlobal('fetch',rete);
 vi.stubGlobal('createImageBitmap',vi.fn());
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:http://localhost/texture-glb');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 const bitmap=vi.spyOn(THREE.ImageBitmapLoader.prototype,'load');
 const immagini=vi.spyOn(THREE.TextureLoader.prototype,'load').mockImplementation((url,onLoad?: (texture:THREE.Texture<HTMLImageElement>)=>void)=>{const t=new THREE.Texture(document.createElement('img'));queueMicrotask(()=>onLoad?.(t));return t;});
 const bytes=readFileSync('public/templates/fotovoltaico/examples/casa-test.glb');
 // Il buffer deve appartenere allo stesso realm del parser nel browser jsdom.
 const f={name:'casa.glb',size:bytes.length,arrayBuffer:async()=>{const out=new ArrayBuffer(bytes.length);new Uint8Array(out).set(bytes);return out;}} as File;
 const modello=await caricaModelloLocale({nome:f.name,files:[f],allineamento:ALLINEAMENTO_BASE});
 expect(modello.children.length).toBeGreaterThan(0);expect(immagini).toHaveBeenCalled();expect(bitmap).not.toHaveBeenCalled();expect(rete).not.toHaveBeenCalled();rilasciaModello(modello);
});
