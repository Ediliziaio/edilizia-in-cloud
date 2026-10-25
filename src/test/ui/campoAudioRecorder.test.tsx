import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CampoAudioRecorder from "@/components/campo/CampoAudioRecorder";

let stopTrack: ReturnType<typeof vi.fn>;
let gum: ReturnType<typeof vi.fn>;
let recorder: FakeRecorder | undefined;
class FakeRecorder {
  static isTypeSupported = vi.fn(() => true);
  state = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- Accesso al dispositivo simulato per emettere gli eventi.
    recorder = this;
    this.mimeType = options?.mimeType || "audio/mp4";
  }
  start() { this.state = "recording"; }
  stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"], { type: this.mimeType }) });
    this.onstop?.();
  });
}
const stream = () => ({ getTracks: () => [{ stop: stopTrack }] });
beforeEach(() => {
  vi.useFakeTimers();
  recorder = undefined;
  FakeRecorder.isTypeSupported.mockReturnValue(true);
  stopTrack = vi.fn();
  gum = vi.fn().mockResolvedValue(stream());
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: gum } });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:audio-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const start = async () => {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Inizia registrazione" })));
};
const stop = () => fireEvent.click(screen.getByRole("button", { name: "Ferma registrazione" }));
const record = async (seconds = 5) => {
  await start(); await act(async () => vi.advanceTimersByTime(seconds * 1000)); stop();
};

