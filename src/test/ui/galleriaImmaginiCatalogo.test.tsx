import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GalleriaImmaginiCatalogo } from "@/components/listino/GalleriaImmaginiCatalogo";
import { leggiImmaginiCatalogo, type BozzaImmagineCatalogo } from "@/lib/listino/immaginiCatalogo";

const mocks = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState<BozzaImmagineCatalogo[]>(() => leggiImmaginiCatalogo(undefined, "https://example.test/originale.jpg"));
  return <GalleriaImmaginiCatalogo value={value} onChange={setValue} disabled={disabled} />;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${crypto.randomUUID()}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Galleria linee", () => {
  it("carica piu foto, cambia ruolo e ordine, modifica didascalie", () => {
    render(<Harness />);
    const files = [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "b.png", { type: "image/png" })];
    fireEvent.change(screen.getByLabelText("Seleziona immagini della linea"), { target: { files } });
    expect(screen.getAllByRole("img")).toHaveLength(3);
    fireEvent.change(screen.getAllByLabelText("Uso nel preventivo")[1], { target: { value: "principale" } });
    expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("dettaglio");
    fireEvent.change(screen.getAllByLabelText("Didascalia")[1], { target: { value: "Sezione vera" } });
    fireEvent.click(screen.getByRole("button", { name: "Sposta su immagine 2" }));
    expect((screen.getAllByLabelText("Didascalia")[0] as HTMLInputElement).value).toBe("Sezione vera");
    expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("principale");
  });
  it("non accetta file non validi e libera le anteprime alla chiusura", () => {
    const view = render(<Harness />);
    fireEvent.change(screen.getByLabelText("Seleziona immagini della linea"), { target: { files: [new File(["pdf"], "file.pdf", { type: "application/pdf" })] } });
    expect(mocks.error).toHaveBeenCalled();
    expect(screen.getAllByRole("img")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Seleziona immagini della linea"), { target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" })] } });
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it("blocca i controlli durante il salvataggio", () => {
    render(<Harness disabled />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Rimuovi immagine 1" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
