// Registro dei cespiti in contabilità (11/11/2026): fondo stimato segnalato, cessione con anteprima, cespite da una riga di fattura.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const m = vi.hoisted(() => ({ rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>, ceduti: [] as unknown[] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (t: string) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order", "not", "gte", "lte", "single"]) q[k] = () => q;
    q.then = (r: (x: unknown) => unknown) => Promise.resolve({ data: t === "cespiti" ? m.ceduti : [
      { id: "c-ric", codice: "20.04", descrizione: "Altri ricavi", natura: "ricavo", codice_standard: "20.04" },
      { id: "c-att", codice: "02.03", descrizione: "Attrezzature", natura: "attivo", codice_standard: "02.03" },
    ], error: null }).then(r);
    return q;
  },
  rpc: async (fn: string, args: Record<string, unknown>) => {
    m.rpc.push({ fn, args });
    if (fn === "contabilita_ammortamenti") return { data: {
      quote: [{ id: "ces1", cespite: "Escavatore", codice: null as string | null, categoria: "materiale", costo: 95000, aliquota: 15, fondo_inizio: 21375,
        fondo_stimato: true, quota: 14250, residuo: 59375, conto_bene: "c-att", conto_fondo: null as string | null, conto_ammortamento: null as string | null }],
      totale: 14250, registrati: true, da_aggiornare: true, conti_mancanti: [] as string[],
    }, error: null as null };
    if (fn === "contabilita_cespite_cessione") return { data: {
      fondo_inizio: 21375, fondo_stimato: true, quota: 7125, residuo: 66500, prezzo: 70000, plusvalenza: 3500, minusvalenza: 0, conti_mancanti: [] as string[],
    }, error: null as null };
    return { data: null, error: null as null };
  },
} }));

import { RegistroCespiti, leggiEsitoAmmortamenti } from "@/components/contabilita/RegistroCespiti";
import { CespiteDaRiga } from "@/components/contabilita/CespiteDaRiga";

const conClient = (el: React.ReactElement) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{el}</QueryClientProvider>,
);
beforeEach(() => { m.rpc = []; m.ceduti = []; });
afterEach(cleanup);

it("mostra quota e fondo, dice che il fondo è stimato e che gli ammortamenti vanno rifatti", async () => {
  conClient(<RegistroCespiti companyId="az" anno={2026} chiuso={false} />);
  expect(await screen.findByText("Escavatore")).toBeTruthy();
  expect(screen.getByText("stimato")).toBeTruthy();
  expect(screen.getByText(/il fondo a inizio anno è stimato/)).toBeTruthy();
  expect(screen.getByText("· da aggiornare")).toBeTruthy();
  expect(screen.getByText(/Bene 02\.03 · fondo manca · ammortamento manca/)).toBeTruthy();
});

it("cessione: anteprima con la plusvalenza, poi registra con il conto del prezzo", async () => {
  conClient(<RegistroCespiti companyId="az" anno={2026} chiuso={false} />);
  const azioni = await screen.findByRole("button", { name: "Azioni per Escavatore" });
  fireEvent.pointerDown(azioni, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByText("Cessione o dismissione"));
  fireEvent.change(await screen.findByLabelText("Prezzo (0 = rottamazione)"), { target: { value: "70.000,00" } });
  expect(await screen.findByText("Plusvalenza")).toBeTruthy();
  expect(screen.getByText("3.500,00 €")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Registra la cessione" }));
  await waitFor(() => expect(m.rpc.find((c) => c.fn === "contabilita_cespite_cessione" && c.args.p_anteprima === false)?.args)
    .toEqual({ p_cespite: "ces1", p_data: "2026-12-31", p_prezzo: 70000, p_conto_prezzo: "c-ric", p_anteprima: false }));
});

it("annulla una cessione dell'anno", async () => {
  m.ceduti = [{ id: "ces9", descrizione: "Furgone venduto", data_dismissione: "2026-05-10", prezzo_cessione: 4000 }];
  conClient(<RegistroCespiti companyId="az" anno={2026} chiuso={false} />);
  expect(await screen.findByText(/Furgone venduto · 10\/05\/2026/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Annulla cessione" }));
  expect(m.rpc.some((c) => c.fn === "contabilita_cespite_annulla_cessione")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Sì, annulla" }));
  await waitFor(() => expect(m.rpc.some((c) => c.fn === "contabilita_cespite_annulla_cessione" && c.args.p_cespite === "ces9")).toBe(true));
});

it("da una riga di fattura: crea il cespite con tipo e aliquota proposti", async () => {
  conClient(<CespiteDaRiga companyId="az" fatturaId="f1" chiave="2" descrizione="Betoniera 350 litri" gia={undefined} />);
  fireEvent.click(screen.getByRole("button", { name: "Fai cespite" }));
  expect((await screen.findByLabelText("Descrizione del bene") as HTMLInputElement).value).toBe("Betoniera 350 litri");
  fireEvent.click(screen.getByRole("button", { name: "Crea il cespite" }));
  await waitFor(() => expect(m.rpc.find((c) => c.fn === "contabilita_cespite_da_fattura")?.args).toEqual(expect.objectContaining({
    p_fattura: "f1", p_linea: "2", p_descrizione: "Betoniera 350 litri", p_categoria: "materiale", p_sottocategoria: "Attrezzature", p_aliquota: 15, p_conto_bene: null,
  })));
});

it("una riga che è già un cespite lo dice e non offre di rifarlo", () => {
  conClient(<CespiteDaRiga companyId="az" fatturaId="f1" chiave="1" descrizione="x" gia="Betoniera" />);
  expect(screen.queryByRole("button", { name: "Fai cespite" })).toBeNull();
  expect(screen.getByText("Cespite")).toBeTruthy();
});

it("legge una risposta incompleta senza rompersi", () => {
  expect(leggiEsitoAmmortamenti(null)).toEqual({ quote: [], totale: 0, registrati: false, da_aggiornare: false, conti_mancanti: [] });
});
