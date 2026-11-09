import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CampaignPageField } from "@/components/ads/CampaignPageField";
afterEach(cleanup);
const pages = [{ id: "a", asset_id: "page-a", asset_name: "Pagina A", selected: true }, { id: "b", asset_id: "page-b", asset_name: "Pagina B", selected: true }];
describe("scelta della Pagina nell'annuncio", () => {
  it("richiede una scelta leggibile e funziona con il controllo nativo accessibile", () => {
    const change = vi.fn(); render(<CampaignPageField pages={pages} onChange={change} />);
    const picker = screen.getByLabelText("Pagina Facebook dell’annuncio");
    expect((picker as HTMLSelectElement).value).toBe("");
    fireEvent.change(picker, { target: { value: "page-b" } });
    expect(change).toHaveBeenCalledWith("page-b");
  });
  it("mostra l'unica Pagina e segnala una scelta non più disponibile senza sostituirla", () => {
    const view = render(<CampaignPageField pages={[pages[0]]} onChange={vi.fn()} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("page-a");
    view.rerender(<CampaignPageField pages={[pages[0]]} value="page-scomparsa" onChange={vi.fn()} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
    expect(screen.getByText(/non è più collegata/)).toBeTruthy();
  });
});
