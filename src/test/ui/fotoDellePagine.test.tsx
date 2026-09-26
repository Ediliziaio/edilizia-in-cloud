import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/rich-text-editor-safe", () => ({
  RichTextEditorSafe: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Testo" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { SerramentiPagesOrderEditor } from "@/components/serramenti/SerramentiPagesOrderEditor";
import { FvPagesOrderEditor } from "@/components/fotovoltaico/FvPagesOrderEditor";
import { OrdineCapitoli } from "@/components/preventivi/OrdineCapitoli";

/** Le foto delle pagine (22/09/2026): di serie per settore, l'azienda le cambia o le toglie. */
afterEach(cleanup);

function Serramenti() {
  const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
  return (
    <>
      <SerramentiPagesOrderEditor value={null} onChange={() => {}} blocchi={blocchi} onBlocchi={setBlocchi} campoFoto={() => <div>carica</div>} />
      <output data-testid="salvato">{JSON.stringify(blocchi)}</output>
    </>
  );
}
function Fotovoltaico() {
  const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
  return (
    <>
      <FvPagesOrderEditor value={null} onChange={() => {}} blocchi={blocchi} onBlocchi={setBlocchi} campoFoto={() => <div>carica</div>} />
      <output data-testid="salvato">{JSON.stringify(blocchi)}</output>
    </>
  );
}
function Edile() {
  const [blocchi, setBlocchi] = useState<Record<string, unknown>>({});
  return (
    <>
      <OrdineCapitoli ordine={null} pagine={[]} onOrdine={() => {}} onPagine={() => {}} campoFoto={() => <div>carica</div>} settore="bagni" blocchi={blocchi} onBlocchi={setBlocchi} />
      <output data-testid="salvato">{JSON.stringify(blocchi)}</output>
    </>
  );
}
const salvato = () => JSON.parse(screen.getByTestId("salvato").textContent ?? "{}");

describe("editor: la foto delle pagine", () => {
  it("Serramenti: la foto del percorso si toglie e torna di serie", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Serramenti />);
    fireEvent.click(screen.getByRole("button", { name: "Foto di Il tuo percorso" }));
    expect(screen.getByText("di serie")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Togli la foto/ }));
    expect(salvato()).toEqual({ pagina_percorso: { foto: [], senzaFoto: true } });
    // Il pulsante si chiama «Ripristina immagine standard» dal 25/09/2026 (prima
    // «Torna alla foto di serie»): conta che la foto torni quella di serie.
    fireEvent.click(screen.getByRole("button", { name: /Ripristina immagine standard/ }));
    expect(salvato()).toEqual({});
    expect(screen.getByText("di serie")).toBeTruthy();
  });

  it("Fotovoltaico: la foto delle garanzie si sceglie dalla libreria", () => {
    render(<Fotovoltaico />);
    fireEvent.click(screen.getByRole("button", { name: "Foto di Chi siamo e garanzie" }));
    fireEvent.click(screen.getByRole("button", { name: /Scegli dalla libreria/ }));
    // Le tavole no: qui la foto riempie una fascia e si ritaglia, le scritte si perderebbero.
    expect(screen.queryByRole("button", { name: /tavola/ })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /villa tetto coppi/ })[0]);
    expect(salvato()).toEqual({ pagina_garanzie: { foto: ["/pdf-stock/fotovoltaico/villa-tetto-coppi.jpg"], senzaFoto: false } });
  });

  it("edili: «I prossimi passi» ha la sua foto, di serie il bagno finito (classico)", () => {
    const { container } = render(<Edile />);
    fireEvent.click(screen.getByRole("button", { name: "Foto di I prossimi passi" }));
    // Dal 22/09/2026 il bagno classico: quello moderno è già nel diario fotografico.
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/pdf-stock/bagni/risultato-classico.jpg");
  });
});
