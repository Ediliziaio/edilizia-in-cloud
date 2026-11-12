/**
 * La scheda Listino di un fornitore con piu' listini.
 *
 * Due cose che prima non funzionavano, viste su un'azienda vera il 12/11/2026:
 * la scheda mostrava solo il primo listino attivo (un fornitore ne aveva due,
 * 42 voci visibili su 64) e non diceva mai che un listino era scaduto o stava
 * per scadere, mentre i prezzi venivano suggeriti comunque.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  listini: [] as Array<Record<string, unknown>>,
  voci: {} as Record<string, Array<Record<string, unknown>>>,
  aggiornamenti: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-di-prova" }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canManageSuppliers: true }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  // Catena finta: raccoglie i filtri come il vero client, compreso
  // `.eq("attivo", true)` — senza quello il test non vedrebbe che i listini
  // disattivati restano fuori dalla tendina.
  const costruisci = (tabella: string) => {
    let listinoId = "";
    let soloAttivi = false;
    const q: Record<string, unknown> = {
      select: () => q,
      update: (patch: Record<string, unknown>) => { m.aggiornamenti.push(patch); return q; },
      eq: (campo: string, valore: unknown) => {
        if (campo === "listino_id") listinoId = String(valore);
        if (campo === "attivo" && valore === true) soloAttivi = true;
        return q;
      },
      order: () => q,
      then: (ok: (r: { data: unknown; error: null }) => unknown) => {
        const dati = tabella === "listini_fornitore"
          ? (soloAttivi ? m.listini.filter((l) => l.attivo !== false) : m.listini)
          : (m.voci[listinoId] ?? []);
        return Promise.resolve({ data: dati, error: null }).then(ok);
      },
    };
    return q;
  };
  return { supabase: { from: (t: string) => costruisci(t) } };
});

import { ListinoFornitoreTab } from "@/components/suppliers/ListinoFornitoreTab";

const apri = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ListinoFornitoreTab supplierId="fornitore-di-prova" />
  </QueryClientProvider>,
);

beforeEach(() => {
  // jsdom non ha scrollIntoView, che la tendina di Radix chiama all'apertura.
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 10, 12, 10, 0, 0)); // 12 novembre 2026, ora locale
  m.listini = [];
  m.voci = {};
  m.aggiornamenti = [];
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe("scheda Listino del fornitore", () => {
  it("con due listini li mostra entrambi nella tendina e apre quello in vigore", async () => {
    m.listini = [
      { id: "contratto", nome: "Contratto 2026 · cantiere A", sconto_default_pct: 0, valido_dal: "2026-06-18", valido_al: null, attivo: true },
      { id: "laterizi", nome: "Listino 2024 · laterizi", sconto_default_pct: 0, valido_dal: "2024-02-01", valido_al: null, attivo: true },
    ];
    m.voci = {
      contratto: [{ id: "v1", codice: "C1", descrizione: "Blocco rettificato 25", unita: "mq", prezzo: 24.5, sconto_pct: 0 }],
      laterizi: [{ id: "v2", codice: "L1", descrizione: "Tavella 25x50", unita: "pz", prezzo: 1.2, sconto_pct: 0 }],
    };
    apri();
    await waitFor(() => expect(screen.getByText("2 listini per questo fornitore:")).toBeInTheDocument());
    // Si apre il piu' recente fra quelli in vigore, non il primo creato.
    expect(screen.getByDisplayValue("Blocco rettificato 25")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Tavella 25x50")).not.toBeInTheDocument();
  });

  it("un solo listino: nessuna tendina da scegliere", async () => {
    m.listini = [{ id: "solo", nome: "Listino 2026", sconto_default_pct: 0, valido_dal: "2026-01-01", valido_al: null, attivo: true }];
    m.voci = { solo: [{ id: "v", codice: "", descrizione: "Sabbia lavata", unita: "mc", prezzo: 18, sconto_pct: 0 }] };
    apri();
    await waitFor(() => expect(screen.getByDisplayValue("Sabbia lavata")).toBeInTheDocument());
    expect(screen.queryByText(/listini per questo fornitore/)).not.toBeInTheDocument();
  });

  it("il listino scaduto lo dice, e dice che i prezzi si propongono come non aggiornati", async () => {
    m.listini = [{ id: "vecchio", nome: "Listino 2025", sconto_default_pct: 0, valido_dal: "2025-01-01", valido_al: "2025-12-31", attivo: true }];
    m.voci = { vecchio: [{ id: "v", codice: "", descrizione: "Stabilizzato", unita: "t", prezzo: 9, sconto_pct: 0 }] };
    apri();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("scaduto il 31/12/2025"));
    expect(screen.getByRole("status")).toHaveTextContent("vengono proposti lo stesso, segnalati come non aggiornati");
  });

  it("il listino che scade entro un mese avvisa prima, con la data", async () => {
    // Il contratto di fornitura del calcestruzzo: attivo, scade il 30/11/2026.
    m.listini = [{ id: "contratto", nome: "Contratto 2026 · cantiere B", sconto_default_pct: 0, valido_dal: "2026-05-13", valido_al: "2026-11-30", attivo: true }];
    m.voci = { contratto: [{ id: "v", codice: "", descrizione: "Calcestruzzo C25/30", unita: "mc", prezzo: 95, sconto_pct: 0 }] };
    apri();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Scade il 30/11/2026"));
    expect(screen.getByRole("status")).not.toHaveTextContent("scaduto il");
  });

  it("i listini disattivati restano fuori: la scheda si comporta come se non ci fossero", async () => {
    // In produzione ci sono decine di listini spenti con centinaia di voci:
    // farli comparire qui vorrebbe dire salvare dentro un listino che non
    // suggerisce prezzi.
    m.listini = [{ id: "spento", nome: "Listino vecchio", sconto_default_pct: 0, valido_dal: null, valido_al: null, attivo: false }];
    m.voci = { spento: [{ id: "v", codice: "", descrizione: "Voce di un listino spento", unita: "pz", prezzo: 3, sconto_pct: 0 }] };
    apri();
    await waitFor(() => expect(screen.getByText(/Nessuna voce/)).toBeInTheDocument());
    expect(screen.queryByDisplayValue("Voce di un listino spento")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/listini per questo fornitore/)).not.toBeInTheDocument();
  });

  it("fornitore senza nessun listino: scheda vuota, niente avvisi, niente date", async () => {
    m.listini = [];
    apri();
    await waitFor(() => expect(screen.getByText(/Nessuna voce/)).toBeInTheDocument());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("In vigore dal")).not.toBeInTheDocument();
  });

  it("la data di scadenza si corregge da qui: senza questo campo l'avviso chiedeva l'impossibile", async () => {
    m.listini = [{ id: "contratto", nome: "Contratto 2026", sconto_default_pct: 0, valido_dal: "2026-05-13", valido_al: "2026-11-30", attivo: true }];
    m.voci = { contratto: [{ id: "v", codice: "", descrizione: "Calcestruzzo C25/30", unita: "mc", prezzo: 95, sconto_pct: 0 }] };
    apri();
    const al = await screen.findByLabelText("fino al");
    expect(al).toHaveValue("2026-11-30");
    fireEvent.change(al, { target: { value: "2027-06-30" } });
    fireEvent.blur(al);
    await waitFor(() => expect(m.aggiornamenti).toEqual([{ valido_al: "2027-06-30" }]));
  });

  it("mentre si riscrive una data il vuoto di passaggio non cancella la scadenza", async () => {
    // Il campo passa dal vuoto a ogni correzione: salvare subito vorrebbe dire
    // mettere il listino «senza scadenza» e rimetterlo in corso per sbaglio.
    m.listini = [{ id: "l", nome: "Listino", sconto_default_pct: 0, valido_dal: "2026-01-01", valido_al: "2026-12-31", attivo: true }];
    m.voci = { l: [] };
    apri();
    const al = await screen.findByLabelText("fino al");
    fireEvent.change(al, { target: { value: "" } });
    fireEvent.change(al, { target: { value: "2027-12-31" } });
    expect(m.aggiornamenti).toEqual([]);
    fireEvent.blur(al);
    await waitFor(() => expect(m.aggiornamenti).toEqual([{ valido_al: "2027-12-31" }]));
  });

  it("date incrociate: non si salvano e il campo torna com'era", async () => {
    // Il database non ha un CHECK su dal <= al: senza questa guardia il
    // listino diventerebbe scaduto in silenzio appena salvato.
    m.listini = [{ id: "l", nome: "Listino", sconto_default_pct: 0, valido_dal: "2026-01-01", valido_al: "2026-12-31", attivo: true }];
    m.voci = { l: [] };
    apri();
    const dal = await screen.findByLabelText("In vigore dal");
    fireEvent.change(dal, { target: { value: "2027-06-30" } });
    fireEvent.blur(dal);
    await waitFor(() => expect(dal).toHaveValue("2026-01-01"));
    expect(m.aggiornamenti).toEqual([]);
  });

  it("lasciare il campo senza averlo cambiato non scrive niente nel database", async () => {
    m.listini = [{ id: "l", nome: "Listino", sconto_default_pct: 0, valido_dal: "2026-01-01", valido_al: "2026-12-31", attivo: true }];
    m.voci = { l: [] };
    apri();
    fireEvent.blur(await screen.findByLabelText("fino al"));
    await waitFor(() => expect(screen.getByLabelText("fino al")).toHaveValue("2026-12-31"));
    expect(m.aggiornamenti).toEqual([]);
  });

  it("svuotare la scadenza vuol dire «senza scadenza», non una data vuota", async () => {
    m.listini = [{ id: "l", nome: "Listino", sconto_default_pct: 0, valido_dal: "2026-01-01", valido_al: "2026-12-31", attivo: true }];
    m.voci = { l: [] };
    apri();
    const al = await screen.findByLabelText("fino al");
    fireEvent.change(al, { target: { value: "" } });
    fireEvent.blur(al);
    await waitFor(() => expect(m.aggiornamenti).toEqual([{ valido_al: null }]));
    expect(screen.getByText("senza scadenza")).toBeInTheDocument();
  });

  it("cambiando listino con voci non salvate chiede conferma invece di perderle", async () => {
    m.listini = [
      { id: "a", nome: "Listino A", sconto_default_pct: 0, valido_dal: "2026-02-01", valido_al: null, attivo: true },
      { id: "b", nome: "Listino B", sconto_default_pct: 0, valido_dal: "2025-02-01", valido_al: null, attivo: true },
    ];
    m.voci = {
      a: [{ id: "va", codice: "A1", descrizione: "Voce A", unita: "pz", prezzo: 1, sconto_pct: 0 }],
      b: [{ id: "vb", codice: "B1", descrizione: "Voce B", unita: "pz", prezzo: 2, sconto_pct: 0 }],
    };
    apri();
    const desc = await screen.findByDisplayValue("Voce A");
    fireEvent.change(desc, { target: { value: "Voce A corretta a mano" } });

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Listino B"));
    expect(await screen.findByText("Modifiche non salvate")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Voce A corretta a mano")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Resta qui" }));
    await waitFor(() => expect(screen.queryByText("Modifiche non salvate")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("Voce A corretta a mano")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Listino B"));
    fireEvent.click(await screen.findByRole("button", { name: "Cambia e perdi le modifiche" }));
    await waitFor(() => expect(screen.getByDisplayValue("Voce B")).toBeInTheDocument());
    // Le date devono seguire il listino scelto: se restassero quelle di prima,
    // una correzione scriverebbe sul listino giusto una data presa da un altro.
    expect(screen.getByLabelText("In vigore dal")).toHaveValue("2025-02-01");
  });

  it("scegliendo il listino scaduto dalla tendina compare l'avviso e cambiano le voci", async () => {
    m.listini = [
      { id: "nuovo", nome: "Listino 2026", sconto_default_pct: 0, valido_dal: "2026-02-01", valido_al: null, attivo: true },
      { id: "vecchio", nome: "Listino 2025", sconto_default_pct: 0, valido_dal: "2025-01-01", valido_al: "2025-12-31", attivo: true },
    ];
    m.voci = {
      nuovo: [{ id: "a", codice: "", descrizione: "Inerte 0-30 nuovo", unita: "t", prezzo: 11, sconto_pct: 0 }],
      vecchio: [{ id: "b", codice: "", descrizione: "Inerte 0-30 vecchio", unita: "t", prezzo: 9, sconto_pct: 0 }],
    };
    apri();
    await waitFor(() => expect(screen.getByDisplayValue("Inerte 0-30 nuovo")).toBeInTheDocument());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Listino 2025 — scaduto il 31/12/2025"));

    await waitFor(() => expect(screen.getByDisplayValue("Inerte 0-30 vecchio")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("scaduto il 31/12/2025");
  });
});
