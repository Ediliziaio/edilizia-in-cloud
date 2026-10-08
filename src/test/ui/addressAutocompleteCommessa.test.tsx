import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AddressAutocomplete, { emptyAddress, type AddressData } from "@/components/shared/AddressAutocomplete";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), changed: vi.fn(), submit: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
const prediction = { place_id: "demo", description: "Via Roma 1, Milano" };
const selected = { ...emptyAddress, address_line: "Via Roma 1", address_city: "Milano", address_postal_code: "20100", address_province: "MI", formatted_address: prediction.description, lat: 45.46, lng: 9.19, place_id: "demo" };
function Panel({ initial = emptyAddress, editable = true, disabled = false }: { initial?: AddressData; editable?: boolean; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return <form onSubmit={(event) => { event.preventDefault(); mocks.submit(); }}><AddressAutocomplete label="Indirizzo cantiere" value={value} editableSearch={editable} disabled={disabled} onChange={(next) => { setValue(next); mocks.changed(next); }} /></form>;
}
const query = () => screen.getByRole("combobox", { name: "Indirizzo cantiere" });
const type = (text: string) => fireEvent.change(query(), { target: { value: text } });
const debounce = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(300); }); };
const last = (): AddressData => mocks.changed.mock.calls.at(-1)?.[0];
beforeEach(() => { vi.useFakeTimers(); mocks.invoke.mockReset(); mocks.changed.mockClear(); mocks.submit.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("ricerca indirizzo nella commessa", () => {
  it("mostra il precompilato e conserva testo e spazi anche senza un suggerimento", () => {
    render(<Panel initial={selected} />);
    expect(query()).toHaveValue(prediction.description);
    type("Via nuova ");
    expect(query()).toHaveValue("Via nuova ");
    expect(last()).toMatchObject({ formatted_address: "Via nuova ", lat: null, lng: null, place_id: "" });
  });
  it("cerca dopo 300 ms e selezionare riempie indirizzo e coordinate senza inviare il form", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { predictions: [prediction] }, error: null }).mockResolvedValueOnce({ data: { address_line: "Via Roma 1", city: "Milano", postal_code: "20100", province: "MI", formatted_address: prediction.description, lat: 45.46, lng: 9.19 }, error: null });
    render(<Panel />); type("via roma");
    expect(mocks.invoke).not.toHaveBeenCalled(); await debounce();
    expect(mocks.invoke).toHaveBeenCalledWith("maps-proxy", { body: { action: "autocomplete", query: "via roma", country: "it" } });
    await act(async () => fireEvent.click(screen.getByRole("option", { name: prediction.description })));
    expect(last()).toMatchObject(selected);
    expect(query()).toHaveValue(prediction.description);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("sotto tre caratteri non cerca e nasconde i vecchi suggerimenti", async () => {
    mocks.invoke.mockResolvedValue({ data: { predictions: [prediction] }, error: null });
    render(<Panel />); type("via"); await debounce(); expect(screen.getByRole("listbox")).toBeInTheDocument();
    type("vi"); await debounce(); expect(screen.queryByRole("listbox")).not.toBeInTheDocument(); expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it("il provider non disponibile lascia il testo manuale utilizzabile", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("offline") });
    render(<Panel />); type("Via manuale 5"); await debounce();
    expect(query()).toHaveValue("Via manuale 5"); expect(last().formatted_address).toBe("Via manuale 5");
    expect(screen.getByRole("status")).toHaveTextContent("manualmente");
  });
  it("dettagli non disponibili: conserva il suggerimento scelto, senza coordinate inventate", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { predictions: [prediction] } }).mockResolvedValueOnce({ data: null, error: new Error("offline") });
    render(<Panel />); type("via"); await debounce();
    await act(async () => fireEvent.click(screen.getByRole("option", { name: prediction.description })));
    expect(last()).toMatchObject({ formatted_address: prediction.description, lat: null, lng: null });
    expect(screen.getByRole("status")).toHaveTextContent("Coordinate non disponibili");
  });
  it("una risposta vecchia non sostituisce i suggerimenti della ricerca nuova", async () => {
    let resolveOld!: (data: unknown) => void;
    mocks.invoke.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce({ data: { predictions: [{ place_id: "nuovo", description: "Corso nuovo" }] } });
    render(<Panel />); type("via vecchia"); await debounce(); type("corso nuovo"); await debounce();
    await act(async () => resolveOld({ data: { predictions: [prediction] } }));
    expect(screen.getByRole("option", { name: "Corso nuovo" })).toBeInTheDocument(); expect(screen.queryByRole("option", { name: prediction.description })).not.toBeInTheDocument();
  });
  it("freccia e invio selezionano il suggerimento, non creano la commessa", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { predictions: [prediction] } }).mockResolvedValueOnce({ data: { formatted_address: prediction.description, lat: 45, lng: 9 } });
    render(<Panel />); type("via"); await debounce(); fireEvent.keyDown(query(), { key: "ArrowDown" });
    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");
    await act(async () => fireEvent.keyDown(query(), { key: "Enter" }));
    expect(last().formatted_address).toBe(prediction.description); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("modificando i dettagli manuali aggiorna il testo e rimuove le coordinate precedenti", () => {
    render(<Panel initial={selected} />); fireEvent.click(screen.getByRole("button", { name: "Modifica dettagli indirizzo" }));
    fireEvent.change(screen.getByPlaceholderText("Via Roma 1"), { target: { value: "Via nuova 7" } });
    expect(query()).toHaveValue("Via nuova 7, 20100 Milano, MI"); expect(last()).toMatchObject({ lat: null, lng: null, place_id: "" }); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("il calendario conserva il comportamento attuale: chip, rimozione e nessun invio involontario", () => {
    render(<Panel initial={selected} editable={false} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Rimuovi indirizzo" }));
    expect(query()).toHaveValue(""); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("i dettagli del provider non sovrascrivono una correzione manuale successiva", async () => {
    let resolveDetails!: (data: unknown) => void;
    mocks.invoke.mockResolvedValueOnce({ data: { predictions: [prediction] } }).mockImplementationOnce(() => new Promise((resolve) => { resolveDetails = resolve; }));
    render(<Panel />); type("via"); await debounce();
    fireEvent.click(screen.getByRole("option", { name: prediction.description }));
    fireEvent.click(screen.getByRole("button", { name: "Modifica dettagli indirizzo" }));
    fireEvent.change(screen.getByPlaceholderText("Via Roma 1"), { target: { value: "Indirizzo corretto" } });
    await act(async () => resolveDetails({ data: { formatted_address: prediction.description, lat: 45, lng: 9 } }));
    expect(query()).toHaveValue("Indirizzo corretto"); expect(last()).toMatchObject({ address_line: "Indirizzo corretto", lat: null, lng: null });
  });
  it("la rimozione del componente annulla il debounce", async () => {
    const view = render(<Panel />); type("via"); view.unmount(); await debounce(); expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("durante il salvataggio il campo è disabilitato", () => {
    render(<Panel disabled />); expect(query()).toBeDisabled();
  });
  it("un cambio cliente scarta la risposta dell’indirizzo precedente", async () => {
    let resolveOld!: (data: unknown) => void;
    mocks.invoke.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const view = render(<AddressAutocomplete label="Indirizzo cantiere" value={emptyAddress} editableSearch onChange={mocks.changed} />);
    type("via"); await debounce();
    view.rerender(<AddressAutocomplete label="Indirizzo cantiere" value={selected} editableSearch onChange={mocks.changed} />);
    await act(async () => resolveOld({ data: { predictions: [prediction] } }));
    expect(query()).toHaveValue(prediction.description);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("l’avvio del salvataggio scarta la ricerca ancora in corso", async () => {
    let resolveOld!: (data: unknown) => void;
    mocks.invoke.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const view = render(<Panel />); type("via"); await debounce();
    view.rerender(<Panel disabled />);
    await act(async () => resolveOld({ data: { predictions: [prediction] } }));
    expect(query()).toHaveValue("via"); expect(query()).toBeDisabled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
