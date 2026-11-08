import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({ righe: [] as unknown[], update: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  const catena: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) catena[m] = () => catena;
  catena.limit = async () => ({ data: mocks.righe, error: null as unknown });
  catena.then = (ok: (v: unknown) => void) => ok({ data: [] as unknown[], error: null as unknown });
  catena.update = (v: unknown) => { mocks.update(v); return { eq: async () => ({ error: null as unknown }) }; };
  return { supabase: { from: () => catena } };
});
vi.mock("@/components/campo/DettaTesto", () => ({ DettaTesto: (): null => null }));

import { EventiGiornale } from "@/components/giornale/EventiGiornale";
import type { EventoProposto } from "../../../supabase/functions/_shared/eventiGiornale";
import { ProblemiApertiGiornale } from "@/components/orders/ProblemiApertiGiornale";

const avvolgi = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
const problema = { id: "e1", tipo: "problema", testo: "Infiltrazione", stato: "aperto" };
const base = { companyId: "az", orderId: "o1", giornaleId: "g1", nomi: {}, proposti: [] as EventoProposto[], onTogliProposto: vi.fn() };

beforeEach(() => { mocks.righe = []; mocks.update.mockReset(); });

describe("EventiGiornale", () => {
  it("su una firmata non si aggiunge né si toglie, ma il problema si chiude con una nota", async () => {
    avvolgi(<EventiGiornale {...base} statoPagina="firmata" haPermesso eventi={[problema]} />);
    expect(screen.queryByRole("button", { name: /Aggiungi evento/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Togli l'evento/ })).toBeNull();
    expect(screen.getByText("Aperto")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    const conferma = screen.getByRole("button", { name: "Chiudi il problema" });
    expect(conferma).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Come si è risolto"), { target: { value: "Riparata la guaina" } });
    fireEvent.click(conferma);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ stato: "chiuso", nota_chiusura: "Riparata la guaina" }));
  });

  it("senza permesso si legge e basta", () => {
    avvolgi(<EventiGiornale {...base} statoPagina="bozza" haPermesso={false} eventi={[problema]} />);
    expect(screen.queryByRole("button", { name: "Chiudi" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Aggiungi evento/ })).toBeNull();
  });

  it("le proposte si vedono come da salvare", () => {
    avvolgi(<EventiGiornale {...base} giornaleId={undefined} statoPagina="bozza" haPermesso eventi={[]} proposti={[{ tipo: "consegna", ddt_id: "d", testo: "DDT 12" }]} />);
    expect(screen.getByText("DDT 12")).toBeInTheDocument();
    expect(screen.getByText(/da salvare/)).toBeInTheDocument();
    expect(screen.getByText(/Salva la pagina per aggiungere/)).toBeInTheDocument();
  });
});

describe("ProblemiApertiGiornale", () => {
  it("niente riquadro senza problemi", async () => {
    const { container } = avvolgi(<ProblemiApertiGiornale orderId="o1" companyId="az" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("testo, giorni e link alla pagina", async () => {
    mocks.righe = [{ id: "e1", testo: "Infiltrazione", giornale: { id: "g1", data_lavori: "2020-01-01" } }];
    avvolgi(<ProblemiApertiGiornale orderId="o1" companyId="az" />);
    expect(await screen.findByText("Infiltrazione")).toBeInTheDocument();
    expect(screen.getByText(/da \d+ giorni/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apri la pagina" })).toHaveAttribute("href", "/azienda/giornale-lavori?ordine=o1&pagina=g1");
  });
});
