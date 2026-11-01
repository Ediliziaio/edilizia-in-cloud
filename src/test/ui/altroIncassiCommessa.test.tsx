import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/orders/BloccaPrezzoCard", () => ({ BloccaPrezzoCard: (): null => null }));
vi.mock("@/components/orders/BonusRipartizioneCard", () => ({ BonusRipartizioneCard: (): null => null }));
vi.mock("@/components/orders/IvaCommessa", () => ({ IvaCommessa: () => <p>iva</p> }));
vi.mock("@/components/ritenute/RitenuteTab", () => ({ RitenuteTab: () => <p>ritenute</p> }));
import { AltroIncassiCommessa } from "@/components/orders/AltroIncassiCommessa";

afterEach(cleanup);
const mostra = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <AltroIncassiCommessa orderId="o1" vatRate={22} hasBuildingBonus={false} saldoPagato={false} conIva conImporti />
  </MemoryRouter>,
);

describe("Altro su questa commessa", () => {
  it("IVA e ritenute partono chiuse, con titolo e spiegazione", () => {
    const { container } = mostra("/azienda/ordini/o1?tab=finanza");
    expect(screen.getByText("IVA della commessa")).toBeInTheDocument();
    expect(screen.getByText("Ritenute di garanzia")).toBeInTheDocument();
    expect([...container.querySelectorAll("details")].every((d) => !d.open)).toBe(true);
  });
  it("un link alle ritenute le apre", () => {
    const { container } = mostra("/azienda/ordini/o1?tab=finanza#section-ritenute");
    const ritenute = container.querySelector("#section-ritenute details") as HTMLDetailsElement;
    expect(ritenute.open).toBe(true);
  });
});
