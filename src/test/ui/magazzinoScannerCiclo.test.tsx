import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({open:vi.fn(),stop:vi.fn(),decode:vi.fn(),reset:vi.fn()}));
vi.mock('@/lib/scanner/cameraStream',()=>({openScannerStream:state.open,stopStream:state.stop,isTorchSupported:()=>false,setTorch:vi.fn(),pulseFocus:vi.fn()}));
vi.mock('@zxing/library',()=>({BrowserMultiFormatReader:class {reset=state.reset;decodeFromStream=state.decode;}}));
vi.mock('@/lib/mobile/native-haptics',()=>({impactFeedback:vi.fn()}));
vi.mock('sonner',()=>({toast:{error:vi.fn()}}));
import { useBatchScannerCamera } from '@/hooks/warehouse/useBatchScannerCamera';
beforeEach(()=>{vi.clearAllMocks();state.open.mockReset();state.decode.mockReset().mockResolvedValue(undefined);});afterEach(()=>vi.restoreAllMocks());
it('ferma uno stream arrivato dopo la chiusura senza avviare il decoder',async()=>{
 let ready!:(s:MediaStream)=>void;state.open.mockImplementation(()=>new Promise(r=>{ready=r;}));
 const opts={open:true,manualMode:false,onScan:vi.fn()};const {rerender}=renderHook(p=>useBatchScannerCamera(p),{initialProps:opts});rerender({...opts,open:false});
 const stream={} as MediaStream;await act(async()=>{ready(stream);});expect(state.stop).toHaveBeenCalledWith(stream);expect(state.decode).not.toHaveBeenCalled();
});
it('ignora un permesso negato arrivato dopo la chiusura',async()=>{
 let reject!:(e:Error)=>void;state.open.mockImplementation(()=>new Promise((_,r)=>{reject=r;}));const onCameraError=vi.fn();
 const opts={open:true,manualMode:false,onScan:vi.fn(),onCameraError};const {result,rerender}=renderHook(p=>useBatchScannerCamera(p),{initialProps:opts});rerender({...opts,open:false});
 await act(async()=>{reject(new DOMException('Denied','NotAllowedError'));});expect(onCameraError).not.toHaveBeenCalled();expect(result.current.cameraError).toBeNull();
});
it('non riattiva polling e decoder se si chiude durante video.play',async()=>{
 const stream={} as MediaStream;state.open.mockResolvedValue(stream);let played!:()=>void;
 const video=document.createElement('video');Object.defineProperty(video,'readyState',{value:2});video.play=vi.fn(()=>new Promise<void>(r=>{played=r;}));
 const poll=vi.spyOn(globalThis,'setInterval');const opts={open:true,manualMode:false,onScan:vi.fn()};const {result,rerender}=renderHook(p=>useBatchScannerCamera(p),{initialProps:opts});
 Object.defineProperty(result.current.videoRef,'current',{value:video,writable:true});await act(async()=>{});rerender({...opts,open:false});await act(async()=>played());expect(poll).not.toHaveBeenCalled();expect(state.decode).not.toHaveBeenCalled();
});

async function liveCamera(extra: {paused?: boolean; onCameraError?: () => void} = {}) {
 const stream={} as MediaStream;state.open.mockResolvedValue(stream);
 const video=document.createElement('video');Object.defineProperty(video,'readyState',{value:2});video.play=vi.fn().mockResolvedValue(undefined);
 const opts={open:true,manualMode:false,onScan:vi.fn(),...extra};const hook=renderHook(p=>useBatchScannerCamera(p),{initialProps:opts});
 Object.defineProperty(hook.result.current.videoRef,'current',{value:video,writable:true});
 await act(async()=>{});return {...hook,opts,stream};
}
it('pausa la fotocamera senza lasciare attivi stream e anteprima, poi la riapre',async()=>{
 const hook=await liveCamera();await waitFor(()=>expect(hook.result.current.cameraReady).toBe(true));
 hook.rerender({...hook.opts,paused:true});expect(state.stop).toHaveBeenCalledWith(hook.stream);expect(hook.result.current.cameraReady).toBe(false);
 hook.rerender({...hook.opts,paused:false});await waitFor(()=>expect(state.open).toHaveBeenCalledTimes(2));hook.unmount();
});
it('chiude la fotocamera in background e la riavvia quando la pagina torna visibile',async()=>{
 let visibility:DocumentVisibilityState='visible';vi.spyOn(document,'visibilityState','get').mockImplementation(()=>visibility);
 const hook=await liveCamera();await waitFor(()=>expect(hook.result.current.cameraReady).toBe(true));
 act(()=>{visibility='hidden';document.dispatchEvent(new Event('visibilitychange'));});expect(state.stop).toHaveBeenCalledWith(hook.stream);expect(hook.result.current.cameraReady).toBe(false);
 act(()=>{visibility='visible';document.dispatchEvent(new Event('visibilitychange'));});await waitFor(()=>expect(state.open).toHaveBeenCalledTimes(2));hook.unmount();
});
it('recupera anche il rifiuto asincrono del decoder e libera la fotocamera',async()=>{
 state.decode.mockRejectedValue(new Error('Decoder failed'));const onCameraError=vi.fn();const hook=await liveCamera({onCameraError});
 await waitFor(()=>expect(onCameraError).toHaveBeenCalledOnce());expect(hook.result.current.cameraError).toContain('Lettura del codice');expect(state.stop).toHaveBeenCalledWith(hook.stream);hook.unmount();
});
