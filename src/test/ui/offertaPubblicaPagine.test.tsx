import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Le pagine che il CLIENTE apre dal link dell'offerta: /offerta/<token>
 * (OffertaPubblica → QuoteSignPage) e /preventivo/<id>?token=… (AccettaPreventivo).
 *
 *  - Il link di firma mostra l'offerta, non «Offerta non trovata» (la rotta era
 *    presa dal checkout dei piani Edilizia in Cloud).
 *  - Le righe dicono cosa sono: un'opzione non è nel totale, una nota non ha prezzo.
 *  - Se la funzione dice «non valido» (già firmata altrove, scaduta) il tasto non
 *    resta muto e non scrive il codice: si dice, e si rilegge lo stato.
 *  - L'offerta già firmata o rifiutata non offre di nuovo il modulo di firma.
 */

const invoke = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

// Il checkout dei piani usa un menu a tendina (Radix) che in jsdom vuole questo.
class RidimensionaFinto { observe() {} unobserve() {} disconnect() {} }
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= RidimensionaFinto;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null as unknown }) }) }) }),
  },
}));
vi.mock("sonner", () => ({ toast }));
// I consensi di legge hanno i loro test: qui la pagina li considera raccolti.
vi.mock("@/components/firma/ConsensiFirmaBlock", async () => {
  const React = await import("react");
  return {
    ConsensiFirmaBlock: ({ onChange }: { onChange: (s: unknown) => void }): null => {
      React.useEffect(() => { onChange({ consensi: [], completo: true }); }, [onChange]);
      return null;
    },
  };
});

import OffertaPubblica from "@/pages/public/OffertaPubblica";
import AccettaPreventivo from "@/pages/public/AccettaPreventivo";

const TOKEN = "5f1c0a9e-7d2b-4c3a-8e11-0123456789ab";

const riga = (extra: Record<string, unknown>) => ({
  name: "Voce", description: null as string | null, quantity: 1, unit_of_measure: "pz", unit_price: 100, discount_percent: 0, vat_rate: 22,
  line_total: 100, item_type: "product", item_category: "prodotto", is_optional: false, mostra_nel_pdf: true, sort_order: 0, ...extra,
});

const righeDiProva = [
  riga({ name: "Finestra PVC", unit_price: 1000, line_total: 1000 }),
  riga({ name: "Posa in opera", item_category: "posa", unit_price: 200, line_total: 200 }),
  riga({ name: "Zanzariera in omaggio", is_optional: true, unit_price: 150, line_total: 150 }),
  riga({ name: "Subtotale parziale", item_category: "subtotale", unit_price: 0, line_total: 0 }),
  riga({ name: "Pagamento in tre rate", item_category: "nota", unit_price: 0, line_total: 0 }),
  riga({ name: "Riga riservata", mostra_nel_pdf: false }),
];

function vista(extra: Record<string, unknown> = {}, items: unknown[] = righeDiProva) {
  return {
    valid: true,
    status: "inviata",
    quote: {
      quote_number: "OFF-2026-042", title: "Serramenti Rossi", description: "", notes: "", client_name: "Mario Rossi", client_company: "",
      company_id: "c-1", expires_at: "2099-01-01T00:00:00.000Z", subtotal: 1200, discount_percent: 0, discount_amount: 0, vat_amount: 264,
      total: 1464, prezzo_manuale_attivo: false, created_at: "2026-10-01T10:00:00.000Z", signed_at: null as string | null, signed_by_name: null as string | null,
      refused_at: null as string | null, refused_reason: null as string | null,
    },
    items,
    company: { name: "Rossi Serramenti" },
    pdf_url: null as string | null,
    ...extra,
  };
}

/** La funzione finta: `view` risponde con lo stato corrente, le altre azioni con quello che il test decide. */
function funzione(stato: { corrente: Record<string, unknown> }, azioni: Record<string, () => unknown> = {}) {
  invoke.mockImplementation(async (_nome: string, { body }: { body: { action: string } }) => {
    if (body.action === "view") return { data: stato.corrente, error: null };
    if (azioni[body.action]) return azioni[body.action]();
    return { data: {}, error: null };
  });
}

