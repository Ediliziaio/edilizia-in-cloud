import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CaricaAttestato } from "@/components/campo/CaricaAttestato";

const stato = vi.hoisted(() => ({ offline: false, errore: vi.fn(), successo: vi.fn() }));
vi.mock("@/lib/campo/timbra", () => ({ senzaRete: () => stato.offline }));
vi.mock("@/lib/campo/lingua/LinguaCampo", () => ({ useT: () => (testo: string) => testo }));
vi.mock("sonner", () => ({ toast: { error: stato.errore, success: stato.successo } }));
beforeEach(() => { stato.offline = false; onlineManager.setOnline(true); vi.clearAllMocks(); });
afterEach(() => onlineManager.setOnline(true));

function disegna(carica = vi.fn().mockResolvedValue(undefined)) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CaricaAttestato carica={carica} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Carica un attestato" }));
  return carica;
}

it("manda all'ufficio il PDF scelto su Android anche senza MIME", async () => {
  const carica = disegna();
  fireEvent.change(screen.getByLabelText("Scegli il file"), { target: { files: [new File(["pdf"], "corso.pdf")] } });
  fireEvent.click(screen.getByRole("button", { name: "Invia all'ufficio" }));
  await waitFor(() => expect(carica).toHaveBeenCalledOnce());
  expect(carica.mock.calls[0][0].file.type).toBe("application/pdf");
  await waitFor(() => expect(stato.successo).toHaveBeenCalled());
});

it("non invia file troppo grandi e conserva il modulo per correggere la scelta", async () => {
  const carica = disegna();
  const file = new File(["pdf"], "grande.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: 16 * 1024 * 1024 });
  fireEvent.change(screen.getByLabelText("Scegli il file"), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Invia all'ufficio" }));
  await waitFor(() => expect(stato.errore).toHaveBeenCalledWith(expect.stringContaining("15 MB")));
  expect(carica).not.toHaveBeenCalled();
  expect(screen.getByText("grande.pdf")).toBeInTheDocument();
});

it("senza rete non perde il file e permette di riprovare al ritorno del segnale", async () => {
  const carica = disegna();
  fireEvent.change(screen.getByLabelText("Scegli il file"), { target: { files: [new File(["foto"], "patente.heic", { type: "image/heic" })] } });
  stato.offline = true;
  fireEvent.click(screen.getByRole("button", { name: "Invia all'ufficio" }));
  await waitFor(() => expect(stato.errore).toHaveBeenCalledWith(expect.stringContaining("senza rete")));
  expect(carica).not.toHaveBeenCalled();
  expect(screen.getByText("patente.heic")).toBeInTheDocument();
  stato.offline = false;
  await waitFor(() => expect(screen.getByRole("button", { name: "Invia all'ufficio" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Invia all'ufficio" }));
  await waitFor(() => expect(carica).toHaveBeenCalledOnce());
});

it("se l'upload fallisce mostra l'errore e riabilita l'invio senza perdere l'allegato", async () => {
  const carica = disegna(vi.fn().mockRejectedValueOnce(new Error("Rete interrotta")).mockResolvedValue(undefined));
  fireEvent.change(screen.getByLabelText("Scegli il file"), { target: { files: [new File(["pdf"], "corso.pdf", { type: "application/pdf" })] } });
  fireEvent.click(screen.getByRole("button", { name: "Invia all'ufficio" }));
  await waitFor(() => expect(stato.errore).toHaveBeenCalledWith("Rete interrotta"));
  expect(screen.getByText("corso.pdf")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Invia all'ufficio" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Invia all'ufficio" }));
  await waitFor(() => expect(carica).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(stato.successo).toHaveBeenCalledOnce());
});

it("non lascia il pulsante in attesa quando anche React Query è senza connessione", async () => {
  stato.offline = true;
  onlineManager.setOnline(false);
  const carica = disegna();
  fireEvent.change(screen.getByLabelText("Scegli il file"), { target: { files: [new File(["pdf"], "offline.pdf", { type: "application/pdf" })] } });
  fireEvent.click(screen.getByRole("button", { name: "Invia all'ufficio" }));
  await waitFor(() => expect(stato.errore).toHaveBeenCalledWith(expect.stringContaining("senza rete")));
  expect(carica).not.toHaveBeenCalled();
  expect(screen.getByText("offline.pdf")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Invia all'ufficio" })).toBeEnabled());
});
