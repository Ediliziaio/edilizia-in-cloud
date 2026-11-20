import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LetturaOcrPsc } from "@/components/sicurezza/pos/LetturaOcrPsc";
import type { RiepilogoOcrPsc } from "../../../supabase/functions/_shared/posOcrStato";

const { api, apri } = vi.hoisted(() => ({ api: vi.fn(), apri: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/hooks/usePos", () => ({ chiamaServerPos: api }));
vi.mock("@/lib/storagePrivato", () => ({ apriFileRiservato: apri }));

const fonte = {
  archivio: "sicurezza_documenti" as const, id: "psc", company_id: "azienda", order_id: "ordine",
  file_name: "PSC.pdf", file_path: "azienda/PSC.pdf", titolo: "PSC demo", data_documento: "",
  revisione: "02", sha256: "a".repeat(64),
};
const inCorso: RiepilogoOcrPsc = { id: "lettura", stato: "in_lettura", totale: 10, esaminate: 4, letto: 3, bianche: 1, illeggibili: [], errore: null };
function monta(salva?: () => Promise<boolean>) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={c}><LetturaOcrPsc companyId="azienda" posId="pos" fonte={fonte} salva={salva} /></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("mostra percentuali vere, lascia chiudere e ritrova la trascrizione dal server riaprendo con una cache nuova", async () => {
  let lettura: RiepilogoOcrPsc | null = null;
  api.mockImplementation(async ({ azione, pagina }) => {
    if (azione === "avvia_ocr_psc") lettura = inCorso;
    if (pagina === 1) return { pagina: { metodo: "native", testo: "Prescrizioni della commessa" } };
    if (pagina === 2) return { pagina: { metodo: "ocr", testo: "Punto di raccolta vicino all’ingresso" } };
    return { lettura };
  });
  const salva = vi.fn().mockResolvedValue(true);
  const v = monta(salva);
  const pulsante = await screen.findByRole("button", { name: "Leggi tutto il PSC" });
  await waitFor(() => expect(pulsante).toBeEnabled());
  fireEvent.click(pulsante);
  const progress = await screen.findByRole("progressbar");
  await waitFor(() => expect(progress).toHaveAttribute("aria-valuenow", "40"));
  expect(screen.getByText(/lettura continua/)).toBeInTheDocument();
  expect(salva).toHaveBeenCalledOnce();
  expect(api).toHaveBeenCalledWith(expect.objectContaining({ azione: "avvia_ocr_psc", documento_id: "psc", sha256: fonte.sha256, revisione: "02" }));
  v.unmount();

  lettura = { ...inCorso, stato: "pronta", esaminate: 10, letto: 9 };
  monta();
  expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  fireEvent.click(screen.getByRole("button", { name: "Vedi testo letto" }));
  expect(await screen.findByText("Prescrizioni della commessa")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Pagina successiva" }));
  expect(await screen.findByText("Punto di raccolta vicino all’ingresso")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Vedi pagina originale" }));
  expect(apri).toHaveBeenCalledWith("sicurezza-documenti", "azienda/PSC.pdf", 2);
});

it("se il totale non è disponibile non inventa una percentuale", async () => {
  api.mockResolvedValue({ lettura: { ...inCorso, totale: null, esaminate: 0 } });
  monta();
  expect(await screen.findByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
});

it("distingue una lettura parziale e richiede soltanto la rilettura delle pagine mancanti", async () => {
  const parziale = { ...inCorso, stato: "parziale", esaminate: 10, letto: 8, illeggibili: [7] };
  api.mockImplementation(async ({ azione }) => ({ lettura: azione === "riprova_ocr_psc" ? inCorso : parziale }));
  monta();
  const box = screen.getByRole("region", { name: "Lettura del PSC" });
  expect(await within(box).findByText(/1 illeggibili/)).toBeInTheDocument();
  fireEvent.click(within(box).getByRole("button", { name: "Riprova pagine mancanti" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(expect.objectContaining({ azione: "riprova_ocr_psc" })));
});