function apriOfferta(percorso: string) {
  return render(
    <MemoryRouter initialEntries={[percorso]}>
      {/* Come in App.tsx: il Suspense dell'app copre il caricamento a richiesta delle pagine. */}
      <Suspense fallback={null}>
        <Routes><Route path="/offerta/:slug" element={<OffertaPubblica />} /></Routes>
      </Suspense>
    </MemoryRouter>,
  );
}
function apriPreventivo() {
  return render(
    <MemoryRouter initialEntries={[`/preventivo/q-1?token=${TOKEN}`]}>
      <Routes><Route path="/preventivo/:id" element={<AccettaPreventivo />} /></Routes>
    </MemoryRouter>,
  );
}

// Le due pagine dietro la rotta si caricano a richiesta (lazy): con la macchina sotto
// carico il primo caricamento supera il secondo di attesa di default. Si scaldano prima.
beforeAll(async () => {
  await import("@/pages/public/QuoteSignPage");
  await import("@/pages/OffertaCheckout");
}, 60_000);

beforeEach(() => { invoke.mockReset(); toast.error.mockReset(); toast.success.mockReset(); });
afterEach(cleanup);

describe("/offerta/<token>: il link di firma porta alla pagina di firma", () => {
  it("il token del preventivo mostra l'offerta, non «Offerta non trovata»", async () => {
    funzione({ corrente: vista() });
    apriOfferta(`/offerta/${TOKEN}`);
    expect(await screen.findByText("Serramenti Rossi", {}, { timeout: 15_000 })).toBeTruthy();
    expect(screen.queryByText("Offerta non trovata")).toBeNull();
    expect(invoke).toHaveBeenCalledWith("quote-sign", { body: { token: TOKEN, action: "view" } });
  });

  it("lo slug di un piano (/offerta/clienti-marketing) mostra ancora il checkout, senza chiamare la firma", async () => {
    funzione({ corrente: vista() });
    apriOfferta("/offerta/clienti-marketing");
    expect(await screen.findByText("Piano Pro", {}, { timeout: 15_000 })).toBeTruthy();
    expect(invoke).not.toHaveBeenCalledWith("quote-sign", expect.anything());
  });

  it("un valore che non è né token né piano: «Offerta non trovata»", async () => {
    funzione({ corrente: vista() });
    apriOfferta("/offerta/boh");
    expect(await screen.findByText("Offerta non trovata", {}, { timeout: 15_000 })).toBeTruthy();
  });
});

describe("pagina di firma (/offerta/<token>): le righe dicono cosa sono", () => {
  it("opzione detta tale e fuori dal totale; nota senza prezzo; subtotale e riga riservata non si vedono; la posa è figlia", async () => {
    funzione({ corrente: vista() });
    apriOfferta(`/offerta/${TOKEN}`);
    await screen.findByText("Finestra PVC");

    expect(screen.getByText("Opzionale")).toBeTruthy();
    expect(screen.getByText("non incluso")).toBeTruthy();
    expect(screen.getByText(/non sono incluse nel subtotale/)).toBeTruthy();
    expect(screen.getByText("Pagamento in tre rate")).toBeTruthy();
    expect(screen.getByText(/└ Posa in opera/)).toBeTruthy();
    expect(screen.queryByText("Subtotale parziale")).toBeNull();
    expect(screen.queryByText("Riga riservata")).toBeNull();
    // La nota occupa una riga a sé: nessun «0,00 €» e nessun «22%» accanto.
    const cellaNota = screen.getByText("Pagamento in tre rate").closest("tr")!;
    expect(cellaNota.textContent).toBe("Pagamento in tre rate");
  });

  it("senza opzioni non compare né la scritta né la nota sotto la tabella", async () => {
    funzione({ corrente: vista({}, [riga({ name: "Finestra PVC" })]) });
    apriOfferta(`/offerta/${TOKEN}`);
    await screen.findByText("Finestra PVC");
    expect(screen.queryByText("Opzionale")).toBeNull();
    expect(screen.queryByText(/non sono incluse nel subtotale/)).toBeNull();
  });
});

