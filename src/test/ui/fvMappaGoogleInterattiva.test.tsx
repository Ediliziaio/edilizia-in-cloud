import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MappaGoogleFv } from "@/components/fotovoltaico/tetto/MappaGoogleFv";
const mocks = vi.hoisted(() => ({
  carica: vi.fn(),
  auth: vi.fn(),
  istanze: [] as Array<Record<string, unknown>>,
  resize: null as (() => void) | null,
  authCallback: null as (() => void) | null,
}));
vi.mock(
  "@/components/fotovoltaico/tetto/googleMapsJsFv",
  () => ({
    caricaGoogleMapsFv: mocks.carica,
    ascoltaErroreGoogleFv: (f: () => void) => {
      mocks.authCallback = f;
      return mocks.auth;
    },
  }),
);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.istanze = [];
  mocks.authCallback = null;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(f: () => void) {
        mocks.resize = f;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    { width: 375, height: 257.8125 } as DOMRect,
  );
  class Map {
    centro = { lat: 45, lng: 9 };
    zoom = 20;
    callbacks: Record<string, () => void> = {};
    remove = vi.fn();
    unbindAll = vi.fn();
    constructor(_h: unknown, public options: Record<string, unknown>) {
      this.centro = options.center as typeof this.centro;
      this.zoom = options.zoom as number;
      mocks.istanze.push(this as unknown as Record<string, unknown>);
    }
    getCenter() {
      return { toJSON: () => this.centro };
    }
    getZoom() {
      return this.zoom;
    }
    setCenter = vi.fn((p: typeof this.centro) => {
      this.centro = p;
    });
    setZoom = vi.fn((z: number) => {
      this.zoom = z;
    });
    setOptions = vi.fn();
    addListener(e: string, f: () => void) {
      this.callbacks[e] = f;
      return { remove: this.remove };
    }
  }
  mocks.carica.mockResolvedValue({ Map });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("mappa nativa del tetto", () => {
  const props = () => ({
    centro: { lat: 45, lng: 9 },
    zoom: 20,
    comandoVista: 0,
    navigabile: false,
    onVista: vi.fn(),
    onStato: vi.fn(),
    onDimensioni: vi.fn(),
  });
  it("limita lo zoom al dettaglio disponibile e riallinea la camera del disegno", async () => {
    const api=await mocks.carica();
    api.MaxZoomService=class {getMaxZoomAtLatLng(_c:unknown,cb:(r:{status:string;zoom:number})=>void){cb({status:"OK",zoom:20});}};
    const p={...props(),zoom:21};const r=render(<MappaGoogleFv {...p}/>);
    await waitFor(()=>expect(p.onVista).toHaveBeenCalledWith(p.centro,20));
    const map=mocks.istanze[0] as unknown as {zoom:number;setOptions:ReturnType<typeof vi.fn>;setZoom:ReturnType<typeof vi.fn>};
    expect(map.setOptions).toHaveBeenCalledWith({maxZoom:20,minZoom:17});expect(map.zoom).toBe(20);
    p.onVista.mockClear();r.rerender(<MappaGoogleFv {...p} comandoVista={1}/>);
    await waitFor(()=>expect(p.onVista).toHaveBeenCalledWith(p.centro,20));expect(map.zoom).toBe(20);
  });
  it("una risposta sullo zoom arrivata tardi non annulla un pan nativo",async()=>{
    const api=await mocks.carica();let rispondi!: (r:{status:string;zoom:number})=>void;
    api.MaxZoomService=class {getMaxZoomAtLatLng(_c:unknown,cb:typeof rispondi){rispondi=cb;}};
    const p=props();render(<MappaGoogleFv {...p}/>);
    await waitFor(()=>expect(mocks.istanze).toHaveLength(1));
    const map=mocks.istanze[0] as unknown as {centro:{lat:number;lng:number};callbacks:Record<string,()=>void>;setCenter:ReturnType<typeof vi.fn>};
    const nuovo={lat:45.002,lng:9.002};
    await act(async()=>{map.centro=nuovo;map.callbacks.bounds_changed();rispondi({status:"OK",zoom:20});await Promise.resolve();});
    expect(map.centro).toEqual(nuovo);expect(map.setCenter).not.toHaveBeenCalled();
  });
  it("conserva l’ultima camera nativa quando React riceve in ritardo la vista precedente", async () => {
    const p = props(), r = render(<MappaGoogleFv {...p} />);
    await waitFor(() => expect(mocks.istanze).toHaveLength(1));
    const map = mocks.istanze[0] as unknown as {
      centro: { lat: number; lng: number };
      zoom: number;
      callbacks: Record<string, () => void>;
      setCenter: ReturnType<typeof vi.fn>;
      setZoom: ReturnType<typeof vi.fn>;
    };
    const intermedia = { lat: 45.001, lng: 9.001 },
      finale = { lat: 45.002, lng: 9.002 };
    act(() => {
      map.centro = intermedia;
      map.callbacks.bounds_changed();
    });
    // Google avanza ancora prima che il parent riesca a riflettere la prima vista.
    act(() => {
      map.centro = finale;
      map.zoom = 21;
      map.callbacks.bounds_changed();
    });
    r.rerender(<MappaGoogleFv {...p} centro={intermedia} zoom={20} />);
    expect(map.centro).toEqual(finale);
    expect(map.zoom).toBe(21);
    expect(map.setCenter).not.toHaveBeenCalled();
    expect(map.setZoom).not.toHaveBeenCalled();
  });
  it("usa il viewport reale, aggiorna la camera senza ricreare Maps e rimuove i listener", async () => {
    const p = props(), r = render(<MappaGoogleFv {...p} />);
    await waitFor(() => expect(mocks.istanze).toHaveLength(1));
    const map = mocks.istanze[0] as unknown as {
      options: Record<string, unknown>;
      callbacks: Record<string, () => void>;
      setCenter: ReturnType<typeof vi.fn>;
      setZoom: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      unbindAll: ReturnType<typeof vi.fn>;
    };
    expect(p.onDimensioni).toHaveBeenCalledWith({ w: 375, h: 257.8125 });
    expect(map.options).toMatchObject({
      mapTypeId: "satellite",
      tilt: 0,
      heading: 0,
      isFractionalZoomEnabled: false,
    });
    act(() => map.callbacks.tilesloaded());
    expect(p.onStato).toHaveBeenLastCalledWith({
      caricando: false,
      pronto: true,
      errore: "",
    });
    r.rerender(
      <MappaGoogleFv
        {...p}
        centro={{ lat: 46, lng: 10 }}
        zoom={19}
        comandoVista={1}
        navigabile
      />,
    );
    expect(mocks.istanze).toHaveLength(1);
    expect(map.setCenter).toHaveBeenCalledWith({ lat: 46, lng: 10 });
    expect(map.setZoom).toHaveBeenCalledWith(19);
    act(() => map.callbacks.bounds_changed());
    expect(p.onVista).toHaveBeenCalledWith({ lat: 46, lng: 10 }, 19);
    r.unmount();
    expect(map.remove).toHaveBeenCalledTimes(2);
    expect(map.unbindAll).toHaveBeenCalledOnce();
    expect(mocks.auth).toHaveBeenCalledOnce();
  });
  it("non lascia caricamento infinito quando le immagini non arrivano", async () => {
    vi.useFakeTimers();
    const p = props();
    render(<MappaGoogleFv {...p} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20001);
    });
    expect(p.onStato).toHaveBeenLastCalledWith(
      expect.objectContaining({
        caricando: false,
        pronto: false,
        errore: expect.stringContaining("immagini"),
      }),
    );
  });
  it("un evento immagini successivo non nasconde il rifiuto di Google", async () => {
    const p = props();
    render(<MappaGoogleFv {...p} />);
    await waitFor(() => expect(mocks.istanze).toHaveLength(1));
    act(() => {
      mocks.authCallback!();
      (mocks.istanze[0].callbacks as Record<string, () => void>).tilesloaded();
    });
    expect(p.onStato).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pronto: false,
        errore: expect.stringContaining("autorizzato"),
      }),
    );
  });
});
