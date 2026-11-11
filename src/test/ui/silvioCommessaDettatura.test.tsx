import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DETTATURA_MAX_SECONDI, useDettatura } from "@/components/silvio-commessa/useDettatura";

const differita = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
let costruzioneFallisce = false;
let avvioFallisce = false;
let vuoto = false;
const registratori: Registratore[] = [];
class Registratore {
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public stream: MediaStream) {
    if (costruzioneFallisce) throw new Error("Recorder non disponibile");
    registratori.push(this);
  }
  start() { if (avvioFallisce) throw new Error("Avvio fallito"); this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(vuoto ? [] : ["audio sintetico"]) });
    this.onstop?.();
  }
}
let stop: ReturnType<typeof vi.fn>;
let flusso: MediaStream;
let acquisisci: ReturnType<typeof vi.fn>;
const trascrivi = vi.fn(async () => "Lavoro trascritto di prova");
const onTesto = vi.fn();
const apri = (prima?: () => Promise<string | null>, strict = false) => renderHook(() => useDettatura(trascrivi, onTesto, prima),
  strict ? { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> } : {});
const avvia = async (r: ReturnType<typeof apri>) => { await act(async () => r.result.current.tocca()); };

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  costruzioneFallisce = avvioFallisce = vuoto = false;
  registratori.length = 0;
  stop = vi.fn();
  flusso = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  acquisisci = vi.fn(async () => flusso);
  vi.stubGlobal("MediaRecorder", Registratore);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: acquisisci } });
  trascrivi.mockResolvedValue("Lavoro trascritto di prova");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Dettatura senza microfono reale", () => {
  it("registra, ferma e prepara un solo testo; la traccia viene chiusa", async () => {
    const r = apri(); await avvia(r);
    expect(r.result.current.registra).toBe(true);
    await avvia(r);
    expect(trascrivi).toHaveBeenCalledOnce();
    expect(onTesto).toHaveBeenCalledWith("Lavoro trascritto di prova");
    expect(stop).toHaveBeenCalledOnce();
    expect(r.result.current.trascrive).toBe(false);
  });
  it("un doppio clic durante il controllo crediti non apre due microfoni", async () => {
    const credito = differita<string | null>(); const prima = vi.fn(() => credito.promise);
    const r = apri(prima);
    act(() => { r.result.current.tocca(); r.result.current.tocca(); });
    expect(r.result.current.avviando).toBe(true); expect(prima).toHaveBeenCalledOnce();
    await act(async () => credito.resolve(null));
    expect(acquisisci).toHaveBeenCalledOnce(); expect(registratori).toHaveLength(1);
  });
  it("una richiesta di permesso in corso non si duplica", async () => {
    const permesso = differita<MediaStream>(); acquisisci.mockReturnValue(permesso.promise);
    const r = apri(); await avvia(r); await avvia(r);
    expect(acquisisci).toHaveBeenCalledOnce();
    await act(async () => permesso.resolve(flusso));
    expect(registratori).toHaveLength(1);
  });
  it("se si chiude durante il controllo crediti non chiede il microfono", async () => {
    const credito = differita<string | null>(); const r = apri(() => credito.promise);
    act(() => r.result.current.tocca()); r.unmount();
    await act(async () => credito.resolve(null));
    expect(acquisisci).not.toHaveBeenCalled();
  });
  it("se il permesso arriva dopo la chiusura ferma subito tutte le tracce", async () => {
    const permesso = differita<MediaStream>(); acquisisci.mockReturnValue(permesso.promise);
    const r = apri(); await avvia(r); r.unmount();
    await act(async () => permesso.resolve(flusso));
    expect(stop).toHaveBeenCalledOnce(); expect(registratori).toHaveLength(0);
  });
  it("chiudere mentre registra non trascrive audio parziale", async () => {
    const r = apri(); await avvia(r); r.unmount();
    expect(stop).toHaveBeenCalledOnce(); expect(trascrivi).not.toHaveBeenCalled();
  });
  it("una trascrizione conclusa dopo la chiusura non cambia il testo", async () => {
    const testo = differita<string>(); trascrivi.mockReturnValue(testo.promise);
    const r = apri(); await avvia(r); await avvia(r);
    expect(r.result.current.trascrive).toBe(true); r.unmount();
    await act(async () => testo.resolve("non inserire"));
    expect(onTesto).not.toHaveBeenCalled();
  });
  it("funziona anche con il replay degli effetti di StrictMode", async () => {
    const r = apri(undefined, true); await avvia(r); await avvia(r);
    expect(onTesto).toHaveBeenCalledOnce();
  });
  it.each(["constructor", "start"])("un errore %s libera il microfono e consente di riprovare", async (tipo) => {
    costruzioneFallisce = tipo === "constructor"; avvioFallisce = tipo === "start";
    const r = apri(); await avvia(r);
    expect(stop).toHaveBeenCalledOnce(); expect(r.result.current.errore).toBeTruthy();
    costruzioneFallisce = avvioFallisce = false; await avvia(r);
    expect(r.result.current.registra).toBe(true);
  });
  it("un errore del controllo crediti viene mostrato senza richiesta di audio", async () => {
    const r = apri(async () => { throw new Error("Servizio crediti non disponibile"); }); await avvia(r);
    expect(r.result.current.errore).toBeTruthy(); expect(acquisisci).not.toHaveBeenCalled();
  });
  it("credito insufficiente non apre il microfono", async () => {
    const r = apri(async () => "Crediti insufficienti"); await avvia(r);
    expect(r.result.current.errore).toBe("Crediti insufficienti"); expect(acquisisci).not.toHaveBeenCalled();
  });
  it("permesso negato ha una spiegazione e non blocca il tentativo successivo", async () => {
    acquisisci.mockRejectedValueOnce(new DOMException("Permission denied", "NotAllowedError"));
    const r = apri(); await avvia(r);
    expect(r.result.current.errore).toContain("non è permesso"); await avvia(r);
    expect(r.result.current.registra).toBe(true);
  });
  it("si ferma al limite senza aggiornamenti annidati o richieste duplicate", async () => {
    const r = apri(); await avvia(r);
    await act(async () => vi.advanceTimersByTime(DETTATURA_MAX_SECONDI * 1000));
    expect(r.result.current.secondi).toBe(DETTATURA_MAX_SECONDI);
    expect(r.result.current.registra).toBe(false); expect(trascrivi).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("audio vuoto non costa una trascrizione", async () => {
    vuoto = true; const r = apri(); await avvia(r); await avvia(r);
    expect(trascrivi).not.toHaveBeenCalled(); expect(r.result.current.errore).toContain("Non ho sentito");
  });
  it("l'errore del recorder ferma le tracce e lascia riprovare", async () => {
    const r = apri(); await avvia(r); act(() => registratori[0].onerror?.());
    expect(stop).toHaveBeenCalledOnce(); expect(trascrivi).not.toHaveBeenCalled();
    expect(r.result.current.errore).toContain("interrotta"); await avvia(r);
    expect(registratori).toHaveLength(2);
  });
});