it("consegna un blob e la durata senza chiamare un backend", async () => {
  const confirm = vi.fn(); render(<CampoAudioRecorder onConfirm={confirm} />);
  await record(); await act(async () => fireEvent.click(screen.getByRole("button", { name: "Usa questo" })));
  expect(confirm).toHaveBeenCalledWith(expect.any(Blob), 5, "audio/webm;codecs=opus");
  expect(stopTrack).toHaveBeenCalledOnce();
});
it("nega il microfono con un messaggio recuperabile", async () => {
  gum.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
  render(<CampoAudioRecorder onConfirm={vi.fn()} />); await start();
  expect(screen.getByRole("alert")).toHaveTextContent("Permesso microfono negato");
  expect(screen.getByRole("button", { name: "Inizia registrazione" })).toBeEnabled();
});
it('permette registrazione e riascolto ma non conferma un servizio non ancora attivo', async () => {
  const confirm = vi.fn(); render(<CampoAudioRecorder onConfirm={confirm} confirmAvailable={false} confirmLabel="Trascrivi audio" />);
  await record(); expect(screen.getByRole('button', { name: 'Riproduci' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Trascrivi audio' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Trascrivi audio' })); expect(confirm).not.toHaveBeenCalled();
});
it("ferma automaticamente a due minuti anche se il timer avanza in un unico giro", async () => {
  render(<CampoAudioRecorder onConfirm={vi.fn()} />); await start();
  await act(async () => vi.advanceTimersByTime(120000));
  expect(screen.getByText("Registrazione pronta")).toBeVisible();
  expect(recorder?.stop).toHaveBeenCalledOnce();
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("libera l'ultima anteprima quando si esce dalla pagina", async () => {
  const view = render(<CampoAudioRecorder onConfirm={vi.fn()} />); await record(); view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio-test");
});
it("non avvia il microfono se il permesso arriva dopo l'uscita", async () => {
  let resolve!: (value: unknown) => void;
  gum.mockReturnValue(new Promise(r => { resolve = r; }));
  const view = render(<CampoAudioRecorder onConfirm={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Inizia registrazione" })); view.unmount();
  await act(async () => resolve(stream()));
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(recorder).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});
it("un errore ferma il timer e un onstop tardivo non crea un'anteprima", async () => {
  render(<CampoAudioRecorder onConfirm={vi.fn()} />); await start();
  const lateStop = recorder!.onstop;
  await act(async () => recorder!.onerror?.());
  await act(async () => lateStop?.());
  expect(screen.getByRole("alert")).toHaveTextContent("Errore durante la registrazione");
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("uscire durante la registrazione ferma il recorder senza creare un blob", async () => {
  const view = render(<CampoAudioRecorder onConfirm={vi.fn()} />); await start();
  const lateStop = recorder!.onstop;
  view.unmount(); await act(async () => lateStop?.());
  expect(recorder?.stop).toHaveBeenCalledOnce();
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("riprova interrompe il riascolto e libera il blob", async () => {
  render(<CampoAudioRecorder onConfirm={vi.fn()} />); await record();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Riproduci" })));
  fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio-test");
  expect(screen.getByRole("button", { name: "Inizia registrazione" })).toBeEnabled();
});
it("se il player rifiuta la riproduzione non mostra una falsa pausa", async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error("cannot play"));
  render(<CampoAudioRecorder onConfirm={vi.fn()} />); await record();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Riproduci" })));
  expect(screen.getByRole("button", { name: "Riproduci" })).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("riascoltare");
});
it("blocca conferma e riprova durante l'elaborazione", async () => {
  const confirm = vi.fn(); const view = render(<CampoAudioRecorder onConfirm={confirm} />); await record();
  view.rerender(<CampoAudioRecorder onConfirm={confirm} disabled />);
  expect(screen.getByRole("button", { name: "Riprova" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Usa questo" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Usa questo" }));
  expect(confirm).not.toHaveBeenCalled();
});
it("chiede di riprovare se la registrazione dura meno di tre secondi", async () => {
  const confirm = vi.fn(); render(<CampoAudioRecorder onConfirm={confirm} />); await record(1);
  expect(screen.getByRole("button", { name: "Usa questo" })).toBeDisabled();
  expect(screen.getByText(/almeno 3 secondi/i)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Usa questo" }));
  expect(confirm).not.toHaveBeenCalled();
});
it("usa il formato nativo del dispositivo se nessun MIME candidato è supportato", async () => {
  FakeRecorder.isTypeSupported.mockReturnValue(false);
  const confirm = vi.fn(); render(<CampoAudioRecorder onConfirm={confirm} />); await record();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Usa questo" })));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ type: "audio/mp4" }), 5, "audio/mp4");
});
it("non richiede il microfono se MediaRecorder non è disponibile", async () => {
  vi.stubGlobal("MediaRecorder", undefined);
  render(<CampoAudioRecorder onConfirm={vi.fn()} />); await start();
  expect(gum).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("non supportata");
});
it("funziona anche con il controllo doppio degli effetti in StrictMode", async () => {
  const view = render(<React.StrictMode><CampoAudioRecorder onConfirm={vi.fn()} /></React.StrictMode>);
  await record(); view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio-test");
  expect(stopTrack).toHaveBeenCalledOnce();
});

it("un'eccezione di stop non lascia microfono e timer attivi", async () => {
  render(<CampoAudioRecorder onConfirm={vi.fn()} />); await start();
  recorder!.stop.mockImplementation(() => { throw new Error("device disconnected"); });
  stop();
  expect(screen.getByRole("alert")).toHaveTextContent("Errore durante la registrazione");
  expect(stopTrack).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});

it("una conferma asincrona impedisce il doppio invio anche senza prop disabled", async () => {
  let resolve!: () => void;
  const confirm = vi.fn(() => new Promise<void>(done => { resolve = done; }));
  render(<CampoAudioRecorder onConfirm={confirm} />); await record();
  fireEvent.click(screen.getByRole("button", { name: "Usa questo" }));
  fireEvent.click(screen.getByRole("button", { name: "Usa questo" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Riprova" })).toBeDisabled();
  await act(async () => resolve());
  expect(screen.getByRole("button", { name: "Riprova" })).toBeEnabled();
});

it("una riproduzione tardiva non riparte mentre l'audio viene elaborato", async () => {
  let play!: () => void; let confirm!: () => void;
  vi.mocked(HTMLMediaElement.prototype.play).mockReturnValue(new Promise<void>(done => { play = done; }));
  render(<CampoAudioRecorder onConfirm={() => new Promise<void>(done => { confirm = done; })} />);
  await record(); fireEvent.click(screen.getByRole("button", { name: "Riproduci" }));
  fireEvent.click(screen.getByRole("button", { name: "Usa questo" }));
  await act(async () => play());
  expect(screen.queryByRole("button", { name: "Pausa" })).not.toBeInTheDocument();
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  await act(async () => confirm());
});

it("un audio vuoto fa riprovare senza inviare nulla", async () => {
  const confirm = vi.fn(); render(<CampoAudioRecorder onConfirm={confirm} />); await start();
  recorder!.stop.mockImplementation(() => { recorder!.state = "inactive"; recorder!.onstop?.(); });
  stop();
  expect(screen.getByRole("alert")).toHaveTextContent("Registrazione vuota");
  expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
  expect(stopTrack).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
