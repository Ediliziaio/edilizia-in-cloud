import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("sonner", () => ({ toast: mock.toast }));
vi.mock("@/lib/finance/bankWorkspace", async (o) => ({ ...(await o<object>()), bankRpc: mock.rpc }));
vi.mock("@/lib/finance/bankExternalPayments", () => ({ syncBankExternalPayments: async (): Promise<string[]> => [] }));
import { AlternativeEsito, BadgeEsito, RigaEsitoMovimento, confermabile, type EsitoMovimentoDati } from "@/components/tesoreria/EsitoMovimento";

const movimento = { id: "tx", amount: -7800, currency: "EUR", booking_date: "2026-11-13", links: { remaining: 7800 } } as never;
const esito: EsitoMovimentoDati = {
  esito: "scelta", natura: "parziale", motivi: ["Controparte corrispondente"], mancanti: [], conflitti: [],
  candidati: [
    { chiave: "a", forza: "media", motivi: ["Pagamento parziale: resteranno 1160.00 €"], righe: [{ tipo: "scadenza", id: "s1", titolo: "Manodopera e ponteggio", residuo: 8960, quota: 7800 }] },
    { chiave: "b", forza: "debole", motivi: ["Giroconto"], righe: [{ tipo: "movimento", id: "m2", titolo: "Giroconto IVA", residuo: 7800, quota: 7800 }] },
  ],
};

beforeEach(() => { vi.clearAllMocks(); mock.rpc.mockResolvedValue({}); });

describe("esito del motore nel popup del movimento", () => {
  it("conferma un'alternativa con la conferma di sempre, passando la quota come importo", async () => {
    const fatto = vi.fn();
    render(<AlternativeEsito company="c" movement={movimento} esito={esito} puoAbbinare onAbbinato={fatto} />);
    expect(screen.getByText("2 alternative")).toBeInTheDocument();
    // Il giroconto non si conferma da qui: è un movimento, non una fattura o una scadenza.
    expect(screen.getByText("a mano")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Conferma Manodopera e ponteggio" }));
    await waitFor(() => expect(fatto).toHaveBeenCalled());
    expect(mock.rpc).toHaveBeenCalledWith("bank_conferma_ripartizione", {
      p_company: "c", p_tx: "tx", p_rows: [{ tipo: "scadenza", id: "s1", importo: 7800 }], p_note: null,
    });
  });

  it("si conferma solo con fatture o scadenze e quote positive", () => {
    expect(confermabile(esito.candidati![0])).toBe(true);
    expect(confermabile(esito.candidati![1])).toBe(false);
    expect(confermabile({ ...esito.candidati![0], righe: [{ tipo: "documento", id: "nc", titolo: "NC", residuo: 200, quota: -200 }] })).toBe(false);
  });

  it("scartare chiede il motivo e lo manda al motore", async () => {
    const cambiato = vi.fn();
    render(<RigaEsitoMovimento company="c" movement={movimento} esito={esito} puoScrivere onCambiato={cambiato} />);
    expect(screen.getByText("Da scegliere")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scarta proposta" }));
    const conferma = screen.getByRole("button", { name: "Scarta" });
    expect(conferma).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo dello scarto"), { target: { value: "Pagato in contanti" } });
    fireEvent.click(conferma);
    await waitFor(() => expect(cambiato).toHaveBeenCalled());
    expect(mock.rpc).toHaveBeenCalledWith("tesoreria_scarta_esito", { p_company: "c", p_tx: "tx", p_motivo: "Pagato in contanti" });
  });

  it("niente etichetta per i movimenti già collegati o con la proposta scartata", () => {
    const { container, rerender } = render(<BadgeEsito esito={{ ...esito, natura: "gia_riconciliato" }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<BadgeEsito esito={{ ...esito, scartato_at: "2026-11-15" }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<BadgeEsito esito={{ ...esito, esito: "conflitto" }} />);
    expect(screen.getByText("Conflitto")).toBeInTheDocument();
  });
});

import { erroreSenzaFattura } from "@/components/tesoreria/MovimentoSenzaFattura";
describe("errore di «Senza fattura» detto chiaro", () => {
  it("il debito già registrato dice cosa fare, con l'importo all'italiana", () => {
    const r = erroreSenzaFattura({ code: "23505", message: "Questa uscita salda un debito già registrato («Bolletta ottobre», 1300.00 €): collegala alla scadenza invece di registrare una spesa nuova, così il costo non si conta due volte." });
    expect(r.titolo).toBe("Questa uscita paga un debito che c'è già");
    expect(r.testo).toContain("1.300,00 €");
    expect(r.testo).toContain("scarta la proposta");
  });
  it("un errore tecnico non arriva grezzo", () => {
    const spia = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = erroreSenzaFattura({ code: "23505", message: "duplicate key value violates unique constraint \"x_pkey\"" });
    expect(r.testo).not.toMatch(/duplicate|constraint/);
    spia.mockRestore();
  });
  it("le frasi del database restano com'erano", () => {
    expect(erroreSenzaFattura({ code: "22023", message: "Scrivi di cosa si tratta." }).testo).toBe("Scrivi di cosa si tratta.");
  });
});
