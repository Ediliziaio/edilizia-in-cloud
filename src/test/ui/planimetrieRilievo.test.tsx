import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RilievoTerreno } from "@/components/planimetrie/editor/RilievoTerreno";

describe("finestra del rilievo", () => {
  it("carica il CSV, lo centra sulla casa e lo passa all'editor", async () => {
    const onCambia = vi.fn();
    render(<RilievoTerreno aperto onChiudi={() => undefined} rilievo={undefined} centroPianta={{ x: 400, y: -300 }} onCambia={onCambia} />);
    const righe = Array.from({ length: 30 }, (_, i) => `${1500000 + (i % 6)} ${5000000 + Math.floor(i / 6)} ${250 + (i % 6) * 0.2}`).join("\n");
    const file = new File([righe], "rilievo.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("File del rilievo"), { target: { files: [file] } });
    expect(await screen.findByText(/30 punti/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Usa il rilievo" }));
    await waitFor(() => expect(onCambia).toHaveBeenCalled());
    expect(onCambia.mock.calls[0][0]).toMatchObject({ nome: "rilievo.csv", posa: { dx: 400, dy: -300 } });
  });
  it("file senza quote: frase chiara", async () => {
    render(<RilievoTerreno aperto onChiudi={() => undefined} rilievo={undefined} centroPianta={{ x: 0, y: 0 }} onCambia={() => undefined} />);
    const file = new File(["1 1 5\n2 1 5\n1 2 5"], "piatto.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("File del rilievo"), { target: { files: [file] } });
    expect(await screen.findByText(/stessa quota/)).toBeTruthy();
  });
});
