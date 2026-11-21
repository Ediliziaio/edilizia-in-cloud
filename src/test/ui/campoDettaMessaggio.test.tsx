import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CampoDettaMessaggio } from "@/components/campo/CampoDettaMessaggio";

const state = vi.hoisted(() => ({ online: true, invoke: vi.fn() }));
vi.mock("@/hooks/campo/useNetworkStatus", () => ({ useNetworkStatus: () => state.online }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: state.invoke } } }));
vi.mock("@/components/campo/CampoAudioRecorder", () => ({
  default: ({ onConfirm, disabled, confirmAvailable }: {
    onConfirm: (audio: Blob, durata: number, formato: string) => Promise<void>;
    disabled: boolean; confirmAvailable: boolean;
  }) => <button disabled={disabled || !confirmAvailable} onClick={() => {
    void onConfirm(new Blob(["voce"], { type: "audio/mp4" }), 4, "audio/mp4");
  }}>Usa trascrizione</button>,
}));

beforeEach(() => { state.online = true; state.invoke.mockReset(); });
afterEach(cleanup);

function apri() { fireEvent.click(screen.getByRole("button", { name: "Detta messaggio" })); }
function usa() { fireEvent.click(screen.getByRole("button", { name: "Usa trascrizione" })); }

it("restituisce una bozza di testo e invia l'audio iOS al trascrittore con il formato corretto", async () => {
  const onTesto = vi.fn();
  state.invoke.mockResolvedValue({ data: { text: "  Arrivo tra dieci minuti. " }, error: null });
  render(<CampoDettaMessaggio onTesto={onTesto} />);
  apri();
  expect(state.invoke).not.toHaveBeenCalled();
  usa();
  await waitFor(() => expect(onTesto).toHaveBeenCalledWith("Arrivo tra dieci minuti."));
  const [funzione, opzioni] = state.invoke.mock.calls[0];
  expect(funzione).toBe("silvio-transcribe-audio");
  expect(opzioni.body.get("audio")).toMatchObject({ name: "messaggio.m4a", type: "audio/mp4" });
});

it("conserva l'anteprima dopo un errore e permette di riprovare", async () => {
  const onTesto = vi.fn();
  state.invoke.mockResolvedValueOnce({ data: null, error: new Error("temporaneo") })
    .mockResolvedValueOnce({ data: { text: "Ci siamo." }, error: null });
  render(<CampoDettaMessaggio onTesto={onTesto} />);
  apri(); usa();
  expect(await screen.findByRole("alert")).toHaveTextContent("Puoi riprovare con lo stesso audio");
  usa();
  await waitFor(() => expect(onTesto).toHaveBeenCalledWith("Ci siamo."));
});

it("la trascrizione in ritardo non passa alla conversazione successiva", async () => {
  let consegna!: (risposta: unknown) => void;
  state.invoke.mockReturnValue(new Promise(resolve => { consegna = resolve; }));
  const onTesto = vi.fn();
  const view = render(<CampoDettaMessaggio key="chat-1" onTesto={onTesto} />);
  apri(); usa();
  const { signal } = state.invoke.mock.calls[0][1];
  view.rerender(<CampoDettaMessaggio key="chat-2" onTesto={onTesto} />);
  expect(signal.aborted).toBe(true);
  await act(async () => consegna({ data: { text: "Solo per la prima chat." }, error: null }));
  expect(onTesto).not.toHaveBeenCalled();
});
