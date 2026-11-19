import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NuovaAreaDialog } from "@/components/listino/NuovaAreaDialog";
import { preparaAreaPersonalizzata } from "@/lib/listino/nuovaArea";
import { costruisciListino } from "@/lib/listino/lineeListino";

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda" }));
vi.mock("@/hooks/useModelliArea", () => ({
  useModelliDisponibili: () => ({ data: [] as unknown[], isLoading: false }),
  useModelliAreaMutations: () => ({ installa: { isPending: false } }),
  useAnteprimaInstallazione: () => ({ isLoading: false, refetch: vi.fn() }),
}));
afterEach(cleanup);

describe("creazione delle aree dal listino", () => {
  const apri = (props: Partial<React.ComponentProps<typeof NuovaAreaDialog>> = {}) => {
    const onCrea = vi.fn();
    render(<NuovaAreaDialog aree={[]} macrocategorie={[]} inCorso={false} onChiudi={vi.fn()} onCrea={onCrea} {...props} />);
    return onCrea;
  };
  it("crea un'area standard con le sole tipologie scelte", () => {
    const onCrea = apri();
    fireEvent.click(screen.getByRole("checkbox", { name: /Zanzariere/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi l'area Serramenti" }));
    expect(onCrea).toHaveBeenCalledOnce();
    const [area, tipologie] = onCrea.mock.calls[0];
    expect(area.verticale).toBe("serramentista");
    expect(tipologie).toHaveLength(7);
    expect(tipologie.some((t: { nome: string }) => t.nome === "Zanzariere")).toBe(false);
  });
  it("offre e crea un'area personalizzata anche senza modelli pubblicati", () => {
    const onCrea = apri();
    fireEvent.click(screen.getByRole("tab", { name: "Area personalizzata" }));
    const crea = screen.getByRole("button", { name: "Crea area personalizzata" });
    expect(crea).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome dell'area"), { target: { value: "Tende da sole" } });
    fireEvent.change(screen.getByLabelText("Tipologie iniziali, una per riga"), { target: { value: "Tende a bracci\nPergole\nAccessori" } });
    expect(crea).toBeEnabled();
    fireEvent.click(crea);
    expect(onCrea.mock.calls[0][0]).toMatchObject({ chiave: "tende_da_sole", verticale: "tende_da_sole" });
    expect(onCrea.mock.calls[0][1].map((t: { nome: string }) => t.nome)).toEqual(["Tende a bracci", "Pergole", "Accessori"]);
  });
  it("con un errore di lettura ferma la creazione e permette di riprovare", () => {
    const onRiprova = vi.fn();
    const onCrea = apri({ erroreCaricamento: true, onRiprova });
    expect(screen.getByRole("alert")).toHaveTextContent("Le tipologie del listino non si sono caricate");
    expect(screen.getByRole("button", { name: "Aggiungi l'area Serramenti" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(onRiprova).toHaveBeenCalledOnce();
    expect(onCrea).not.toHaveBeenCalled();
  });
  it("blocca i campi e la chiusura durante il salvataggio", () => {
    const { rerender } = render(<NuovaAreaDialog aree={[]} macrocategorie={[]} inCorso={false} onChiudi={vi.fn()} onCrea={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Area personalizzata" }));
    rerender(<NuovaAreaDialog aree={[]} macrocategorie={[]} inCorso onChiudi={vi.fn()} onCrea={vi.fn()} />);
    expect(screen.getByLabelText("Nome dell'area")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Annulla" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Creazione…" })).toBeDisabled();
  });
});

describe("le aree personalizzate si ritrovano dopo il salvataggio", () => {
  it("ricostruisce l'area anche senza prodotti", () => {
    const aree = costruisciListino([], [{ id: "macro", nome: "Pergole", verticali_abilitati: ["tende_da_sole"], tipologia: "tende_da_sole" }], []);
    expect(aree[0]).toMatchObject({ chiave: "tende_da_sole", nome: "Tende da sole" });
    expect(aree[0].tipologie[0].nome).toBe("Pergole");
  });
  it("riconosce sinonimi delle aree standard e nomi già presenti", () => {
    expect(preparaAreaPersonalizzata("Infissi", "Finestre", []).problema).toContain("Solo le tipologie");
    expect(preparaAreaPersonalizzata("Tende da sole", "Pergole", [{ chiave: "tende_da_sole" }]).problema).toContain("già nel listino");
  });
  it("rifiuta tipologie duplicate, mancanti e nomi riservati", () => {
    expect(preparaAreaPersonalizzata("Tende", "Pergole\n PÉRGOLE ", []).area).toBeNull();
    expect(preparaAreaPersonalizzata("Tende", "\n", []).area).toBeNull();
    expect(preparaAreaPersonalizzata("Generale", "Pergole", []).area).toBeNull();
  });
});
