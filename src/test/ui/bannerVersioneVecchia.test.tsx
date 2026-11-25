import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 25/11/2026: l'operaio non vedeva i cantieri perché la sua app era vecchia di tre giorni.
// Questa è la riga rossa che glielo dice, con due uscite diverse: il bottone sul web,
// lo store nell'app installata (dove il codice sta nel pacchetto e un deploy non arriva).
const stato = vi.hoisted(() => ({
  daAggiornare: true,
  build: "2026-11-22T18:00:00+01:00",
  nativa: false,
  svuotato: vi.fn(),
}));

vi.mock("@/hooks/campo/useVersioneApp", () => ({
  useVersioneApp: () => ({ daAggiornare: stato.daAggiornare, build: stato.build }),
}));
vi.mock("@/lib/campo/versioneApp", () => ({
  svuotaERiapri: () => { stato.svuotato(); return Promise.resolve(); },
}));
vi.mock("@/lib/mobile", () => ({ get isNative() { return stato.nativa; } }));
vi.mock("@/lib/campo/lingua/LinguaCampo", () => ({
  useT: () => (testo: string, valori?: Record<string, string>) =>
    testo.replace(/\{(\w+)\}/g, (tutto, nome: string) => valori?.[nome] ?? tutto),
  useFormatiCampo: () => ({ data: (d: string) => new Date(d).toLocaleDateString("it-IT") }),
}));

const { default: BannerVersioneVecchia } = await import("@/components/campo/BannerVersioneVecchia");

beforeEach(() => {
  stato.daAggiornare = true;
  stato.build = "2026-11-22T18:00:00+01:00";
  stato.nativa = false;
  stato.svuotato.mockClear();
});
afterEach(cleanup);

describe("avviso «app da aggiornare» nell'area operaio", () => {
  it("non si vede quando l'app è aggiornata", () => {
    stato.daAggiornare = false;
    render(<BannerVersioneVecchia />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("dice da quando è vecchia e che i dati possono essere sbagliati", () => {
    render(<BannerVersioneVecchia />);
    const avviso = screen.getByRole("alert");
    expect(avviso.textContent).toContain("22/11/2026");
    expect(avviso.textContent).toContain("possono essere sbagliati");
  });

  it("sul web offre il bottone che svuota e riapre", () => {
    render(<BannerVersioneVecchia />);
    const bottone = screen.getByRole("button", { name: /Aggiorna adesso/i });
    fireEvent.click(bottone);
    expect(stato.svuotato).toHaveBeenCalledTimes(1);
    // Due tocchi non fanno partire due ricariche.
    expect((bottone as HTMLButtonElement).disabled).toBe(true);
  });

  it("nell'app installata manda allo store, senza bottone che non servirebbe", () => {
    stato.nativa = true;
    render(<BannerVersioneVecchia />);
    expect(screen.getByRole("alert").textContent).toContain("store");
    expect(screen.queryByRole("button")).toBeNull();
    expect(stato.svuotato).not.toHaveBeenCalled();
  });
});
