import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ComputoProgetto from "@/components/computo/ComputoProgetto";
import type { AllegatoComputo } from "@/lib/computo/editorNativo";

vi.mock("@/lib/computo/allegatiLocali", () => ({ leggiAllegatoLocale: vi.fn().mockResolvedValue(null), caricaAllegatoLocale: vi.fn() }));
const busy = vi.fn();
function Progetto() {
  const [allegati, setAllegati] = useState<AllegatoComputo[]>([
    { id: "foto", nome: "foto.jpg", tipo: "foto", mime: "image/jpeg", dimensione: 10, includi: true },
    { id: "pianta", nome: "pianta.pdf", tipo: "planimetria", mime: "application/pdf", dimensione: 10, includi: true },
  ]);
  return <><ComputoProgetto scope="collaudo" allegati={allegati} onChange={setAllegati} onBusy={busy} /><output aria-label="Ordine allegati">{allegati.map(a => `${a.id}:${a.includi}`).join(",")}</output></>;
}
describe("allegati del computo", () => {
  it("ordina gli allegati senza perdere la selezione di inclusione", () => {
    render(<Progetto />);
    expect(screen.getByRole("button", { name: "Anticipa foto.jpg" })).toBeDisabled();
    fireEvent.click(screen.getByRole("switch", { name: "Includi foto.jpg nel PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Anticipa pianta.pdf" }));
    expect(screen.getByLabelText("Ordine allegati")).toHaveTextContent("pianta:true,foto:false");
    expect(screen.getByRole("button", { name: "Posticipa foto.jpg" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Includi foto.jpg nel PDF" })).not.toBeChecked();
  });
});
