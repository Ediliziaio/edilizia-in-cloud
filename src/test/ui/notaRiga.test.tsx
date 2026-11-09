/**
 * La nota di una riga (09/11/2026). Prima si poteva scrivere solo creando la
 * riga, e poi non si vedeva più: le righe nate da sole — una fattura pagata,
 * un movimento di banca — non avevano nemmeno quel momento.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotaRiga } from "@/components/shared/NotaRiga";

const errore = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: errore, success: vi.fn() } }));
afterEach(() => { cleanup(); errore.mockClear(); });

const apri = () => fireEvent.click(screen.getByRole("button", { name: /nota/i }));

describe("Il pulsante della nota", () => {
  it("senza nota invita a scriverla; con la nota la mostra già nel titolo", () => {
    const { unmount } = render(<NotaRiga nota={null} titolo="12/03 · Acconto" onSalva={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Aggiungi una nota a 12/03 · Acconto" })).toBeInTheDocument();
    unmount();
    render(<NotaRiga nota="Pagato in contanti da Mario" titolo="12/03 · Acconto" onSalva={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Nota: Pagato in contanti da Mario" })).toBeInTheDocument();
  });

  it("salva il testo scritto e chiude", async () => {
    const salva = vi.fn().mockResolvedValue(undefined);
    render(<NotaRiga nota={null} titolo="12/03 · Acconto" onSalva={salva} />);
    apri();
    fireEvent.change(screen.getByLabelText("Testo della nota"), {
      target: { value: "  È l'acconto, il saldo a giugno  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva nota" }));
    // Lo spazio intorno non si salva.
    await waitFor(() => expect(salva).toHaveBeenCalledWith("È l'acconto, il saldo a giugno"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("svuotare la nota la toglie, non salva una stringa vuota", async () => {
    const salva = vi.fn().mockResolvedValue(undefined);
    render(<NotaRiga nota="vecchia" titolo="x" onSalva={salva} />);
    apri();
    fireEvent.change(screen.getByLabelText("Testo della nota"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Salva nota" }));
    await waitFor(() => expect(salva).toHaveBeenCalledWith(null));
  });

  it("se non è cambiato niente non chiama il server", async () => {
    const salva = vi.fn();
    render(<NotaRiga nota="uguale" titolo="x" onSalva={salva} />);
    apri();
    fireEvent.click(screen.getByRole("button", { name: "Salva nota" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(salva).not.toHaveBeenCalled();
  });

  it("se il salvataggio fallisce lo dice e tiene aperto quello che hai scritto", async () => {
    const salva = vi.fn().mockRejectedValue(new Error("offline"));
    render(<NotaRiga nota={null} titolo="x" onSalva={salva} />);
    apri();
    fireEvent.change(screen.getByLabelText("Testo della nota"), { target: { value: "importante" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva nota" }));
    await waitFor(() => expect(errore).toHaveBeenCalledWith("Nota non salvata: riprova."));
    expect(screen.getByLabelText("Testo della nota")).toHaveValue("importante");
  });

  it("in sola lettura si legge ma non si scrive", () => {
    render(<NotaRiga nota="solo da leggere" titolo="x" solaLettura onSalva={vi.fn()} />);
    apri();
    expect(screen.getByLabelText("Testo della nota")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salva nota" })).not.toBeInTheDocument();
  });
});
