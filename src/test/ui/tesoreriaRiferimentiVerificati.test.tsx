// Tesoreria (15/11/2026): riferimenti verificati nelle impostazioni, rapporto col pagante dal
// conflitto del movimento, pannello «Niente contato due volte» del controllo di gestione.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), sbRpc: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("sonner", () => ({ toast: mock.toast }));
vi.mock("@/lib/finance/bankWorkspace", async (o) => ({ ...(await o<object>()), bankRpc: mock.rpc }));
vi.mock("@/lib/finance/bankExternalPayments", () => ({ syncBankExternalPayments: async (): Promise<string[]> => [] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.sbRpc } }));

import { FormPagante, RiferimentiVerificati } from "@/components/tesoreria/RiferimentiVerificati";
import { RigaEsitoMovimento, type EsitoMovimentoDati } from "@/components/tesoreria/EsitoMovimento";
import { ControlliDoppiCard } from "@/components/controllo-gestione/ui/ControlliDoppiCard";

const conClient = (n: ReactNode) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{n}</QueryClientProvider>;
beforeEach(() => { vi.clearAllMocks(); });

describe("Riferimenti verificati nelle impostazioni della tesoreria", () => {
  it("elenca IBAN e paganti, revoca, e un pagante nuovo chiede la prova", async () => {
    mock.rpc.mockImplementation(async (fn: string) => fn === "tesoreria_riferimenti_verificati"
      ? { iban_clienti: [{ id: "i1", cliente: "Omega Srl", chiave_fiscale: "01234567890", iban: "IT44C0000000000000000000044", confermato_at: "2026-11-15T10:00:00Z" }],
          paganti: [{ id: "p1", intestatario: "Mario Bianchi", pagante: "Immobiliare Verdi", iban: null, prova: "Delega del 01/11", created_at: "2026-11-15T10:00:00Z" }] }
      : null);
    render(conClient(<RiferimentiVerificati companyId="c" puoScrivere />));
    expect(await screen.findByText("Omega Srl")).toBeInTheDocument();
    expect(screen.getByText("Delega del 01/11")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revoca IBAN di Omega Srl" }));
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("tesoreria_revoca_iban_cliente", { p_company: "c", p_id: "i1" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    fireEvent.change(screen.getByLabelText("Intestatario delle fatture"), { target: { value: "Rossi Anna" } });
    fireEvent.change(screen.getByLabelText("Chi paga"), { target: { value: "Rossi Marco" } });
    const registra = screen.getByRole("button", { name: "Registra il rapporto" });
    expect(registra).toBeDisabled(); // senza prova no
    fireEvent.change(screen.getByLabelText("Prova del rapporto"), { target: { value: "Mail del 03/11" } });
    fireEvent.click(registra);
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("tesoreria_registra_pagante", {
      p_company: "c", p_soggetto_nome: "Rossi Anna", p_pagante_nome: "Rossi Marco", p_pagante_iban: null, p_prova: "Mail del 03/11",
    }));
  });

  it("chi non può scrivere vede ma non revoca né aggiunge", async () => {
    mock.rpc.mockResolvedValue({ iban_clienti: [{ id: "i1", cliente: "Omega Srl", chiave_fiscale: "x", iban: "IT44", confermato_at: "2026-11-15" }], paganti: [] });
    render(conClient(<RiferimentiVerificati companyId="c" puoScrivere={false} />));
    expect(await screen.findByText("Omega Srl")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revoca/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aggiungi" })).toBeNull();
  });
});

describe("Conflitto «pagante diverso» nel movimento", () => {
  it("«Registra il rapporto» apre il modulo già compilato con pagante, intestatario e IBAN", async () => {
    mock.rpc.mockResolvedValue("p9");
    const cambiato = vi.fn();
    const esito: EsitoMovimentoDati = { esito: "conflitto", natura: "documento", motivi: [], mancanti: [], candidati: [],
      conflitti: [{ titolo: "FT-2026-0077", motivi: ["Il pagante «Immobiliare Verdi» non è l'intestatario «Mario Bianchi» e non c'è un rapporto documentato"] }] };
    const movimento = { id: "tx", amount: 500, currency: "EUR", booking_date: "2026-11-13", debtor_iban: "IT77V0000000000000000000077", links: { remaining: 500 } } as never;
    render(<RigaEsitoMovimento company="c" movement={movimento} esito={esito} puoScrivere onCambiato={cambiato} />);
    fireEvent.click(screen.getByRole("button", { name: "Registra il rapporto" }));
    expect(screen.getByLabelText("Intestatario delle fatture")).toHaveValue("Mario Bianchi");
    expect(screen.getByLabelText("Chi paga")).toHaveValue("Immobiliare Verdi");
    expect(screen.getByLabelText("IBAN di chi paga (facoltativo)")).toHaveValue("IT77V0000000000000000000077");
    fireEvent.change(screen.getByLabelText("Prova del rapporto"), { target: { value: "Delega firmata" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Registra il rapporto" }).at(-1)!);
    await waitFor(() => expect(cambiato).toHaveBeenCalled());
    expect(mock.rpc).toHaveBeenCalledWith("tesoreria_registra_pagante", expect.objectContaining({ p_soggetto_nome: "Mario Bianchi", p_pagante_nome: "Immobiliare Verdi", p_prova: "Delega firmata" }));
  });
});

describe("Controllo di gestione: niente contato due volte", () => {
  it("mostra i rilievi con titolo, importo e cosa fare; senza rilievi lo dice", async () => {
    mock.sbRpc.mockResolvedValueOnce({ data: [{ controllo: "documento_oltre_totale", ids: ["d"], importo: 7333.37, descrizione: "Fattura 12: incassati 9000 € su 1666 €", cosa_fare: "Incassato il lordo: va stornata" }], error: null });
    const { unmount } = render(conClient(<ControlliDoppiCard />));
    expect(await screen.findByText("Fattura incassata oltre il totale")).toBeInTheDocument();
    expect(screen.getByText("Incassato il lordo: va stornata")).toBeInTheDocument();
    expect(mock.sbRpc).toHaveBeenCalledWith("cdg_controllo_doppi", { p_company: "c" });
    unmount();
    mock.sbRpc.mockResolvedValueOnce({ data: [], error: null });
    render(conClient(<ControlliDoppiCard />));
    expect(await screen.findByText("Nessun doppio conteggio trovato.")).toBeInTheDocument();
  });
});

describe("Revisione finale nell'interfaccia", () => {
  it("sulle uscite il rapporto si precompila con l'IBAN del beneficiario, non con quello dell'azienda", () => {
    const esito: EsitoMovimentoDati = { esito: "conflitto", natura: "documento", motivi: [], mancanti: [], candidati: [],
      conflitti: [{ titolo: "Fattura 515", motivi: ["Il beneficiario «Factor Spa» non è il fornitore «Lambda Srl» e non c'è un rapporto documentato"] }] };
    const uscita = { id: "u", amount: -300, currency: "EUR", debtor_iban: "IT00AZIENDA00000000000000001", creditor_iban: "IT99F0000000000000000000099", links: { remaining: 300 } } as never;
    render(<RigaEsitoMovimento company="c" movement={uscita} esito={esito} puoScrivere onCambiato={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Registra il rapporto" }));
    expect(screen.getByLabelText("Intestatario delle fatture")).toHaveValue("Lambda Srl");
    expect(screen.getByLabelText("Chi paga")).toHaveValue("Factor Spa");
    expect(screen.getByLabelText("IBAN di chi paga (facoltativo)")).toHaveValue("IT99F0000000000000000000099");
  });

  it("il pannello CdG tace solo senza permesso; gli altri errori li mostra", async () => {
    mock.sbRpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Non hai il permesso" } });
    const { container, unmount } = render(conClient(<ControlliDoppiCard />));
    await waitFor(() => expect(mock.sbRpc).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    unmount();
    mock.sbRpc.mockResolvedValueOnce({ data: null, error: { code: "57014", message: "statement timeout" } });
    render(conClient(<ControlliDoppiCard />));
    expect(await screen.findByText(/Controllo non riuscito: statement timeout/)).toBeInTheDocument();
  });

  it("due moduli del pagante nella stessa pagina hanno etichette distinte", () => {
    render(<><FormPagante companyId="c" onFatto={() => undefined} /><FormPagante companyId="c" onFatto={() => undefined} /></>);
    const campi = screen.getAllByLabelText("Chi paga");
    expect(campi).toHaveLength(2);
    expect(campi[0].id).not.toBe(campi[1].id);
  });
});
