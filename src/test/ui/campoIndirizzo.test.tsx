/**
 * CampoIndirizzo: il campo con i suggerimenti che usano tutti i moduli (30/10/2026).
 *
 * Si scrive sempre liberamente: i suggerimenti aiutano, non obbligano. Scegliendone uno il campo prende subito il
 * testo del suggerimento e poi, arrivati i dettagli, chi lo usa riceve via, CAP, città, provincia e coordinate
 * (onScegli); senza onScegli il campo diventa la riga all'italiana «Via Roma 1, 20121 Milano (MI)».
 */
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampoIndirizzo } from "@/components/shared/CampoIndirizzo";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), changed: vi.fn(), scelto: vi.fn(), senzaDettagli: vi.fn(), submit: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

const sugg = { place_id: "here:1", description: "Via Roma, 1, 20121 Milano MI, Italia" };
const det = { formatted_address: sugg.description, address_line: "Via Roma 1", city: "Milano", postal_code: "20121", province: "MI", lat: 45.46, lng: 9.19 };

function Campo({ iniziale = "", conScelta = true, senzaDettagli = false, disabled = false }: { iniziale?: string; conScelta?: boolean; senzaDettagli?: boolean; disabled?: boolean }) {
  const [testo, setTesto] = useState(iniziale);
  return (
    <form onSubmit={(e) => { e.preventDefault(); mocks.submit(); }}>
      <label htmlFor="cantiere">Indirizzo del cantiere</label>
      <CampoIndirizzo
        id="cantiere"
        value={testo}
        disabled={disabled}
        placeholder="Via del cantiere, 5 — 20100 Milano"
        onChange={(t) => { setTesto(t); mocks.changed(t); }}
        onScegli={conScelta ? (a) => { setTesto(a.via); mocks.scelto(a); } : undefined}
        onScegliSenzaDettagli={senzaDettagli ? mocks.senzaDettagli : undefined}
      />
      <button type="button" onClick={() => setTesto("Indirizzo da fuori")}>Cambia da fuori</button>
    </form>
  );
}

const campo = () => screen.getByRole("combobox", { name: "Indirizzo del cantiere" });
const scrivi = (t: string) => fireEvent.change(campo(), { target: { value: t } });
const attesa = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(300); }); };
const ultimoTesto = (): string => mocks.changed.mock.calls.at(-1)?.[0];

