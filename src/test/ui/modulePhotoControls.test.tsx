import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorBlocco } from "@/components/preventivi/EditorBlocco";
import { EditorFotoPagina } from "@/components/preventivi/EditorFotoPagina";
import { ModulePhotoUpdateButton } from "@/components/preventivi/modules/ModulePhotoUpdateButton";
const upload = () => <div data-testid="uploader">Caricamento</div>;
describe("Optional photo controls", () => {
  it("resetting texts never replaces the company's photo and asks before replacing text", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onChange = vi.fn();
    const saved = { controlli: { titolo: "Titolo aziendale", foto: ["/foto-azienda.jpg"], senzaFoto: false, nota: "Didascalia aziendale" } };
    render(<EditorBlocco chiave="controlli" settore="serramenti" salvati={saved} onSalvati={onChange} campoFoto={upload} />);
    fireEvent.click(screen.getByRole("button", { name: "Ripristina testi standard" }));
    expect(onChange).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Ripristina testi standard" }));
    expect(onChange.mock.calls[0][0].controlli).toEqual({ foto: ["/foto-azienda.jpg"], senzaFoto: false, nota: "Didascalia aziendale" });
    confirm.mockRestore();
  });
  it("offers a separate photo reset without resetting the authored title", () => {
    const onChange = vi.fn();
    render(<EditorBlocco chiave="controlli" settore="serramenti" salvati={{ controlli: { titolo: "Il nostro controllo", foto: [], senzaFoto: true } }} onSalvati={onChange} campoFoto={upload} />);
    fireEvent.click(screen.getByRole("button", { name: "Ripristina immagini standard" }));
    expect(onChange.mock.calls[0][0].controlli).toEqual({ titolo: "Il nostro controllo" });
  });
  it("offers exact corrections even after revision 2, only on explicit click", () => {
    const controlli = { foto: ["/pdf-stock/tetti/controllo-termico.jpg"], senzaFoto: false, titolo: "Titolo del cliente" };
    const value = { modulo_intervento: "impermeabilizzazione", modulo_foto_revisione: 2, controlli,
      modulo_defaults: { modulo_intervento: "impermeabilizzazione", controlli } };
    const onChange = vi.fn();
    const { rerender } = render(<ModulePhotoUpdateButton value={value} sector="tetti" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna le foto di serie del modulo" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0][0];
    expect(updated.controlli).toMatchObject({ titolo: "Titolo del cliente", foto: ["/module-art/tetti-terrazzo-raccordi-v1.jpg"] });
    rerender(<ModulePhotoUpdateButton value={updated} sector="tetti" onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "Aggiorna le foto di serie del modulo" })).toBeNull();
  });
  it("does not display a large second empty slot beside an existing image", () => {
    render(<EditorBlocco chiave="controlli" settore="serramenti" salvati={{ controlli: { foto: ["/pdf-stock/serramenti/controllo-squadro.jpg"] } }} onSalvati={vi.fn()} campoFoto={upload} />);
    expect(screen.queryByTestId("uploader")).toBeNull();
    fireEvent.click(screen.getByText("Aggiungi seconda foto (facoltativa)"));
    expect(screen.getByTestId("uploader")).toBeTruthy();
  });
  it("hides the alternative uploader until requested", () => {
    render(<EditorFotoPagina chiave="cta" settore="serramenti" salvati={{ pagina_cta: { foto: ["/pdf-stock/serramenti/risultato.jpg"] } }} onSalvati={vi.fn()} campoFoto={upload} />);
    expect(screen.queryByTestId("uploader")).toBeNull();
    fireEvent.click(screen.getByText("Sostituisci con una vostra foto"));
    expect(screen.getByTestId("uploader")).toBeTruthy();
  });
});