describe("pagina di firma: se la funzione dice «non valido» il cliente lo sa", () => {
  async function firma() {
    await screen.findByText("Finestra PVC");
    fireEvent.change(screen.getByPlaceholderText("Mario Rossi"), { target: { value: "Mario Rossi" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Accetta Offerta/ }));
  }

  it("già firmata da un'altra scheda: avviso in italiano e la pagina rilegge lo stato («Offerta Accettata»)", async () => {
    const stato: { corrente: Record<string, unknown> } = { corrente: vista() };
    funzione(stato, {
      sign: () => {
        stato.corrente = vista({ status: "accettata", quote: { ...vista().quote, signed_by_name: "Mario Rossi", signed_at: "2026-10-06T08:00:00.000Z" } });
        return { data: { valid: false, reason: "already_signed", status: "accettata" }, error: null };
      },
    });
    apriOfferta(`/offerta/${TOKEN}`);
    await firma();
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error.mock.calls[0][0]).toBe("Questa offerta è già stata accettata.");
    expect(await screen.findByText("Offerta Accettata")).toBeTruthy();
  });

  it("scaduta nel frattempo: l'avviso dice la scadenza, non il codice, e la pagina mostra «Offerta Scaduta»", async () => {
    const stato: { corrente: Record<string, unknown> } = { corrente: vista() };
    funzione(stato, {
      sign: () => {
        stato.corrente = { valid: false, reason: "expired" };
        return { data: { valid: false, reason: "expired" }, error: null };
      },
    });
    apriOfferta(`/offerta/${TOKEN}`);
    await firma();
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error.mock.calls[0][0]).toMatch(/validità/);
    expect(await screen.findByText("Offerta Scaduta")).toBeTruthy();
  });

  it("errore HTTP con la frase nel corpo (consensi mancanti): si mostra la frase, non il generico «non-2xx»", async () => {
    funzione({ corrente: vista() }, {
      sign: () => ({
        data: null,
        error: { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ error: "consensi_mancanti", message: "Per firmare devi accettare le clausole indicate." }) } },
      }),
    });
    apriOfferta(`/offerta/${TOKEN}`);
    await firma();
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error.mock.calls[0][0]).toBe("Per firmare devi accettare le clausole indicate.");
  });

  it("la firma riuscita mostra ancora «Offerta Accettata» (nessun avviso d'errore)", async () => {
    funzione({ corrente: vista() }, { sign: () => ({ data: { success: true }, error: null }) });
    apriOfferta(`/offerta/${TOKEN}`);
    await firma();
    expect(await screen.findByText("Offerta Accettata")).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("pagina di firma: uno stato che non si firma non si spaccia per «in attesa»", () => {
  it("un'offerta annullata dall'azienda si dice «Annullata», senza modulo di firma", async () => {
    funzione({ corrente: vista({ status: "annullata" }) });
    apriOfferta(`/offerta/${TOKEN}`);
    await screen.findByText("Finestra PVC");
    expect(screen.getByText("Annullata")).toBeTruthy();
    expect(screen.queryByText("In attesa di firma")).toBeNull();
    expect(screen.queryByRole("button", { name: /Accetta Offerta/ })).toBeNull();
  });
  it("l'inviata resta «In attesa di firma» con il modulo", async () => {
    funzione({ corrente: vista() });
    apriOfferta(`/offerta/${TOKEN}`);
    await screen.findByText("Finestra PVC");
    expect(screen.getByText("In attesa di firma")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Accetta Offerta/ })).toBeTruthy();
  });
});