beforeEach(() => { vi.useFakeTimers(); Object.values(mocks).forEach((m) => m.mockReset()); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("CampoIndirizzo", () => {
  it("si scrive liberamente e cerca dopo 300 ms", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { predictions: [sugg] }, error: null });
    render(<Campo />);
    scrivi("via roma");
    expect(campo()).toHaveValue("via roma");
    expect(ultimoTesto()).toBe("via roma");
    expect(mocks.invoke).not.toHaveBeenCalled();
    await attesa();
    expect(mocks.invoke).toHaveBeenCalledWith("maps-proxy", { body: { action: "autocomplete", query: "via roma", country: "it" } });
    expect(screen.getByRole("option", { name: sugg.description })).toBeInTheDocument();
    expect(campo()).toHaveAttribute("aria-expanded", "true");
  });

  it("scegliendo: subito il testo del suggerimento, poi via, CAP, città, provincia e coordinate", async () => {
    let risolvi!: (v: unknown) => void;
    mocks.invoke
      .mockResolvedValueOnce({ data: { predictions: [sugg] }, error: null })
      .mockImplementationOnce(() => new Promise((r) => { risolvi = r; }));
    render(<Campo />);
    scrivi("via roma");
    await attesa();
    fireEvent.click(screen.getByRole("option", { name: sugg.description }));
    expect(campo()).toHaveValue(sugg.description);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await act(async () => risolvi({ data: det, error: null }));
    expect(mocks.invoke).toHaveBeenLastCalledWith("maps-proxy", { body: { action: "place-details", place_id: sugg.place_id } });
    expect(mocks.scelto).toHaveBeenCalledTimes(1);
    expect(mocks.scelto).toHaveBeenCalledWith({
      id: sugg.place_id, via: "Via Roma 1", cap: "20121", citta: "Milano", provincia: "MI",
      testo: "Via Roma 1, 20121 Milano (MI)", etichetta: sugg.description, lat: 45.46, lng: 9.19,
    });
    expect(campo()).toHaveValue("Via Roma 1");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("senza onScegli il campo diventa la riga all'italiana", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { predictions: [sugg] }, error: null })
      .mockResolvedValueOnce({ data: det, error: null });
    render(<Campo conScelta={false} />);
    scrivi("via roma");
    await attesa();
    await act(async () => fireEvent.click(screen.getByRole("option", { name: sugg.description })));
    expect(campo()).toHaveValue("Via Roma 1, 20121 Milano (MI)");
    expect(ultimoTesto()).toBe("Via Roma 1, 20121 Milano (MI)");
  });

  it("sotto tre caratteri non cerca e nasconde i suggerimenti vecchi", async () => {
    mocks.invoke.mockResolvedValue({ data: { predictions: [sugg] }, error: null });
    render(<Campo />);
    scrivi("vi");
    await attesa();
    expect(mocks.invoke).not.toHaveBeenCalled();
    scrivi("via");
    await attesa();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    scrivi("vi");
    await attesa();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it("nessun risultato: lo dice, e si può scrivere a mano", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { predictions: [] }, error: null });
    render(<Campo />);
    scrivi("via inesistente 99");
    await attesa();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Nessun indirizzo trovato");
    expect(campo()).toHaveValue("via inesistente 99");
  });

  it("servizio non disponibile: il testo scritto resta e il campo lo dice", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error("offline") });
    render(<Campo />);
    scrivi("Via manuale 5");
    await attesa();
    expect(campo()).toHaveValue("Via manuale 5");
    expect(screen.getByRole("status")).toHaveTextContent("manualmente");
  });

  it("dettagli non disponibili: resta il testo scelto, nessuna coordinata inventata", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { predictions: [sugg] }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("offline") });
    render(<Campo senzaDettagli />);
    scrivi("via roma");
    await attesa();
    await act(async () => fireEvent.click(screen.getByRole("option", { name: sugg.description })));
    expect(mocks.scelto).not.toHaveBeenCalled();
    expect(mocks.senzaDettagli).toHaveBeenCalledWith({ id: sugg.place_id, testo: sugg.description });
    expect(campo()).toHaveValue(sugg.description);
    expect(screen.getByRole("status")).toHaveTextContent("Coordinate non disponibili");
  });

  it("una risposta vecchia non sostituisce i suggerimenti della ricerca nuova", async () => {
    let vecchia!: (v: unknown) => void;
    mocks.invoke
      .mockImplementationOnce(() => new Promise((r) => { vecchia = r; }))
      .mockResolvedValueOnce({ data: { predictions: [{ place_id: "nuovo", description: "Corso nuovo" }] }, error: null });
    render(<Campo />);
    scrivi("via vecchia");
    await attesa();
    scrivi("corso nuovo");
    await attesa();
    await act(async () => vecchia({ data: { predictions: [sugg] }, error: null }));
    expect(screen.getByRole("option", { name: "Corso nuovo" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: sugg.description })).not.toBeInTheDocument();
  });

  it("freccia e invio scelgono il suggerimento senza inviare il modulo; a lista chiusa l'invio arriva al modulo", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { predictions: [sugg] }, error: null })
      .mockResolvedValueOnce({ data: det, error: null });
    render(<Campo />);
    scrivi("via roma");
    await attesa();
    fireEvent.keyDown(campo(), { key: "ArrowDown" });
    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");
    expect(campo()).toHaveAttribute("aria-activedescendant", screen.getByRole("option").id);
    await act(async () => fireEvent.keyDown(campo(), { key: "Enter" }));
    expect(mocks.scelto).toHaveBeenCalledTimes(1);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Esc chiude i suggerimenti, il clic fuori anche", async () => {
    mocks.invoke.mockResolvedValue({ data: { predictions: [sugg] }, error: null });
    render(<Campo />);
    scrivi("via roma");
    await attesa();
    fireEvent.keyDown(campo(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    scrivi("via roma 1");
    await attesa();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("un cambio fatto da fuori annulla i dettagli ancora in arrivo", async () => {
    let risolvi!: (v: unknown) => void;
    mocks.invoke
      .mockResolvedValueOnce({ data: { predictions: [sugg] }, error: null })
      .mockImplementationOnce(() => new Promise((r) => { risolvi = r; }));
    render(<Campo />);
    scrivi("via roma");
    await attesa();
    fireEvent.click(screen.getByRole("option", { name: sugg.description }));
    fireEvent.click(screen.getByRole("button", { name: "Cambia da fuori" }));
    await act(async () => risolvi({ data: det, error: null }));
    expect(mocks.scelto).not.toHaveBeenCalled();
    expect(campo()).toHaveValue("Indirizzo da fuori");
  });

  it("disabilitato durante il salvataggio: la ricerca in corso si scarta", async () => {
    let vecchia!: (v: unknown) => void;
    mocks.invoke.mockImplementationOnce(() => new Promise((r) => { vecchia = r; }));
    const vista = render(<Campo />);
    scrivi("via roma");
    await attesa();
    vista.rerender(<Campo disabled />);
    await act(async () => vecchia({ data: { predictions: [sugg] }, error: null }));
    expect(campo()).toBeDisabled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("tolto dalla pagina non cerca più", async () => {
    const vista = render(<Campo />);
    scrivi("via roma");
    vista.unmount();
    await attesa();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
