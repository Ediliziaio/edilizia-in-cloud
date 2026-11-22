import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LocalFishVoicePanel } from "@/components/agenti/LocalFishVoicePanel";
import type {
  createLocalAssistanceClient,
  LocalLabSnapshot,
} from "@/lib/localAssistanceClient";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("records only after a click, releases microphone and exposes ASR as a draft with no automatic consent", async () => {
  const stop = vi.fn();
  const getUserMedia = vi
    .fn()
    .mockResolvedValue({ getTracks: () => [{ stop }] });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  class Recorder {
    static isTypeSupported = () => true;
    state = "inactive";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["a".repeat(200)]) });
      this.onstop?.();
    }
  }
  vi.stubGlobal("MediaRecorder", Recorder);
  const client = {
    speech: vi.fn().mockResolvedValue(new Blob(["audio"])),
    transcribe: vi
      .fn()
      .mockResolvedValue({ text: "Sì, confermo", duration: 2 }),
    turn: vi.fn(),
  };
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal(
    "Audio",
    class {
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
    },
  );
  const draft = vi.fn();
  const snapshot = {
    session: {
      id: "11111111-1111-4111-8111-111111111111",
      phase: "ticket_confirmation",
      messages: [
        { id: "question", role: "agent", text: "Confermi il ticket?" },
      ],
    },
  } as LocalLabSnapshot;
  render(
    <LocalFishVoicePanel
      client={
        client as unknown as ReturnType<typeof createLocalAssistanceClient>
      }
      status={{
        configured: true,
        provider: "fish_audio",
        model: "drama-3",
        voice: "Giulia",
        asrModel: "transcribe-1",
        maxSeconds: 45,
      }}
      snapshot={snapshot}
      disabled={false}
      onTranscript={draft}
    />,
  );
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(client.speech).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Attiva voce Fish" }));
  await waitFor(() => expect(client.speech).toHaveBeenCalledTimes(1));
  await screen.findByText("L’assistente sta parlando");
  fireEvent.click(screen.getByRole("button", { name: "Registra risposta" }));
  await screen.findByRole("button", { name: "Termina e trascrivi" });
  fireEvent.click(screen.getByRole("button", { name: "Termina e trascrivi" }));
  await waitFor(() => expect(draft).toHaveBeenCalledWith("Sì, confermo"));
  expect(stop).toHaveBeenCalled();
  expect(client.turn).not.toHaveBeenCalled();
  expect(
    screen.getByText(/Non è stato dato alcun consenso automatico/),
  ).toBeInTheDocument();
});
