// Il viaggio del rapportino: mezzo dall'elenco (entra nel registro), carico e scarico rapidi (25/11/2026).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/hooks/useMezzi", () => ({ useMezzi: () => ({ data: [
  { id: "11111111-1111-4111-8111-111111111111", nome: "DAF LF", targa: "GH909YZ", tipo: "autocarro", contatore_unita: "km" },
  { id: "22222222-2222-4222-8222-222222222222", nome: "Escavatore", targa: null, tipo: "macchina_movimento_terra", contatore_unita: "ore" },
] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { order_code: "25000050", work_address: "Via Roma 1, Castano" }, error: null }) });
  return q;
} } }));

import { CampiViaggioRapportino } from "@/components/orders/CampiViaggioRapportino";
import { dettagliViaggio, leggiDettagliViaggio } from "@/lib/campo/viaggiRapportino";

afterEach(cleanup);
const disegna = (onChange = vi.fn(), valore = {}) => {
  render(<QueryClientProvider client={new QueryClient()}><CampiViaggioRapportino valore={valore} quantitaInKm={false} orderId="o1" onChange={onChange} /></QueryClientProvider>);
  return onChange;
};

it("il mezzo si sceglie tra quelli stradali: id e nome con la targa", () => {
  const onChange = disegna();
  const tendina = screen.getByRole("combobox", { name: "Mezzo del viaggio" });
  expect(screen.queryByRole("option", { name: "Escavatore" })).toBeNull();
  fireEvent.change(tendina, { target: { value: "11111111-1111-4111-8111-111111111111" } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mezzoId: "11111111-1111-4111-8111-111111111111", mezzo: "DAF LF · GH909YZ" }));
});

it("«Altro» lascia scrivere un mezzo fuori elenco, senza registro", () => {
  const onChange = disegna();
  fireEvent.change(screen.getByRole("combobox", { name: "Mezzo del viaggio" }), { target: { value: "altro" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Mezzo o targa" }), { target: { value: "Noleggio Rossi" } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mezzo: "Noleggio Rossi" }));
  expect(onChange.mock.lastCall?.[0].mezzoId).toBeUndefined();
});

it("carico e scarico propongono Sede e il cantiere della commessa, come li riconosce la mappa", async () => {
  const onChange = disegna();
  fireEvent.click(screen.getAllByRole("button", { name: "Sede" })[0]);
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ carico: "Sede" }));
  fireEvent.click((await screen.findAllByRole("button", { name: "Questo cantiere" }))[1]);
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ scarico: "25000050 · Via Roma 1, Castano" }));
});

it("mezzoId passa nel salvataggio e si rilegge, solo se è un id valido", () => {
  expect(dettagliViaggio({ mezzoId: "11111111-1111-4111-8111-111111111111", km: "12" }, "cad", "1")).toMatchObject({ mezzoId: "11111111-1111-4111-8111-111111111111", km: 12 });
  expect(dettagliViaggio({ mezzoId: "non-un-id" }, "cad", "1").mezzoId).toBeUndefined();
  expect(leggiDettagliViaggio({ mezzoId: "11111111-1111-4111-8111-111111111111", carico: "Sede" })).toEqual({ mezzoId: "11111111-1111-4111-8111-111111111111", carico: "Sede" });
});
