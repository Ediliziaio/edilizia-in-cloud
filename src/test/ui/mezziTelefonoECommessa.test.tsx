/**
 * Mezzi fuori dalla loro pagina: sul telefono di chi li ha in carico e nella
 * commessa. Sul telefono l'attrezzo caricato sul furgone sta dentro la scheda
 * del furgone, la polizza rinnovata non compare, un documento scaduto avvisa e
 * i documenti si aprono con un link vero (su iPhone un'apertura dopo un'attesa
 * viene bloccata); i km non tornano indietro. Nella commessa la card non c'è
 * se l'azienda non ha mezzi, e con un mezzo mostra i giorni e la stima.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MezzoInCarico } from "@/types/mezzi";

const stato = vi.hoisted(() => ({
  mieiMezzi: [] as unknown[],
  link: new Map<string, string>(),
  mezzi: [] as unknown[],
  sulCantiere: [] as unknown[],
  costi: { documenti: [] as unknown[], manutenzioni: [] as unknown[] },
  permessi: { canViewWarehouse: true, canEditWarehouse: true, isAdmin: false, solaLettura: false },
}));

vi.mock("@/hooks/useMezzi", () => {
  const mutazione = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    useMieiMezzi: () => ({ data: stato.mieiMezzi, isLoading: false, isError: false, error: null as Error | null, refetch: vi.fn(), isFetching: false }),
    useCopertineMezzi: () => ({ data: stato.link }),
    useMezzoSegnalazioni: () => ({ data: [] as unknown[] }),
    useInviaSegnalazione: mutazione,
    linkFileMezzo: vi.fn(),
    useMezzi: () => ({ data: stato.mezzi }),
    useMezziDellaCommessa: () => ({ data: stato.sulCantiere, isLoading: false, error: null as Error | null, refetch: vi.fn() }),
    useCostiParco: () => ({ data: stato.costi }),
    useAssegnaMezzoACommessa: mutazione,
  };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));

import CampoMezzi from "@/pages/campo/CampoMezzi";
import { MezziCommessaCard } from "@/components/mezzi/MezziCommessaCard";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T10:00:00Z"));
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});
afterAll(() => vi.useRealTimers());
afterEach(() => cleanup());

const AZ = "778a2c76-1253-49f2-a5e8-283363ac3e29";
const furgone: MezzoInCarico = {
  id: "m1", company_id: AZ, nome: "Ducato bianco", tipo: "furgone", targa: "GA123BC", marca: "Fiat", modello: "Ducato",
  stato: "in_servizio", contatore: 84000, contatore_unita: "km", contatore_aggiornato_il: "2026-09-20",
  foto_path: null, su_mezzo_id: null,
  documenti: [
    { id: "d1", categoria: "assicurazione", titolo: "Polizza 2026", ente: null, data_scadenza: "2027-03-01", alert_giorni_prima: 30, file_path: `${AZ}/m1/polizza-2026.pdf`, file_name: "polizza-2026.pdf" },
    { id: "d0", categoria: "assicurazione", titolo: "Polizza 2025", ente: null, data_scadenza: "2026-03-01", alert_giorni_prima: 30, file_path: `${AZ}/m1/polizza-2025.pdf`, file_name: "polizza-2025.pdf" },
    { id: "d2", categoria: "revisione", titolo: null, ente: null, data_scadenza: "2026-09-01", alert_giorni_prima: 30, file_path: null, file_name: null },
  ],
};
const demolitore: MezzoInCarico = {
  ...furgone, id: "m2", nome: "Demolitore Hilti", tipo: "attrezzatura", targa: null, marca: null, modello: null,
  contatore: null, su_mezzo_id: "m1", documenti: [],
};

describe("Il mio mezzo, dal telefono", () => {
  it("mette l'attrezzo nella scheda del furgone, nasconde la polizza rinnovata e avvisa della revisione scaduta", () => {
    stato.mieiMezzi = [furgone, demolitore];
    stato.link = new Map([[`${AZ}/m1/polizza-2026.pdf`, "https://firmato.example/polizza-2026"]]);
    render(<CampoMezzi />);

    expect(screen.getByRole("heading", { name: "Il mio mezzo" })).toBeTruthy();
    expect(screen.getAllByRole("region")).toHaveLength(1);
    const scheda = screen.getByRole("region", { name: "Ducato bianco" });
    expect(within(scheda).getByText("Attrezzi a bordo")).toBeTruthy();
    expect(within(scheda).getByText("Demolitore Hilti")).toBeTruthy();

    expect(within(scheda).getByText("Polizza 2026")).toBeTruthy();
    expect(within(scheda).queryByText("Polizza 2025")).toBeNull();
    expect(within(scheda).getByText(/revisione: scadenza passata/i)).toBeTruthy();

    const apri = within(scheda).getByRole("link", { name: "Apri Polizza 2026" });
    expect(apri.getAttribute("href")).toBe("https://firmato.example/polizza-2026");
    expect(apri.getAttribute("target")).toBe("_blank");
  });

  it("non accetta km più bassi di quelli già segnati", () => {
    stato.mieiMezzi = [furgone];
    render(<CampoMezzi />);
    fireEvent.click(screen.getByRole("button", { name: /Aggiorna km/ }));
    const campo = screen.getByLabelText("Km segnati adesso");
    fireEvent.change(campo, { target: { value: "83000" } });
    expect(screen.getByText(/meno dell'ultimo valore/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Salva" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(campo, { target: { value: "84500" } });
    expect(screen.queryByText(/meno dell'ultimo valore/)).toBeNull();
    expect((screen.getByRole("button", { name: "Salva" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("senza mezzi in carico lo dice", () => {
    stato.mieiMezzi = [];
    render(<CampoMezzi />);
    expect(screen.getByText("Non hai mezzi in carico")).toBeTruthy();
  });
});

describe("Mezzi sul cantiere, nella commessa", () => {
  const conRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

  it("non compare se l'azienda non ha mezzi", () => {
    stato.mezzi = [];
    stato.sulCantiere = [];
    const { container } = conRouter(<MezziCommessaCard orderId="o1" />);
    expect(container.textContent).toBe("");
  });

  it("mostra il mezzo, i giorni e la stima del costo", () => {
    stato.mezzi = [{ id: "m1", nome: "Ducato bianco", targa: "GA123BC", stato: "in_servizio", su_mezzo_id: null, assegnato_commessa: null }];
    stato.sulCantiere = [{
      mezzo_id: "m1", nome: "Ducato bianco", targa: "GA123BC", tipo: "furgone", rata_mensile: 450,
      periodi: [{ dal: "2026-09-20T06:00:00Z", al: null }], adesso: true,
    }];
    stato.costi = {
      documenti: [{ mezzo_id: "m1", categoria: "assicurazione", importo: 1200, data_scadenza: "2027-03-01", created_at: "2026-03-01T00:00:00Z" }],
      manutenzioni: [],
    };
    conRouter(<MezziCommessaCard orderId="o1" />);
    expect(screen.getByText("Qui adesso")).toBeTruthy();
    // 20-24 settembre: 5 giorni. (1.200 + 450 × 12) / 365 × 5 = 90,41 €.
    expect(screen.getByText(/5 giorni/)).toBeTruthy();
    expect(screen.getAllByText(/90,41/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Togli Ducato bianco dal cantiere" })).toBeTruthy();
  });

  it("chi non modifica il magazzino vede ma non sposta", () => {
    stato.permessi = { canViewWarehouse: true, canEditWarehouse: false, isAdmin: false, solaLettura: false };
    conRouter(<MezziCommessaCard orderId="o1" />);
    expect(screen.getByText("Qui adesso")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Togli/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Metti un mezzo/ })).toBeNull();
  });
});
