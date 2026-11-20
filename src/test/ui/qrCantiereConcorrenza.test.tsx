import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QrCantiereDialog } from "@/components/orders/QrCantiereDialog";

const m = vi.hoisted(() => ({ leggi: vi.fn(), aggiorna: vi.fn(), filtra: vi.fn(), salva: vi.fn(), elimina: vi.fn() }));
vi.mock("qrcode", () => ({ toDataURL: async () => "data:image/png;base64,iVBORw0KGgo=" }));
vi.mock("@/integrations/supabase/client", () => ({supabase: {from: () => ({
  select: () => ({eq: () => ({ maybeSingle: m.leggi })}),
  update: m.aggiorna,
  delete: m.elimina,
})}}));

const key = ["commessa-qr-cantiere", "commessa"];
const attivo = {token: "00000000-0000-4000-a000-000000000700", documento_ids: ["pos"], revisione: "r1"};
const documenti = [{id: "pos", file_name: "POS.pdf"}, {id: "psc", file_name: "PSC.pdf"}];

beforeEach(() => {
  vi.clearAllMocks();
  m.leggi.mockResolvedValue({data: attivo, error: null});
  const comando = {eq: m.filtra, select: () => ({single: m.salva})};
  m.filtra.mockReturnValue(comando);
  m.aggiorna.mockReturnValue(comando);
  m.salva.mockResolvedValue({data: {...attivo, documento_ids: [], revisione: "r2"}, error: null});
});
afterEach(cleanup);

async function apriQr() {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  render(<QueryClientProvider client={client}><QrCantiereDialog orderId="commessa" documenti={documenti} onClose={vi.fn()} /></QueryClientProvider>);
  await screen.findByText("QR attivo");
  return client;
}

it("blocca la propria bozza se un aggiornamento concorrente cambia la revisione", async () => {
  const client = await apriQr();
  fireEvent.click(screen.getByRole("checkbox", {name: "PSC.pdf"}));
  expect(screen.getByRole("button", {name: "Aggiorna documenti"})).toBeEnabled();
  act(() => { client.setQueryData(key, {...attivo, documento_ids: ["psc"], revisione: "r-altra"}); });
  await screen.findByRole("alert");
  expect(screen.getByRole("button", {name: "Aggiorna documenti"})).toBeDisabled();
  expect(m.aggiorna).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name: "Carica le modifiche più recenti"}));
  expect(screen.getByRole("checkbox", {name: "POS.pdf"})).not.toBeChecked();
  expect(screen.getByRole("checkbox", {name: "PSC.pdf"})).toBeChecked();
});

it("consente di svuotare la selezione conservando il link del cartello", async () => {
  await apriQr();
  const url = screen.getByRole("link", {name: "Apri pagina"}).getAttribute("href");
  fireEvent.click(screen.getByRole("checkbox", {name: "POS.pdf"}));
  fireEvent.click(screen.getByRole("button", {name: "Aggiorna documenti"}));
  await waitFor(() => expect(m.aggiorna).toHaveBeenCalledWith(expect.objectContaining({documento_ids: []})));
  expect(m.filtra).toHaveBeenCalledWith("revisione", "r1");
  await screen.findByText(/Nessun documento condiviso/);
  expect(screen.getByRole("link", {name: "Apri pagina"})).toHaveAttribute("href", url);
});


it("impedisce di revocare dalla conferma un QR cambiato nel frattempo", async () => {
  const client = await apriQr();
  fireEvent.click(screen.getByRole("button", {name: "Revoca QR"}));
  const conferma = await screen.findByRole("alertdialog");
  act(() => { client.setQueryData(key, {...attivo, token: "00000000-0000-4000-a000-000000000701", revisione: "r-altra"}); });
  await within(conferma).findByText(/Il QR è cambiato/);
  expect(within(conferma).getByRole("button", {name: "Revoca QR"})).toBeDisabled();
  expect(m.elimina).not.toHaveBeenCalled();
});
