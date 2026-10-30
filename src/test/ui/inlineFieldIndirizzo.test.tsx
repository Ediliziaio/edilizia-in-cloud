/**
 * InlineField in modalità indirizzo (30/10/2026): scheda cliente (residenza e cantiere) e scheda contatto.
 *
 * Il campo si modifica cliccando il valore; in modifica cerca l'indirizzo come gli altri moduli. Scegliendo un
 * suggerimento il padre salva via, città, CAP e provincia insieme (onSelectIndirizzo) e il campo NON salva anche il
 * testo; Invio ed Esc sulla lista aperta scelgono e chiudono la lista, non salvano né annullano la modifica.
 */
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineField } from "@/components/marketing/contacts/InlineField";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), salva: vi.fn(), scelto: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/components/shared/ComuneAutocomplete", () => ({ ComuneAutocomplete: (): null => null }));

const sugg = { place_id: "here:1", description: "Via Roma, 1, 20121 Milano MI, Italia" };
const det = { formatted_address: sugg.description, address_line: "Via Roma 1", city: "Milano", postal_code: "20121", province: "MI", lat: 45.46, lng: 9.19 };

function Scheda({ conScelta = true }: { conScelta?: boolean }) {
  const [valore, setValore] = useState("Via Vecchia 3");
  return (
    <InlineField
      label="Indirizzo"
      value={valore}
      onSave={(v) => { setValore(v); mocks.salva(v); }}
      indirizzo
      onSelectIndirizzo={conScelta ? (a) => { setValore(a.via); mocks.scelto(a); } : undefined}
    />
  );
}

const apri = () => fireEvent.click(screen.getByText("Via Vecchia 3"));
const campo = () => screen.getByRole("combobox", { name: "Indirizzo" });
const scrivi = (t: string) => fireEvent.change(campo(), { target: { value: t } });
const attesa = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(300); }); };

beforeEach(() => { vi.useFakeTimers(); Object.values(mocks).forEach((m) => m.mockReset()); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("InlineField con la ricerca dell'indirizzo", () => {
  it("scegliendo un suggerimento il padre salva i pezzi una volta; il testo non si salva", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { predictions: [sugg] }, error: null })
      .mockResolvedValueOnce({ data: det, error: null });
    render(<Scheda />);
    apri();
    scrivi("via roma");
    await attesa();
    fireEvent.click(screen.getByRole("option", { name: sugg.description }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mocks.scelto).toHaveBeenCalledTimes(1);
    expect(mocks.scelto.mock.calls[0][0]).toMatchObject({ via: "Via Roma 1", citta: "Milano", cap: "20121", provincia: "MI" });
    expect(mocks.salva).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Via Roma 1")).toBeInTheDocument();
  });

  it("Invio con la lista aperta sceglie, non salva il testo scritto", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { predictions: [sugg] }, error: null })
      .mockResolvedValueOnce({ data: det, error: null });
    render(<Scheda />);
    apri();
    scrivi("via roma");
    await attesa();
    fireEvent.keyDown(campo(), { key: "Enter" });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mocks.scelto).toHaveBeenCalledTimes(1);
    expect(mocks.salva).not.toHaveBeenCalled();
  });

  it("a lista chiusa Invio salva quello che si è scritto", async () => {
    mocks.invoke.mockResolvedValue({ data: { predictions: [] }, error: null });
    render(<Scheda />);
    apri();
    scrivi("Strada provinciale 12 km 3");
    await attesa();
    fireEvent.keyDown(campo(), { key: "Enter" });
    expect(mocks.salva).toHaveBeenCalledWith("Strada provinciale 12 km 3");
    expect(mocks.scelto).not.toHaveBeenCalled();
  });

  it("Esc con la lista aperta chiude solo la lista; il secondo Esc annulla la modifica", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { predictions: [sugg] }, error: null });
    render(<Scheda />);
    apri();
    scrivi("via roma");
    await attesa();
    fireEvent.keyDown(campo(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(campo()).toHaveValue("via roma");
    fireEvent.keyDown(campo(), { key: "Escape" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Via Vecchia 3")).toBeInTheDocument();
    expect(mocks.salva).not.toHaveBeenCalled();
  });

  it("senza onSelectIndirizzo la scelta mette la riga intera, che si salva uscendo dal campo", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { predictions: [sugg] }, error: null })
      .mockResolvedValueOnce({ data: det, error: null });
    render(<Scheda conScelta={false} />);
    apri();
    scrivi("via roma");
    await attesa();
    fireEvent.click(screen.getByRole("option", { name: sugg.description }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(campo()).toHaveValue("Via Roma 1, 20121 Milano (MI)");
    fireEvent.blur(campo());
    expect(mocks.salva).toHaveBeenCalledWith("Via Roma 1, 20121 Milano (MI)");
  });
});
