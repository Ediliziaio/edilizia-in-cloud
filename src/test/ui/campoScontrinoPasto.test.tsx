import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { importoDaTesto, ScontrinoPasto } from "@/components/campo/ScontrinoPasto";

const stato = vi.hoisted(() => ({ caricati: [] as string[], inserite: [] as Record<string, unknown>[], errore: null as null | { code?: string; message: string } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload: (p: string) => { stato.caricati.push(p); return Promise.resolve({ error: null }); } }) },
    from: () => ({ insert: (r: Record<string, unknown>) => { stato.inserite.push(r); return Promise.resolve({ error: stato.errore }); } }),
  },
}));
vi.mock("@/lib/campo/compressImage", () => ({ compressImage: (f: File) => Promise.resolve(f) }));
vi.mock("@/lib/campo/timbra", () => ({ senzaRete: () => false }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => { stato.caricati = []; stato.inserite = []; stato.errore = null; toast.success.mockReset(); toast.error.mockReset(); });

const disegna = () => render(<QueryClientProvider client={new QueryClient()}><ScontrinoPasto companyId="c1" profiloId="p1" /></QueryClientProvider>);

it("legge l'importo come lo scrive un italiano", () => {
  expect(importoDaTesto("8,50")).toBe(8.5);
  expect(importoDaTesto("12")).toBe(12);
  expect(importoDaTesto("€ 9.90")).toBe(9.9);
  expect(importoDaTesto("0")).toBeNull();
  expect(importoDaTesto("otto")).toBeNull();
  expect(importoDaTesto("950")).toBeNull();
});

it("foto nella cartella della persona, ricevuta maturata con importo ed esercente", async () => {
  disegna();
  fireEvent.click(screen.getByRole("button", { name: /Carica lo scontrino del pranzo/ }));
  fireEvent.change(screen.getByPlaceholderText("8,50"), { target: { value: "9,80" } });
  fireEvent.change(screen.getByLabelText("Dove hai mangiato (facoltativo)"), { target: { value: "Bar Sport" } });
  const file = new File(["x"], "s.jpg", { type: "image/jpeg" });
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: /Invia all'ufficio/ }));
  await waitFor(() => expect(toast.success).toHaveBeenCalled());
  expect(stato.caricati[0]).toMatch(/^c1\/p1\/[0-9a-f-]{36}\.jpg$/);
  expect(stato.inserite[0]).toMatchObject({ company_id: "c1", profilo_id: "p1", tipo: "ricevuta", importo: 9.8, esercente: "Bar Sport", stato: "maturato", foto_url: stato.caricati[0] });
});

it("senza foto non parte niente, e il messaggio del database arriva all'operaio", async () => {
  disegna();
  fireEvent.click(screen.getByRole("button", { name: /Carica lo scontrino del pranzo/ }));
  fireEvent.change(screen.getByPlaceholderText("8,50"), { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: /Invia all'ufficio/ }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Fai la foto dello scontrino."));
  expect(stato.inserite).toHaveLength(0);
  stato.errore = { code: "P0001", message: "Possibile doppio conteggio pasto: verifica buono fisso e ricevuta prima di procedere" };
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "s.jpg", { type: "image/jpeg" })] } });
  fireEvent.click(screen.getByRole("button", { name: /Invia all'ufficio/ }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Possibile doppio conteggio pasto: verifica buono fisso e ricevuta prima di procedere"));
});