describe("pagina /preventivo/<id>?token=…: lo stato vero e le frasi", () => {
  it("già accettata: dice che è già accettata e non offre il modulo di firma", async () => {
    funzione({ corrente: vista({ status: "accettata" }) });
    apriPreventivo();
    expect(await screen.findByText("Preventivo Accettato")).toBeTruthy();
    expect(screen.getByText("Questo preventivo è già stato accettato.")).toBeTruthy();
    expect(screen.queryByText("Firma il preventivo")).toBeNull();
  });

  it("già diventata commessa vale come accettata", async () => {
    funzione({ corrente: vista({ status: "convertita" }) });
    apriPreventivo();
    expect(await screen.findByText("Questo preventivo è già stato accettato.")).toBeTruthy();
  });

  it("già rifiutata: dice che è già rifiutata", async () => {
    funzione({ corrente: vista({ status: "rifiutata" }) });
    apriPreventivo();
    expect(await screen.findByText("Preventivo Rifiutato")).toBeTruthy();
    expect(screen.getByText(/già stato rifiutato/)).toBeTruthy();
  });

  it("annullata: «Link non valido» con una frase, senza modulo", async () => {
    funzione({ corrente: vista({ status: "annullata" }) });
    apriPreventivo();
    expect(await screen.findByText("Link non valido")).toBeTruthy();
    expect(screen.getByText(/non si può più accettare o rifiutare/)).toBeTruthy();
    expect(screen.queryByText("Firma il preventivo")).toBeNull();
  });

  it("scaduta: la frase italiana, non il codice «expired»", async () => {
    funzione({ corrente: { valid: false, reason: "expired" } });
    apriPreventivo();
    expect(await screen.findByText(/ha superato la data di validità/)).toBeTruthy();
    expect(screen.queryByText("expired")).toBeNull();
  });

  it("le righe: opzione detta tale, nota senza prezzo, subtotale e riga riservata nascosti", async () => {
    funzione({ corrente: vista() });
    apriPreventivo();
    await screen.findByText("Finestra PVC");
    expect(screen.getByText("Opzionale")).toBeTruthy();
    expect(screen.getByText("non incluso")).toBeTruthy();
    expect(screen.getByText("Pagamento in tre rate")).toBeTruthy();
    expect(screen.queryByText("Subtotale parziale")).toBeNull();
    expect(screen.queryByText("Riga riservata")).toBeNull();
  });

  it("firma rifiutata perché già firmata altrove: la pagina rilegge lo stato invece di scrivere «already_signed»", async () => {
    const stato: { corrente: Record<string, unknown> } = { corrente: vista() };
    funzione(stato, {
      sign: () => {
        stato.corrente = vista({ status: "accettata" });
        return { data: { valid: false, reason: "already_signed", status: "accettata" }, error: null };
      },
    });
    apriPreventivo();
    await screen.findByText("Finestra PVC");
    fireEvent.change(screen.getByPlaceholderText("Es. Mario Rossi"), { target: { value: "Mario Rossi" } });
    fireEvent.click(screen.getByRole("button", { name: /Accetto e firmo il preventivo/ }));
    expect(await screen.findByText("Questo preventivo è già stato accettato.")).toBeTruthy();
    expect(screen.queryByText("already_signed")).toBeNull();
  });

  it("errore del server durante la firma: «Operazione non riuscita» (non «Link non valido») e si può riprovare", async () => {
    funzione({ corrente: vista() }, {
      sign: () => ({ data: null, error: { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ error: "La firma non è stata registrata: riprova tra qualche istante." }) } } }),
    });
    apriPreventivo();
    await screen.findByText("Finestra PVC");
    fireEvent.change(screen.getByPlaceholderText("Es. Mario Rossi"), { target: { value: "Mario Rossi" } });
    fireEvent.click(screen.getByRole("button", { name: /Accetto e firmo il preventivo/ }));
    expect(await screen.findByText("Operazione non riuscita")).toBeTruthy();
    expect(screen.getByText("La firma non è stata registrata: riprova tra qualche istante.")).toBeTruthy();
    expect(screen.queryByText("Link non valido")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Firma il preventivo")).toBeTruthy();
  });

  it("la funzione irraggiungibile: non resta sul caricamento per sempre, e «Riprova» ricarica", async () => {
    invoke.mockRejectedValueOnce(new Error("Failed to fetch"));
    apriPreventivo();
    expect(await screen.findByText("Operazione non riuscita")).toBeTruthy();
    expect(screen.getByText(/Controlla la connessione/)).toBeTruthy();
    invoke.mockImplementation(async () => ({ data: vista(), error: null }));
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Firma il preventivo")).toBeTruthy();
  });
});
